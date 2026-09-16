<script setup>
import {computed, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue'
import AppDetailPage from '../components/AppDetailPage.vue'
import AppIcon from '../components/AppIcon.vue'
import AppModal from '../components/AppModal.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailSection from '../components/DetailSection.vue'
import ListFilters from '../components/ListFilters.vue'
import ListPagination from '../components/ListPagination.vue'
import SearchInput from '../components/SearchInput.vue'
import StatusBadge from '../components/StatusBadge.vue'
import {formatDateTime} from '../date-time.mjs'
import {FILE_CONTENT_MODES, FILE_TIME_SOURCES, fileTimeSourceDescription} from '../file-rule-presets.mjs'
import {analyzeFileRuleSample, readLocalFileSample} from '../file-rule-sample.mjs'
import {useListState} from '../list-state.mjs'
import {setRoute} from '../page-route.mjs'
import {copyFileRuleTemplate} from '../file-rule-template.mjs'
import * as api from '../api'

const props = defineProps({
  templates: {type: Array, default: () => []},
  messages: {type: Array, default: () => []},
  routeId: {type: String, default: ''},
  pendingActions: {type: Object, default: () => new Set()},
  canManage: {type: Boolean, default: false}
})
const emit = defineEmits(['create', 'update', 'remove', 'notify', 'editing-state'])
const {keyword, status: statusFilter, page, pageSize} = useListState('fileRules')
const dialog = ref('')
const copying = ref(false)
const selectedId = ref('')
const editorId = ref('')
const activeStep = ref('basic')
const error = ref('')
const savedSnapshot = ref('')
const form = reactive(emptyForm())
const sourceOptions = ref([])
const dataItemOptions = ref([])
const elementOptions = ref([])
const sourceKeyword = ref('')
const dataItemKeyword = ref('')
const elementKeyword = ref('')
const catalogLoading = reactive({sources: false, dataItems: false, elements: false})
const sampleInput = ref(null)
const sampleLoading = ref(false)
const sampleResult = ref(null)
const parserModes = [['DELIMITED', '表格 / 分隔文本'], ['KEY_VALUE', '键值文本'], ['POSITIONAL_TEXT', '无表头文本定位'], ['FIXED_WIDTH', '定长文本'], ['PASSTHROUGH', '内容原样复制']]
const steps = [['basic', '基本信息'], ['binding', '三要素绑定'], ['sample', '样例与解析'], ['rules', '时间替换规则']]
const selectedElementCodes = computed(() => new Set(form.elements.map(item => item.code)))
const selected = computed(() => props.templates.find(item => item.id === selectedId.value))
const editingTemplate = computed(() => props.templates.find(item => item.id === editorId.value))
const pendingKey = computed(() => editorId.value && editorId.value !== 'new' ? `update:file-rule-templates:${editorId.value}` : 'create:file-rule-templates')
const isPending = computed(() => props.pendingActions.has(pendingKey.value))
const parserModeLabel = value => parserModes.find(item => item[0] === value)?.[1] || value || '未配置'
const contentModeLabel = value => FILE_CONTENT_MODES.find(item => item[0] === value)?.[1] || value || '未配置'
const referencesOf = template => template?.id
  ? props.messages.filter(message => message.fileGeneration?.ruleTemplateId === template.id)
  : []
const referenceNames = template => referencesOf(template).map(message => message.name || message.id).filter(Boolean)

const orderedTemplates = computed(() => [...props.templates].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))))
const filteredTemplates = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return orderedTemplates.value.filter(template => {
    const binding = template.binding || {}
    const searchable = [template.name, template.description, binding.sourceCode, binding.sourceName, binding.dataItemCode, binding.dataItemName].join(' ').toLowerCase()
    return (statusFilter.value === 'ALL' || template.status === statusFilter.value) && (!query || searchable.includes(query))
  })
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredTemplates.value.length / pageSize.value)))
const visibleTemplates = computed(() => filteredTemplates.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

const reviewIssues = computed(() => {
  const issues = []
  if (!form.name.trim()) issues.push({step: 'basic', message: '填写模板名称'})
  if (!form.sourceCode || !form.dataItemCode || !form.elements.length) issues.push({step: 'binding', message: '完成数据源、数据项和要素项绑定'})
  if (!hasExecutableRule()) issues.push({step: 'rules', message: ruleIssueMessage()})
  return issues
})
const completedStepCount = computed(() => steps.length - new Set(reviewIssues.value.map(issue => issue.step)).size)
const currentStepIndex = computed(() => steps.findIndex(step => step[0] === activeStep.value))
const hasPreviousStep = computed(() => currentStepIndex.value > 0)
const hasNextStep = computed(() => currentStepIndex.value >= 0 && currentStepIndex.value < steps.length - 1)
const stepIssueCount = step => reviewIssues.value.filter(issue => issue.step === step).length
const currentSnapshot = () => JSON.stringify(form)
const isEditorDirty = computed(() => Boolean(props.routeId) && Boolean(savedSnapshot.value) && currentSnapshot() !== savedSnapshot.value)

watch(totalPages, value => { if (page.value > value) page.value = value })
watch(isEditorDirty, value => emit('editing-state', value), {immediate: true, flush: 'sync'})
watch(() => props.routeId, routeId => {
  if (!routeId) { editorId.value = ''; return }
  if (routeId === 'new') {
    if (editorId.value !== 'new') startNewEditor()
    return
  }
  const template = props.templates.find(item => item.id === routeId)
  if (template && editorId.value !== routeId) loadEditor(template)
}, {immediate: true})

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  if (props.routeId) loadSourceOptions()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  emit('editing-state', false)
})

function emptyForm() {
  return {
    name: '', status: 'DRAFT', description: '', sourceCode: '', sourceName: '', dataItemCode: '', dataItemName: '', elements: [],
    fileNamePattern: '', firstLineContains: '', sourceFileName: '', parserMode: 'DELIMITED', encoding: 'AUTO', delimiter: 'AUTO',
    fileNameBindings: [], contentBindings: [], version: 1
  }
}
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function templateForm(template) {
  const binding = template.binding || {}
  const parserMode = template.rule?.parserMode || 'DELIMITED'
  const elements = Array.isArray(binding.elements) && binding.elements.length
    ? clone(binding.elements)
    : (binding.elementCodes || []).map(code => ({id: code, code, name: ''}))
  const contentBindings = clone(template.rule?.contentBindings || []).map(item => parserMode === 'POSITIONAL_TEXT' && !item.locator
    ? {...item, locator: {type: 'TOKEN_COLUMN', columnIndex: 0, separator: 'WHITESPACE', header: false}}
    : item)
  return {
    ...emptyForm(), name: template.name || '', status: template.status || 'DRAFT', description: template.description || '',
    sourceCode: binding.sourceCode || '', sourceName: binding.sourceName || '', dataItemCode: binding.dataItemCode || '', dataItemName: binding.dataItemName || '', elements,
    fileNamePattern: template.match?.fileNamePattern || '', firstLineContains: template.match?.firstLineContains || '',
    sourceFileName: template.rule?.sourceFileName || '', parserMode, encoding: template.rule?.encoding || 'AUTO', delimiter: template.rule?.delimiter || 'AUTO',
    fileNameBindings: clone(template.rule?.fileNameBindings || []), contentBindings, version: Number(template.version || 1)
  }
}
function resetCatalog() {
  sourceKeyword.value = form.sourceCode
  dataItemKeyword.value = form.dataItemCode
  elementKeyword.value = ''
  dataItemOptions.value = []
  elementOptions.value = []
}
async function loadEditor(template) {
  editorId.value = template.id
  error.value = ''
  sampleResult.value = null
  activeStep.value = 'basic'
  Object.assign(form, templateForm(template))
  resetCatalog()
  savedSnapshot.value = currentSnapshot()
  await Promise.all([loadSourceOptions(), loadDataItemOptions(), loadElementOptions()])
}
function startNewEditor() {
  editorId.value = 'new'
  error.value = ''
  sampleResult.value = null
  activeStep.value = 'basic'
  Object.assign(form, emptyForm())
  resetCatalog()
  savedSnapshot.value = currentSnapshot()
  loadSourceOptions()
}
function openCreate() { startNewEditor(); setRoute('file-rules', 'new') }
function copyTemplate(template) {
  if (!props.canManage || copying.value) return
  copying.value = true
  emit('create', copyFileRuleTemplate(template), created => {
    copying.value = false
    openEdit(created)
  }, message => {
    copying.value = false
    emit('notify', message || '复制失败，请重试', 'error')
  })
}
function openDetail(template) { selectedId.value = template.id; dialog.value = 'detail' }
function openEdit(template) { loadEditor(template); setRoute('file-rules', template.id, true) }
function requestDelete(template) { selectedId.value = template.id; dialog.value = 'delete' }
function closeEditor() {
  savedSnapshot.value = currentSnapshot()
  emit('editing-state', false)
  setRoute('file-rules')
}
function confirmEditorClose() {
  return !isEditorDirty.value || window.confirm('当前文件规则模板尚未保存，离开后修改将丢失。是否继续离开？')
}
function warnBeforeUnload(event) {
  if (!isEditorDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function loadSourceOptions() {
  catalogLoading.sources = true
  try { sourceOptions.value = await api.searchDataSourceOptions(sourceKeyword.value, 20) }
  catch (exception) { error.value = exception.message }
  finally { catalogLoading.sources = false }
}
async function loadDataItemOptions() {
  if (!form.sourceCode) { dataItemOptions.value = []; return }
  catalogLoading.dataItems = true
  try { dataItemOptions.value = await api.searchDataItemOptions(form.sourceCode, dataItemKeyword.value, 20) }
  catch (exception) { error.value = exception.message }
  finally { catalogLoading.dataItems = false }
}
async function loadElementOptions() {
  if (!form.sourceCode || !form.dataItemCode) { elementOptions.value = []; return }
  catalogLoading.elements = true
  try { elementOptions.value = await api.searchElementOptions(form.dataItemCode, form.sourceCode, elementKeyword.value, 50) }
  catch (exception) { error.value = exception.message }
  finally { catalogLoading.elements = false }
}
function chooseDataSource(item) {
  if (form.sourceCode === item.code) return
  Object.assign(form, {sourceCode: item.code, sourceName: item.name || '', dataItemCode: '', dataItemName: '', elements: []})
  dataItemKeyword.value = ''; elementKeyword.value = ''; dataItemOptions.value = []; elementOptions.value = []
  loadDataItemOptions()
}
function chooseDataItem(item) {
  if (form.dataItemCode === item.code) return
  Object.assign(form, {dataItemCode: item.code, dataItemName: item.name || '', elements: []})
  elementKeyword.value = ''; elementOptions.value = []
  loadElementOptions()
}
function isElementSelected(item) { return selectedElementCodes.value.has(item.code) }
function toggleElement(item) {
  const index = form.elements.findIndex(element => element.code === item.code)
  if (index >= 0) form.elements.splice(index, 1)
  else form.elements.push({...item})
}
function toggleAllElements() {
  const visibleCodes = new Set(elementOptions.value.map(item => item.code))
  const allSelected = elementOptions.value.length && elementOptions.value.every(isElementSelected)
  const retained = form.elements.filter(item => !visibleCodes.has(item.code))
  form.elements = allSelected ? retained : [...retained, ...elementOptions.value.filter(item => !selectedElementCodes.value.has(item.code)).map(item => ({...item}))]
}

async function uploadSample(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if ((form.fileNameBindings.length || form.contentBindings.length || sampleResult.value)
    && !window.confirm('识别样例将替换当前解析方式和时间规则。是否继续？')) {
    event.target.value = ''
    return
  }
  sampleLoading.value = true
  error.value = ''
  try {
    const sample = await readLocalFileSample(file)
    const result = analyzeFileRuleSample(sample)
    Object.assign(form, {
      sourceFileName: sample.fileName, parserMode: result.parserMode, encoding: result.encoding, delimiter: result.delimiter,
      fileNameBindings: clone(result.fileNameBindings), contentBindings: clone(result.contentBindings)
    })
    sampleResult.value = {...result, fileName: sample.fileName, size: sample.size}
  } catch (exception) { error.value = `样例文件识别失败：${exception.message}` }
  finally { sampleLoading.value = false; event.target.value = '' }
}
function changeParserMode() {
  if (form.parserMode === 'PASSTHROUGH' && form.contentBindings.length
    && window.confirm('原样复制不会修改文件内容，是否清空现有内容时间规则？')) form.contentBindings = []
  if (form.parserMode === 'FIXED_WIDTH' && !form.contentBindings.length) {
    form.contentBindings = [{mode: 'SHIFT', fields: ['Year', 'Month', 'Day', 'Hour'], source: 'BUSINESS_BASE_TIME'}]
  }
}
function addFileNameBinding() {
  form.fileNameBindings.push({index: form.fileNameBindings.length, format: 'yyyyMMddHH', source: 'BUSINESS_BASE_TIME', relativeTo: null})
}
function addContentBinding() {
  if (form.parserMode === 'POSITIONAL_TEXT') {
    form.contentBindings.push({mode: 'SET', locator: {type: 'TOKEN_COLUMN', columnIndex: 0, separator: 'WHITESPACE', header: false}, format: 'yyyyMMddHHmm', source: 'BUSINESS_BASE_TIME', expectedMatches: 'ALL_ROWS', referenceFileNameTimeIndex: 0})
    return
  }
  const mode = form.parserMode === 'FIXED_WIDTH' ? 'SHIFT' : form.parserMode === 'KEY_VALUE' ? 'KEY_VALUE' : 'SHIFT'
  form.contentBindings.push({mode, fields: form.parserMode === 'FIXED_WIDTH' ? ['Year', 'Month', 'Day', 'Hour'] : [], format: 'yyyy-MM-dd HH:mm:ss', source: 'BUSINESS_BASE_TIME'})
}
function changeLocator(binding) {
  const type = binding.locator.type
  binding.locator = type === 'LINE_PREFIX' ? {type, prefix: '', tokenIndex: 0}
    : type === 'LINE_SUFFIX' ? {type, suffix: '', tokenIndex: 0}
      : {type, columnIndex: 0, separator: 'WHITESPACE', header: false}
}
function fieldsText(binding) { return (binding.fields || []).join(', ') }
function setFields(binding, value) { binding.fields = value.split(',').map(item => item.trim()).filter(Boolean) }
function hasExecutableRule() {
  if (form.parserMode === 'PASSTHROUGH') return form.fileNameBindings.length > 0 && form.contentBindings.length === 0
  if (form.parserMode === 'FIXED_WIDTH') return form.contentBindings.length === 1
    && form.contentBindings[0].mode === 'SHIFT'
    && ['Year', 'Month', 'Day', 'Hour'].every(field => form.contentBindings[0].fields?.includes(field))
  if (form.parserMode === 'POSITIONAL_TEXT') return form.contentBindings.length > 0 && form.contentBindings.every(binding => binding.locator?.type && binding.format)
  return form.fileNameBindings.length > 0 || form.contentBindings.length > 0
}
function ruleIssueMessage() {
  if (form.parserMode === 'PASSTHROUGH') return '为原样复制配置至少一条文件名时间规则'
  if (form.parserMode === 'FIXED_WIDTH') return '配置唯一一条 Year、Month、Day、Hour 组合时间规则'
  if (form.parserMode === 'POSITIONAL_TEXT') return '配置至少一条内容时间定位规则'
  return '配置至少一条文件名或内容时间规则'
}
function locateIssue(issue) {
  activeStep.value = issue.step
  requestAnimationFrame(() => document.getElementById(`file-rule-step-${issue.step}`)?.querySelector('input, select, button')?.focus())
}
function moveStep(offset) {
  const target = steps[currentStepIndex.value + offset]
  if (target) activeStep.value = target[0]
}
function saveAndNext() {
  submit('DRAFT', () => moveStep(1))
}
function payload(status) {
  if (!form.name.trim()) throw new Error('请输入模板名称')
  return {
    id: editorId.value === 'new' ? undefined : editorId.value,
    name: form.name.trim(), status, code: null, description: form.description.trim(),
    binding: {
      sourceCode: form.sourceCode, sourceName: form.sourceName, dataItemCode: form.dataItemCode, dataItemName: form.dataItemName,
      elementCodes: [...selectedElementCodes.value], elements: form.elements.map(item => ({...item}))
    },
    match: {fileNamePattern: form.fileNamePattern.trim(), firstLineContains: form.firstLineContains.trim()},
    rule: {
      schemaVersion: 2, sourceFileName: form.sourceFileName.trim(), sourceFilePath: '', storageType: 'OSS', parserMode: form.parserMode,
      encoding: form.encoding, delimiter: form.delimiter, fileNameBindings: clone(form.fileNameBindings), contentBindings: clone(form.contentBindings)
    }
  }
}
function submit(status = 'DRAFT', onSuccess) {
  error.value = ''
  if (status === 'PUBLISHED' && reviewIssues.value.length) {
    const issue = reviewIssues.value[0]
    error.value = `发布前请先${issue.message}`
    locateIssue(issue)
    return
  }
  let item
  try { item = payload(status) } catch (exception) { error.value = exception.message; activeStep.value = 'basic'; return }
  if (editorId.value === 'new') {
    emit('create', item, created => {
      editorId.value = created.id
      Object.assign(form, templateForm(created))
      savedSnapshot.value = currentSnapshot()
      if (status === 'PUBLISHED') { closeEditor(); return }
      setRoute('file-rules', created.id, true, true)
      if (typeof onSuccess === 'function') onSuccess()
    }, message => { error.value = message || '保存失败，输入已保留' })
    return
  }
  emit('update', item, result => {
    if (!result?.success) { error.value = result?.error || '保存失败，输入已保留'; return }
    Object.assign(form, templateForm(result.resource || item))
    savedSnapshot.value = currentSnapshot()
    if (status === 'PUBLISHED') { closeEditor(); return }
    if (typeof onSuccess === 'function') onSuccess()
  })
}
function disableTemplate(template) {
  if (!window.confirm(`停用文件规则模板“${template.name}”后，新配置将不能再应用它。是否继续？`)) return
  emit('update', {...template, status: 'DISABLED'}, result => {
    if (!result?.success) return
    if (editorId.value === template.id) {
      form.status = 'DISABLED'
      form.version = Number(result.resource?.version || form.version)
      savedSnapshot.value = currentSnapshot()
    }
  })
}
function confirmDelete() {
  if (!selected.value || referencesOf(selected.value).length) return
  emit('remove', selected.value.id, () => { dialog.value = ''; selectedId.value = '' })
}
</script>

<template>
  <main class="page file-rule-page">
    <template v-if="!routeId">
      <div class="page-heading"><div><h1>文件规则模板</h1><p>集中维护可复用的文件解析与时间替换规则，报文按三要素自动匹配已发布模板。</p></div><button v-if="canManage" class="button primary" @click="openCreate"><AppIcon name="plus" :size="16"/>新建文件规则模板</button></div>
      <section class="card file-rule-list-card">
        <ListFilters>
          <label><span>搜索模板</span><SearchInput v-model="keyword" aria-label="搜索文件规则模板" placeholder="名称、说明、数据源或数据项"/></label>
          <label>状态<select v-model="statusFilter"><option value="ALL">全部</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="DISABLED">已停用</option></select></label>
          <button v-if="keyword || statusFilter !== 'ALL'" class="link-button" @click="keyword = ''; statusFilter = 'ALL'">清除筛选</button>
        </ListFilters>
        <div class="table-scroll"><table class="data-table management-table file-rule-table"><thead><tr><th>模板名称</th><th>数据源 / 数据项</th><th class="responsive-low">要素</th><th class="responsive-low">解析方式</th><th>状态</th><th class="responsive-low">更新时间</th><th class="operation-cell">操作</th></tr></thead><tbody>
          <tr v-for="template in visibleTemplates" :key="template.id">
            <td><button class="management-primary" @click="openDetail(template)">{{ template.name }}</button><small>{{ template.description || '暂无适用说明' }}</small></td>
            <td class="management-body"><b>{{ template.binding?.sourceName || template.binding?.sourceCode || '未绑定数据源' }}</b><small>{{ template.binding?.dataItemName || template.binding?.dataItemCode || '未绑定数据项' }}</small></td>
            <td class="management-body responsive-low"><span class="count-value">{{ template.binding?.elementCodes?.length || template.binding?.elements?.length || 0 }}</span> 项</td>
            <td class="management-body responsive-low">{{ parserModeLabel(template.rule?.parserMode) }}</td>
            <td><StatusBadge :status="template.status"/></td>
            <td class="management-body responsive-low">{{ formatDateTime(template.updatedAt) }}</td>
            <td class="operation-cell"><div class="row-actions"><button class="link-button" @click="openDetail(template)">查看</button><button v-if="canManage" class="link-button" @click="openEdit(template)">配置</button><button v-if="canManage" class="link-button" :disabled="copying" @click="copyTemplate(template)">复制</button><button v-if="canManage && template.status === 'PUBLISHED'" class="link-button" @click="disableTemplate(template)">停用</button><button v-if="canManage" class="link-button danger-text" :disabled="referencesOf(template).length > 0" :title="referencesOf(template).length ? `请先调整：${referenceNames(template).join('、')}` : ''" @click="requestDelete(template)">删除</button></div><small v-if="referencesOf(template).length" class="reference-count" :title="referenceNames(template).join('、')">引用：{{ referenceNames(template).join('、') }}</small></td>
          </tr>
          <tr v-if="!visibleTemplates.length"><td colspan="7" class="empty-state"><template v-if="templates.length">没有匹配的文件规则模板。<br><button class="link-button empty-state-action" @click="keyword = ''; statusFilter = 'ALL'">清除筛选</button></template><template v-else>还没有文件规则模板。<br><button v-if="canManage" class="link-button empty-state-action" @click="openCreate">新建第一份模板</button></template></td></tr>
        </tbody></table></div>
        <ListPagination v-model:page="page" v-model:page-size="pageSize" :total="filteredTemplates.length" :total-pages="totalPages"/>
      </section>
    </template>

    <p v-else-if="routeId !== 'new' && !editingTemplate" class="notice negative">文件规则模板不存在或暂时无法读取。<button class="link-button" @click="setRoute('file-rules')">返回模板列表</button></p>

    <AppDetailPage v-else-if="canManage" :title="editorId === 'new' ? '新建文件规则模板' : `配置文件规则模板 · ${form.name}`" :before-close="confirmEditorClose" @close="closeEditor">
      <section class="editor-status-strip"><div><StatusBadge :status="form.status"/><span v-if="isEditorDirty" class="unsaved-indicator" role="status">未保存</span><span>{{ editorId === 'new' ? '尚未生成 UUID' : `引用报文 ${referencesOf(editingTemplate).length} 个` }}</span></div><button class="issue-summary" :class="{ready: !reviewIssues.length}" @click="reviewIssues.length && locateIssue(reviewIssues[0])">{{ reviewIssues.length ? `待完善 ${reviewIssues.length} 项` : '配置检查通过' }} →</button></section>
      <p v-if="error" class="notice negative" role="alert">{{ error }}</p>
      <div class="editor-workbench">
        <header class="editor-step-header"><div><b>配置步骤</b><small>已完成 {{ completedStepCount }}/{{ steps.length }} · 草稿可暂存未完成配置</small></div><nav class="step-tabs" role="tablist" aria-label="文件规则模板配置步骤"><button v-for="(step, index) in steps" :key="step[0]" type="button" role="tab" :aria-selected="activeStep === step[0]" :class="{active: activeStep === step[0], complete: !stepIssueCount(step[0])}" @click="activeStep = step[0]"><i>{{ index + 1 }}</i><span>{{ step[1] }}</span><small v-if="stepIssueCount(step[0])">{{ stepIssueCount(step[0]) }}</small></button></nav></header>

        <section v-if="activeStep === 'basic'" id="file-rule-step-basic" class="config-panel"><div class="card-heading"><div><h2>基本信息</h2><p>名称和说明帮助管理员判断模板适用范围，模板标识由系统生成。</p></div></div><div class="form-grid"><label>模板名称（必填）<input v-model="form.name" autofocus placeholder="例如 极端天气预警定长文件"></label><label>模板 UUID<input :value="editorId === 'new' ? '保存后自动生成' : editorId" disabled></label><label class="wide-field">适用说明<textarea v-model="form.description" rows="4" placeholder="描述适用文件、数据范围和时间语义"></textarea></label></div></section>

        <section v-else-if="activeStep === 'binding'" id="file-rule-step-binding" class="config-panel"><div class="card-heading"><div><h2>三要素绑定</h2><p>模板按数据源、数据项和完整要素集合精确匹配。</p></div></div>
          <div class="data-linkage-grid">
            <section class="linkage-step"><h3><i>1</i>选择数据源</h3><label>搜索数据源<input v-model="sourceKeyword" placeholder="来源编码或中文名称" @input="loadSourceOptions"></label><div class="catalog-options"><button v-for="item in sourceOptions" :key="item.code" type="button" :class="{selected: form.sourceCode === item.code}" @click="chooseDataSource(item)"><code>{{ item.code }}</code><b>{{ item.name || '未配置中文名称' }}</b><small>{{ item.dataItemCount }} 个数据项</small></button><div v-if="catalogLoading.sources" class="catalog-empty">正在搜索…</div><div v-else-if="!sourceOptions.length" class="catalog-empty">没有匹配的数据源</div></div></section>
            <section class="linkage-step" :class="{disabled: !form.sourceCode}"><h3><i>2</i>选择数据项</h3><label>筛选数据项<input v-model="dataItemKeyword" :disabled="!form.sourceCode" placeholder="数据项编码或中文名称" @input="loadDataItemOptions"></label><div class="catalog-options"><button v-for="item in dataItemOptions" :key="item.code" type="button" :class="{selected: form.dataItemCode === item.code}" @click="chooseDataItem(item)"><code>{{ item.code }}</code><b>{{ item.name || '未配置中文名称' }}</b><small>{{ item.elementCount }} 个要素</small></button><div v-if="catalogLoading.dataItems" class="catalog-empty">正在加载…</div><div v-else-if="form.sourceCode && !dataItemOptions.length" class="catalog-empty">没有匹配的数据项</div></div></section>
            <section class="linkage-step" :class="{disabled: !form.dataItemCode}"><h3><i>3</i>选择要素项</h3><label>搜索要素项<input v-model="elementKeyword" :disabled="!form.dataItemCode" placeholder="要素编码或中文名称" @input="loadElementOptions"></label><button class="select-all" type="button" :disabled="!elementOptions.length" @click="toggleAllElements">全选/取消当前结果 · 已选 {{ form.elements.length }} 项</button><div class="element-options"><label v-for="item in elementOptions" :key="item.id || item.code" :class="{selected: isElementSelected(item)}"><input type="checkbox" :checked="isElementSelected(item)" @change="toggleElement(item)"><span><b>{{ item.code }} · {{ item.name || '未配置中文名称' }}</b><small>{{ item.unit || '无单位' }} · {{ item.dataFormat || '未配置格式' }}</small></span></label><div v-if="catalogLoading.elements" class="catalog-empty">正在加载…</div><div v-else-if="form.dataItemCode && !elementOptions.length" class="catalog-empty">没有匹配的要素项</div></div></section>
          </div>
          <div class="binding-summary"><div><b>{{ form.sourceCode || '未选择数据源' }} / {{ form.dataItemCode || '未选择数据项' }}</b><small>{{ form.sourceName || '—' }} · {{ form.dataItemName || '—' }}</small><div class="selected-element-chips"><span v-for="element in form.elements" :key="element.code">{{ element.code }} {{ element.name }}</span></div></div><strong>已选 {{ form.elements.length }} 个要素</strong></div>
        </section>

        <section v-else-if="activeStep === 'sample'" id="file-rule-step-sample" class="config-panel"><div class="card-heading"><div><h2>样例与解析</h2><p>样例只在当前浏览器分析前 512 KiB，不上传或保存文件正文。</p></div></div><button class="sample-upload" type="button" :disabled="sampleLoading" @click="sampleInput?.click()"><AppIcon name="plus" :size="18"/><span><b>{{ sampleLoading ? '正在识别样例…' : '选择 CSV、TXT 或 DAT 样例文件' }}</b><small>自动识别文件名时间、内容时间字段、编码和分隔方式</small></span></button><input ref="sampleInput" class="visually-hidden" type="file" accept=".csv,.txt,.dat,text/plain,text/csv" @change="uploadSample"><div v-if="sampleResult" class="sample-result" role="status"><div><b>{{ sampleResult.fileName }}</b><span>{{ sampleResult.summary }}</span><small>{{ sampleResult.encoding }} · {{ parserModeLabel(sampleResult.parserMode) }} · 发现 {{ sampleResult.fileNameBindings.length }} 个文件名时间和 {{ sampleResult.detectedFields.length }} 个内容字段</small></div><div class="detected-fields"><span v-for="field in sampleResult.detectedFields" :key="field">{{ field }}</span></div></div>
          <div class="form-grid parsing-grid"><label>样例文件名<input v-model="form.sourceFileName" placeholder="上传样例后自动带出"></label><label>处理方式<select v-model="form.parserMode" @change="changeParserMode"><option v-for="item in parserModes" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select></label><label>字符编码<select v-model="form.encoding" :disabled="form.parserMode === 'PASSTHROUGH'"><option>AUTO</option><option>UTF-8</option><option>GB18030</option></select></label><label>分隔符<select v-model="form.delimiter" :disabled="form.parserMode !== 'DELIMITED'"><option>AUTO</option><option value=",">逗号</option><option value="TAB">制表符</option><option value="|">竖线</option><option value=";">分号</option></select></label><label>文件名正则<input v-model="form.fileNamePattern" placeholder="可选，用于限制匹配文件名"></label><label>首行包含<input v-model="form.firstLineContains" placeholder="可选，用于补充文件识别条件"></label></div>
        </section>

        <section v-else id="file-rule-step-rules" class="config-panel"><div class="card-heading"><div><h2>时间替换规则</h2><p>分别配置文件名与内容中的时间来源，保存的数据结构与报文模板一致。</p></div></div>
          <section class="rule-section"><div class="rule-heading"><div><h3>文件名时间</h3><p>按文件名中的时间片段顺序定位，前缀变化不会影响替换。</p></div><button class="button secondary small" type="button" @click="addFileNameBinding">添加文件名规则</button></div><div v-if="form.fileNameBindings.length" class="rule-list"><article v-for="(binding, index) in form.fileNameBindings" :key="index"><strong>第 {{ index + 1 }} 条</strong><label>片段序号<input v-model.number="binding.index" type="number" min="0"></label><label>时间格式<input v-model.trim="binding.format" placeholder="yyyyMMddHH"></label><label>时间来源<select v-model="binding.source"><option v-for="source in FILE_TIME_SOURCES" :key="source[0]" :value="source[0]">{{ source[1] }}</option></select></label><label v-if="binding.source === 'PRESERVE_OFFSET'">参考片段<input v-model.number="binding.relativeTo" type="number" min="0"></label><button class="link-button danger-text" type="button" @click="form.fileNameBindings.splice(index, 1)">删除</button></article></div><div v-else class="rule-empty">尚未配置文件名时间规则。</div></section>
          <section class="rule-section"><div class="rule-heading"><div><h3>文件内容时间</h3><p>{{ form.parserMode === 'PASSTHROUGH' ? '当前为内容原样复制，不允许配置内容时间规则。' : `按${parserModeLabel(form.parserMode)}的字段结构定位和替换。` }}</p></div><button v-if="form.parserMode !== 'PASSTHROUGH'" class="button secondary small" type="button" :disabled="form.parserMode === 'FIXED_WIDTH' && form.contentBindings.length > 0" @click="addContentBinding">添加内容规则</button></div><div v-if="form.contentBindings.length" class="rule-list content-rule-list"><article v-for="(binding, index) in form.contentBindings" :key="index"><strong>{{ contentModeLabel(binding.mode) }}</strong><template v-if="form.parserMode === 'POSITIONAL_TEXT'"><label>定位方式<select v-model="binding.locator.type" @change="changeLocator(binding)"><option value="TOKEN_COLUMN">无表头列</option><option value="LINE_PREFIX">行前缀</option><option value="LINE_SUFFIX">行后缀</option></select></label><label v-if="binding.locator.type === 'TOKEN_COLUMN'">列序号<input v-model.number="binding.locator.columnIndex" type="number" min="0"></label><label v-else>字段序号<input v-model.number="binding.locator.tokenIndex" type="number" min="0"></label><label v-if="binding.locator.type === 'LINE_PREFIX'">行前缀<input v-model.trim="binding.locator.prefix"></label><label v-if="binding.locator.type === 'LINE_SUFFIX'">行后缀<input v-model.trim="binding.locator.suffix"></label><label>替换方式<select v-model="binding.mode"><option value="SET">设置为指定时间</option><option value="SHIFT_BY_FILENAME_DELTA">按文件名时间差平移</option></select></label><label>时间格式<input v-model.trim="binding.format"></label><label v-if="binding.mode === 'SET'">时间来源<select v-model="binding.source"><option v-for="source in FILE_TIME_SOURCES.filter(item => item[0] !== 'PRESERVE_OFFSET')" :key="source[0]" :value="source[0]">{{ source[1] }}</option></select></label><label v-else>参考文件名规则<select v-model.number="binding.referenceFileNameTimeIndex"><option v-for="item in form.fileNameBindings" :key="item.index" :value="item.index">片段 {{ Number(item.index) + 1 }} · {{ item.format }}</option></select></label></template><template v-else><label>字段<input :value="fieldsText(binding)" placeholder="多个字段用逗号分隔" @input="setFields(binding, $event.target.value)"></label><label>替换方式<select v-model="binding.mode"><option v-for="mode in FILE_CONTENT_MODES.filter(item => item[0] !== 'SHIFT_BY_FILENAME_DELTA')" :key="mode[0]" :value="mode[0]">{{ mode[1] }}</option></select></label><label v-if="binding.mode !== 'COMPOSITE'">时间格式<input v-model.trim="binding.format" placeholder="yyyy-MM-dd HH:mm:ss"></label><label v-if="binding.mode !== 'COMPOSITE'">时间来源<select v-model="binding.source"><option v-for="source in FILE_TIME_SOURCES.filter(item => item[0] !== 'PRESERVE_OFFSET')" :key="source[0]" :value="source[0]">{{ source[1] }}</option></select></label><label v-if="binding.mode === 'DERIVED'">偏移分钟<input v-model.number="binding.offsetMinutes" type="number"></label></template><button class="link-button danger-text" type="button" @click="form.contentBindings.splice(index, 1)">删除</button></article></div><div v-else class="rule-empty">{{ form.parserMode === 'PASSTHROUGH' ? '文件内容将按字节原样复制。' : '尚未配置内容时间规则。' }}</div></section>
          <div class="rule-source-guide"><b>时间来源说明</b><div><p v-for="source in FILE_TIME_SOURCES" :key="source[0]"><strong>{{ source[1] }}：</strong>{{ fileTimeSourceDescription(source[0]) }}</p></div><small>只校验当前已配置规则实际依赖的时间参数；数据间隔读取 <code>period_interval</code>，预报结束时间读取 <code>period</code>。</small></div>
          <div class="notice subtle"><b>当前规则：</b>{{ form.fileNameBindings.length }} 条文件名时间规则，{{ form.contentBindings.length }} 条内容时间规则。</div>
        </section>
      </div>
      <template #footer><span class="save-hint">{{ isEditorDirty ? '当前有未保存修改' : '当前修改已保存' }}</span><button v-if="hasPreviousStep" class="button secondary" type="button" :disabled="isPending" @click="moveStep(-1)">返回上一步</button><button class="button secondary" type="button" :disabled="isPending" @click="submit('DRAFT')">{{ isPending ? '正在保存…' : '保存草稿' }}</button><button v-if="hasNextStep" class="button primary" type="button" :disabled="isPending" @click="saveAndNext">{{ isPending ? '正在保存…' : '保存并下一步' }}</button><button v-else class="button primary" type="button" :disabled="isPending" @click="submit('PUBLISHED')">{{ isPending ? '正在发布…' : '发布模板' }}</button></template>
    </AppDetailPage>

    <AppModal v-if="dialog === 'detail' && selected" title="文件规则模板详情" wide @close="dialog = ''"><div class="unified-detail"><DetailHeader :title="selected.name" :code="selected.id" :description="selected.description || '未填写适用说明'"><template #aside><StatusBadge :status="selected.status"/></template></DetailHeader><DetailGrid :columns="3"><div><dt>解析方式</dt><dd>{{ parserModeLabel(selected.rule?.parserMode) }}</dd></div><div><dt>引用报文</dt><dd>{{ referencesOf(selected).length }} 个</dd></div><div><dt>更新时间</dt><dd>{{ formatDateTime(selected.updatedAt) }}</dd></div></DetailGrid><DetailSection v-if="referencesOf(selected).length" title="引用报文" description="删除前需要先调整以下报文模板"><div class="detail-chips"><span v-for="message in referencesOf(selected)" :key="message.id">{{ message.name || message.id }}</span></div></DetailSection><DetailSection title="三要素绑定" description="模板仅匹配完全相同的要素集合"><DetailGrid :columns="3"><div><dt>数据源</dt><dd>{{ selected.binding?.sourceName || selected.binding?.sourceCode || '未绑定' }}</dd></div><div><dt>数据项</dt><dd>{{ selected.binding?.dataItemName || selected.binding?.dataItemCode || '未绑定' }}</dd></div><div><dt>要素项</dt><dd>{{ selected.binding?.elementCodes?.length || selected.binding?.elements?.length || 0 }} 项</dd></div></DetailGrid><div class="detail-chips"><span v-for="element in (selected.binding?.elements || selected.binding?.elementCodes || [])" :key="element.id || element.code || element">{{ element.code || element }}</span><span v-if="!(selected.binding?.elements?.length || selected.binding?.elementCodes?.length)">未绑定要素项</span></div></DetailSection><DetailSection title="文件识别"><DetailGrid :columns="3"><div><dt>样例文件名</dt><dd>{{ selected.rule?.sourceFileName || '未配置' }}</dd></div><div><dt>字符编码</dt><dd>{{ selected.rule?.encoding || 'AUTO' }}</dd></div><div><dt>分隔符</dt><dd>{{ selected.rule?.delimiter || 'AUTO' }}</dd></div></DetailGrid></DetailSection><DetailSection title="时间替换规则"><DetailGrid :columns="2"><div><dt>文件名规则</dt><dd>{{ selected.rule?.fileNameBindings?.length || 0 }} 条</dd></div><div><dt>内容规则</dt><dd>{{ selected.rule?.contentBindings?.length || 0 }} 条</dd></div></DetailGrid></DetailSection></div><template #footer><button class="button secondary" @click="dialog = ''">关闭</button><button v-if="canManage" class="button primary" @click="dialog = ''; openEdit(selected)">配置模板</button></template></AppModal>

    <AppModal v-if="dialog === 'delete' && selected" title="删除文件规则模板" @close="dialog = ''"><p>确定删除文件规则模板 <b>{{ selected.name }}</b> 吗？删除后无法恢复。</p><div v-if="referencesOf(selected).length" class="notice risk"><b>当前不能删除：</b>该模板被 {{ referencesOf(selected).length }} 个报文模板引用，请先调整相关报文。</div><div v-else class="notice">该模板没有被报文引用，可以安全删除。</div><template #footer><button class="button secondary" @click="dialog = ''">取消</button><button class="button danger" :disabled="referencesOf(selected).length || props.pendingActions.has(`remove:file-rule-templates:${selected.id}`)" @click="confirmDelete">{{ props.pendingActions.has(`remove:file-rule-templates:${selected.id}`) ? '正在删除…' : '确认删除' }}</button></template></AppModal>
  </main>
</template>

<style scoped>
.config-panel label small{display:block;color:#748398;font-size:11px;font-weight:400;line-height:1.45}
.file-rule-list-card{padding:0;overflow:hidden}.file-rule-table td{vertical-align:middle}.file-rule-table td:first-child,.file-rule-table th:first-child{padding-left:20px}.file-rule-table td:last-child,.file-rule-table th:last-child{padding-right:20px}.version-label{display:inline-block;margin-right:8px;color:#51647d;font-variant-numeric:tabular-nums}.count-value{color:#253a53;font-size:17px;font-weight:700}.reference-count{display:block;max-width:210px;margin:5px auto 0!important;overflow:hidden;color:#758399;text-align:center;text-overflow:ellipsis;white-space:nowrap}.editor-status-strip{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;padding:11px 14px;border:1px solid #e6ebf2;border-radius:8px;background:#fafbfd}.editor-status-strip>div{display:flex;align-items:center;gap:10px;color:#6d7c90;font-size:13px}.unsaved-indicator{padding:3px 7px;border-radius:4px;background:#fff7e6;color:#ad6800;font-weight:650}.issue-summary{padding:4px 8px;border:0;background:transparent;color:#cf1322;font-weight:650}.issue-summary.ready{color:#389e0d}.editor-workbench{overflow:hidden;border:1px solid #e8edf3;border-radius:8px;background:#fff}.editor-step-header{padding:16px 18px 0;border-bottom:1px solid #edf0f5;background:#fafbfd}.editor-step-header>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.editor-step-header b{color:#263a54}.editor-step-header small{color:#7b899c}.step-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px}.step-tabs button{display:flex;min-width:0;align-items:center;gap:8px;padding:12px 14px;border:0;border-bottom:2px solid transparent;background:transparent;color:#6a788d;text-align:left}.step-tabs button.active{border-bottom-color:#1677ff;color:#1677ff}.step-tabs button.complete i{background:#e6f4ff;color:#1677ff}.step-tabs i{display:grid;width:24px;height:24px;flex:0 0 24px;place-items:center;border-radius:50%;background:#eef1f5;color:#6f7d90;font-style:normal;font-size:12px;font-weight:700}.step-tabs span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-tabs small{display:grid;min-width:20px;height:20px;place-items:center;border-radius:10px;background:#fff1f0;color:#cf1322}.config-panel{padding:22px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.wide-field{grid-column:1/-1}.config-panel label{display:grid;gap:6px;color:#52647c;font-size:13px;font-weight:650}.config-panel input,.config-panel select,.config-panel textarea{width:100%;box-sizing:border-box;border:1px solid #d9dfe8;border-radius:6px;background:#fff;color:#263b53;font:inherit;outline:0}.config-panel input,.config-panel select{height:38px;padding:0 10px}.config-panel textarea{padding:10px;resize:vertical}.config-panel input:focus,.config-panel select:focus,.config-panel textarea:focus,.sample-upload:focus-visible{border-color:#1677ff;box-shadow:0 0 0 3px rgb(22 119 255 / 10%)}.config-panel input:disabled,.config-panel select:disabled{background:#f5f6f8;color:#8c98a8}.data-linkage-grid{display:grid;grid-template-columns:1.05fr 1fr 1.2fr;gap:12px}.linkage-step{min-width:0;padding:15px;border:1px solid #e4e9f0;border-radius:8px;background:#fafafa}.linkage-step.disabled{opacity:.62}.linkage-step h3{display:flex;align-items:center;gap:8px;margin:0 0 14px;color:#253b55;font-size:15px}.linkage-step h3 i{display:grid;width:24px;height:24px;place-items:center;border-radius:50%;background:#1677ff;color:#fff;font-style:normal;font-size:12px}.catalog-options,.element-options{max-height:250px;margin-top:8px;overflow:auto}.catalog-options>button{display:grid;width:100%;gap:3px;padding:10px 11px;border:1px solid transparent;border-radius:6px;background:transparent;text-align:left}.catalog-options>button:hover,.catalog-options>button.selected,.element-options>label:hover,.element-options>label.selected{border-color:#91caff;background:#eaf4ff}.catalog-options code{overflow:hidden;color:#1677ff;text-overflow:ellipsis}.catalog-options b,.element-options b{overflow:hidden;color:#253b55;text-overflow:ellipsis;white-space:nowrap}.catalog-options small,.element-options small{color:#7d8b9e;font-weight:400}.catalog-empty{padding:22px 8px;color:#8492a6;text-align:center;font-size:13px}.select-all{width:100%;margin-top:8px;padding:9px 10px;border:1px solid #91caff;border-radius:6px;background:#eaf4ff;color:#096dd9;text-align:left}.element-options>label{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid transparent;border-radius:6px}.element-options input{width:16px;height:16px;margin:2px 0 0;accent-color:#1677ff}.element-options span{min-width:0}.element-options b,.element-options small{display:block}.binding-summary{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-top:14px;padding:14px 16px;border:1px solid #bae0ff;border-radius:8px;background:#f6fbff}.binding-summary b,.binding-summary small{display:block}.binding-summary strong{flex:none;color:#096dd9;font-size:13px}.selected-element-chips,.detected-fields,.detail-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.selected-element-chips span,.detected-fields span,.detail-chips span{padding:4px 8px;border:1px solid #c6ddff;border-radius:4px;background:#fff;color:#2859cf;font-size:12px}.sample-upload{display:flex;width:100%;align-items:center;gap:12px;padding:20px;border:1px dashed #91caff;border-radius:8px;background:#f7fbff;color:#1677ff;text-align:left}.sample-upload span,.sample-upload b,.sample-upload small{display:block}.sample-upload small{margin-top:4px;color:#6f8096;font-weight:400}.sample-result{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-top:12px;padding:14px;border:1px solid #b7eb8f;border-radius:8px;background:#f6ffed}.sample-result b,.sample-result span,.sample-result small{display:block}.sample-result span{margin-top:4px;color:#365314}.sample-result small{margin-top:3px;color:#52734b}.parsing-grid{margin-top:20px}.rule-section+.rule-section{margin-top:24px;padding-top:22px;border-top:1px solid #edf0f5}.rule-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.rule-heading h3{margin:0;color:#263a54;font-size:16px}.rule-heading p{margin:5px 0 0;color:#748398;font-size:13px}.rule-list{display:grid;gap:8px;margin-top:12px}.rule-list article{display:grid;grid-template-columns:90px repeat(4,minmax(130px,1fr)) auto;align-items:end;gap:10px;padding:12px;border:1px solid #e6eaf0;border-radius:6px;background:#fafbfd}.rule-list article>strong{align-self:center;color:#1677ff;font-size:12px}.content-rule-list article{grid-template-columns:120px repeat(5,minmax(130px,1fr)) auto}.rule-empty{margin-top:12px;padding:18px;border:1px dashed #d9dfe8;border-radius:6px;background:#fafafa;color:#7b899c;text-align:center;font-size:13px}.save-hint{margin-right:auto;color:#7d8b9e;font-size:13px}.unified-detail{display:grid;gap:16px}.detail-chips{margin-top:14px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:1180px){.data-linkage-grid{grid-template-columns:1fr}.rule-list article,.content-rule-list article{grid-template-columns:repeat(2,minmax(0,1fr))}.rule-list article>strong,.rule-list article>.link-button{justify-self:start}}@media(max-width:760px){.editor-status-strip,.editor-step-header>div,.binding-summary,.sample-result,.rule-heading{align-items:flex-start;flex-direction:column}.step-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.form-grid,.rule-list article,.content-rule-list article{grid-template-columns:1fr}.wide-field{grid-column:auto}.config-panel{padding:15px}.editor-status-strip>div{align-items:flex-start;flex-wrap:wrap}}
.rule-source-guide{margin-top:16px;padding:13px 15px;border:1px solid #dfe5ee;border-radius:6px;background:#fafbfd;color:#526078;font-size:12px;line-height:1.6}.rule-source-guide>b{display:block;margin-bottom:5px;color:#263a54}.rule-source-guide>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 18px}.rule-source-guide p{margin:0}.rule-source-guide strong{color:#334a64}.rule-source-guide small{display:block;margin-top:6px;color:#748398}.rule-source-guide code{color:#1677ff}@media(max-width:760px){.rule-source-guide>div{grid-template-columns:1fr}}
</style>
