<script setup>
import ListFilters from '../components/ListFilters.vue'
import ListPagination from '../components/ListPagination.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppModal from '../components/AppModal.vue'
import AppDetailPage from '../components/AppDetailPage.vue'
import AppDrawer from '../components/AppDrawer.vue'
import {setRoute} from '../page-route.mjs'
import {useListQueryValue, useListState} from '../list-state.mjs'
import {latestRequest} from '../interaction-policy.mjs'
import AppIcon from '../components/AppIcon.vue'
import SearchInput from '../components/SearchInput.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailSection from '../components/DetailSection.vue'
import TruncatedText from '../components/TruncatedText.vue'
import * as api from '../api'
import {copyMessageDraft, localDateTimeValue, preGenerateMessage} from '../message-pre-generation.mjs'
import {createFileGeneration, normalizeFileGeneration, normalizeStorageType, normalizeFileGroupExtensions, SHAPEFILE_EXTENSIONS} from '../file-storage.mjs'
import {isOriginalMessage, isStructuredFile, isUnstructuredFile, normalizeMessageType} from '../resource-adapter.mjs'
import {sha256Utf8} from '../content-sha256.mjs'
import {applyFileRuleTemplate, candidateFileRuleTemplates, elementCodesOf, matchingFileRuleTemplates} from '../file-rule-template.mjs'
import {normalizeTimeBinding, recommendedTimeStrategy, TIME_STRATEGIES, timeStrategiesForPath, timeStrategyDescription as describeTimeStrategy} from '../time-binding.mjs'
import {createRequestId} from '../request-id.mjs'
import {tasksReferencingMessage} from '../message-references.mjs'
import {detectScalarFields, detectTimeFields, findFirstStringField} from '../message-content-fields.mjs'
import {detectFileNameBindings} from '../file-rule-sample.mjs'
import {FILE_TIME_SOURCES, fileTimeCategory, fileTimeOptions} from '../file-rule-presets.mjs'

const props = defineProps({ templates: Array, sources: Array, components: Array, tasks: Array, fileRuleTemplates: {type: Array, default: () => []}, routeId: {type: String, default: ''}, pendingActions: { type: Object, default: () => new Set() }, canManage: { type: Boolean, default: false } })
const emit = defineEmits(['update', 'create', 'remove', 'notify', 'check-component', 'editing-state'])
const selectedId = ref(props.templates[0]?.id || '')
const {keyword, status: statusFilter, page, pageSize} = useListState('messages')
const dataSourceFilter = useListQueryValue('messages', 'source', 'ALL')
const activeTab = ref('basic')
const bindingSection = ref('time')
const bindingFilter = ref('ALL')
const bindingKeyword = ref('')
const valueFieldKeyword = ref('')
const inspectorOpen = ref(false)
const valueBindingEditorOpen = ref(false)
const bindingPreviewOpen = ref(false)
const bindingPreview = ref(null)
const bindingPreviewTime = ref('')
const bindingPreviewError = ref('')
const editingValueBindingId = ref('')
const dialog = ref('')
const editorPreview = ref(false)
const activeTargetComponentId = ref('')
const groupSuggestionsOpen = ref(false)
const activeGroupSuggestionIndex = ref(-1)
const topicSuggestionsOpen = ref(false)
const activeTopicSuggestionIndex = ref(-1)
const createError = ref('')
const form = reactive({})
const createForm = reactive({ name: '', type: 'JSON', processingMode: '', businessType: 'REALTIME', timeGenerationMode: 'DATA_POLICY', description: '' })
const copyForm = reactive({ name: '', includeDeliveryTargets: false })
const copyError = ref('')
const preGenerateForm = reactive({ plannedTriggerTime: '' })
const preGeneration = ref(null)
const preGenerateCode = ref(null)
const preGenerateError = ref('')
const dataItemKeyword = ref('')
const sourceKeyword = ref('')
const elementKeyword = ref('')
const dataItemOptions = ref([])
const sourceOptions = ref([])
const elementOptions = ref([])
const catalogLoading = reactive({ dataItems: false, sources: false, elements: false })
const fileInspection = ref(null)
const fileInspecting = ref(false)
const savedFormSnapshot = ref('')
const timeStrategies = TIME_STRATEGIES
const valueProviders = [
  ['MESSAGE_ID', '消息 ID'],
  ['PLANNED_TRIGGER_TIME', '当前时间'],
  ['BUSINESS_BASE_TIME', '起报时间'],
  ['PERIOD_END_TIME', '预报时间'],
  ['CONSTANT', '固定常量']
]
const availableValueProviders = computed(() => form.businessType === 'REALTIME'
  ? valueProviders.filter(([provider]) => provider !== 'PERIOD_END_TIME')
  : valueProviders)
const availableFileTimeSources = computed(() => form.businessType === 'REALTIME'
  ? FILE_TIME_SOURCES.filter(([category]) => category !== 'FORECAST_TIME')
  : FILE_TIME_SOURCES)
const businessTypeLabel = value => ({REALTIME: '实况', FORECAST: '预报', UNKNOWN: '待确认'})[value] || '待确认'
const valueBindingDraft = reactive({ path: '', provider: 'MESSAGE_ID', targetType: 'string', value: '', format: 'yyyy-MM-dd HH:mm:ss' })
let dataItemTimer
let sourceTimer
let elementTimer

const selected = computed(() => props.templates.find(item => item.id === selectedId.value))
const matchedFileRuleTemplates = computed(() => matchingFileRuleTemplates(props.fileRuleTemplates, form.dataBinding || {}))
const candidateTemplates = computed(() => candidateFileRuleTemplates(props.fileRuleTemplates, form.dataBinding || {}))
const matchedTemplate = computed(() => matchedFileRuleTemplates.value[0])
const templateUpgradeAvailable = computed(() => Boolean(matchedTemplate.value
  && form.fileGeneration?.ruleTemplateId === matchedTemplate.value.id
  && Number(matchedTemplate.value.version || 1) > Number(form.fileGeneration?.ruleTemplateVersion || 0)))
const shapefileSidecars = computed(() => normalizeFileGroupExtensions(form.fileGeneration?.fileGroup, form.fileGeneration?.fileType))
const unstructuredFileNameCandidates = computed(() => {
  const detected = detectFileNameBindings(form.fileGeneration?.sourceFileName || '')
  const configured = form.fileGeneration?.fileNameBindings || []
  return [...new Map([...configured, ...detected].map(candidate => [Number(candidate.index || 0), candidate])).values()]
})
const isPending = key => props.pendingActions.has(key)
const sourceName = id => props.sources.find(item => item.id === id)?.name || '未关联'
const dataItemName = item => item?.dataBinding?.dataItemName || sourceName(item?.sourceId)
const dataSourceName = item => item?.dataBinding?.sourceName || props.sources.find(source => source.sourceCode === item?.dataBinding?.sourceCode)?.sourceCodeName || '未关联'
const rocketComponents = computed(() => props.components.filter(item => !item.type || item.type === 'ROCKETMQ'))
const componentOf = id => rocketComponents.value.find(item => item.id === id)
const producerGroupsOf = component => Array.isArray(component?.producerGroups) && component.producerGroups.length ? component.producerGroups : (component?.producerGroup ? [component.producerGroup] : [])
const topicsOf = component => Array.isArray(component?.topics) ? component.topics : []
const targetComponentIdsOf = template => Array.isArray(template?.componentIds) && template.componentIds.length
  ? template.componentIds
  : (template?.componentId ? [template.componentId] : [])
const deliveryTargetsOf = template => {
  if (Array.isArray(template?.deliveryTargets) && template.deliveryTargets.length) {
    return template.deliveryTargets.filter(item => item?.componentId && componentOf(item.componentId)).map((item, index) => ({
      targetId: item.targetId || `target-${item.componentId}-${index}`,
      componentId: item.componentId, producerGroup: item.producerGroup || '', topic: item.topic || ''
    }))
  }
  return targetComponentIdsOf(template).filter(componentOf).map((componentId, index) => {
    return {
      targetId: `target-${componentId}-${index}`,
      componentId,
      producerGroup: template?.producerGroup || '',
      topic: template?.topic || ''
    }
  })
}
const targetTopicsOf = template => [...new Set(deliveryTargetsOf(template).map(item => item.topic).filter(Boolean))]
const messageSourceOptions = computed(() => {
  const options = new Map()
  for (const source of props.sources || []) {
    const code = source.sourceCode || source.code
    if (code) options.set(code, source.sourceCodeName || source.name || code)
  }
  for (const template of props.templates || []) {
    const code = template.dataBinding?.sourceCode
    if (code && !options.has(code)) options.set(code, template.dataBinding?.sourceName || code)
  }
  return [...options].sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'))
})
const filteredTemplates = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  return props.templates.filter(item => (statusFilter.value === 'ALL' || item.status === statusFilter.value)
    && (dataSourceFilter.value === 'ALL' || (dataSourceFilter.value === 'UNASSOCIATED' ? !item.dataBinding?.sourceCode : item.dataBinding?.sourceCode === dataSourceFilter.value))
    && (!search || [item.name, item.type, item.description, dataItemName(item), dataSourceName(item), ...targetTopicsOf(item)]
    .some(value => String(value || '').toLowerCase().includes(search))))
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredTemplates.value.length / pageSize.value)))
const visibleTemplates = computed(() => filteredTemplates.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const referenceTasks = computed(() => tasksReferencingMessage(props.tasks, selected.value?.id))
const selectedTargetIds = computed(() => (form.deliveryTargets || []).map(item => item.componentId))
const activeDeliveryTarget = computed(() => (form.deliveryTargets || []).find(item => item.targetId === activeTargetComponentId.value))
const activeTargetComponent = computed(() => componentOf(activeDeliveryTarget.value?.componentId))
const activeProducerGroups = computed(() => producerGroupsOf(activeTargetComponent.value))
const activeTopics = computed(() => topicsOf(activeTargetComponent.value))
const groupSuggestions = computed(() => {
  const query = String(activeDeliveryTarget.value?.producerGroup || '').trim().toLowerCase()
  return activeProducerGroups.value
    .filter(group => !query || String(group).toLowerCase().includes(query))
    .slice(0, 20)
})
const topicSuggestions = computed(() => {
  const query = String(activeDeliveryTarget.value?.topic || '').trim().toLowerCase()
  return activeTopics.value
    .filter(topic => !query || String(topic).toLowerCase().includes(query))
    .slice(0, 20)
})
const detectedTimeFields = computed(() => detectTimeFields(form.content))
const detectedScalarFields = computed(() => detectScalarFields(form.content))
const valueRuleBindings = computed(() => (form.bindings || []).filter(binding => binding.kind === 'VALUE_RULE'))
const visibleTimeFields = computed(() => detectedTimeFields.value.filter(field => {
  const configured = Boolean(timeBindingOf(field.path))
  const matchesFilter = bindingFilter.value === 'ALL' || (bindingFilter.value === 'ACTIVE' ? configured : !configured)
  const search = bindingKeyword.value.trim().toLowerCase()
  return matchesFilter && (!search || [field.field, field.path, field.sample].some(value => String(value || '').toLowerCase().includes(search)))
}))
const drawerScalarFields = computed(() => {
  const search = valueFieldKeyword.value.trim().toLowerCase()
  return detectedScalarFields.value.filter(field => !search || [field.field, field.path, field.sample]
    .some(value => String(value ?? '').toLowerCase().includes(search)))
})
const configuredTimeBindingCount = computed(() => detectedTimeFields.value.filter(field => timeBindingOf(field.path)).length)
const allTimeFieldsSelected = computed(() => detectedTimeFields.value.length > 0
  && detectedTimeFields.value.every(field => Boolean(timeBindingOf(field.path))))
const someTimeFieldsSelected = computed(() => detectedTimeFields.value.some(field => Boolean(timeBindingOf(field.path))))
const invalidTimeBindings = computed(() => (form.bindings || []).filter(binding => binding.kind === 'TIME_RULE'
  && (!timeStrategiesForPath(binding.path, form.businessType).some(item => item[0] === binding.strategy) || Object.prototype.hasOwnProperty.call(binding, 'offset'))))
const invalidValueBindings = computed(() => valueRuleBindings.value.filter(binding => !binding.path
  || !valueProviders.some(item => item[0] === binding.provider) || (binding.provider === 'CONSTANT' && binding.value === undefined)))
function hasMatchedFileRuleTemplate() {
  const templateId = form.fileGeneration?.ruleTemplateId
  return Boolean(templateId && matchedFileRuleTemplates.value.some(item => item.id === templateId))
}
function hasFileGenerationRule() {
  const generation = form.fileGeneration || {}
  if (isOriginalMessage(form)) return generation.processingMode === 'ORIGINAL_MESSAGE'
  if (isUnstructuredFile(form)) return Boolean(generation.sourceFilePath && generation.sourceFileName && generation.fileNameBindings?.length
    && /^\$(?:\.[A-Za-z_$][\w$]*|\[\d+\])+$/.test(generation.fileNamePath || '')
    && /^\$(?:\.[A-Za-z_$][\w$]*|\[\d+\])+$/.test(generation.filePathPath || '')
    && generation.targetDirectory && !/(^|[\\/])\.\.([\\/]|$)/.test(generation.targetDirectory))
  if (!hasMatchedFileRuleTemplate()) return false
  if (generation.parserMode === 'PASSTHROUGH') return Boolean(generation.fileNameBindings?.length)
  if (generation.parserMode === 'FIXED_WIDTH') return generation.contentBindings?.length === 1
    && generation.contentBindings[0].mode === 'SHIFT'
    && ['Year', 'Month', 'Day', 'Hour'].every(field => generation.contentBindings[0].fields?.includes(field))
  if (generation.parserMode === 'POSITIONAL_TEXT') return Boolean(generation.contentBindings?.length
    && generation.contentBindings.every(binding => binding.locator?.type && binding.format
      && (binding.mode !== 'SHIFT_BY_FILENAME_DELTA' || generation.fileNameBindings?.some(item => Number(item.index) === Number(binding.referenceFileNameTimeIndex ?? 0)))))
  return Boolean(generation.fileNameBindings?.length || generation.contentBindings?.length)
}
const configurationTabs = computed(() => isOriginalMessage(form)
  ? [['basic', '基本信息'], ['content', '原报文正文'], ['target', '默认投递目标']]
  : [
      ['basic', '基本信息'], ['content', '报文内容'], ['data', '数据关联'],
      ...((isStructuredFile(form) || isUnstructuredFile(form)) ? [['file', isUnstructuredFile(form) ? '文件复制' : '文件模板']] : []), ['bindings', '变量绑定'], ['target', '默认投递目标']
    ])
const currentFormSnapshot = () => JSON.stringify(normalizedForm(form.status))
const isEditorDirty = computed(() => dialog.value === 'create'
  ? Boolean(createForm.name || createForm.description || createForm.type !== 'JSON' || createForm.businessType !== 'REALTIME' || createForm.timeGenerationMode !== 'DATA_POLICY')
  : dialog.value === 'edit' && Boolean(savedFormSnapshot.value) && currentFormSnapshot() !== savedFormSnapshot.value)
const saveError = ref('')
const reviewIssues = computed(() => {
  const issues = []
  if (!form.name?.trim()) issues.push({tab: 'basic', message: '填写报文名称'})
  if (!['REALTIME', 'FORECAST'].includes(form.businessType)) issues.push({tab: 'basic', message: '选择业务类型'})
  if (isStructuredFile(form) && !['RULE_DRIVEN', 'ORIGINAL_MESSAGE'].includes(form.fileGeneration?.processingMode)) issues.push({tab: 'basic', message: '明确选择报文处理方式'})
  if (!isOriginalMessage(form)) {
    try { JSON.parse(form.content || '') } catch { issues.push({tab: 'content', message: '修正报文 JSON 格式'}) }
  } else if (!String(form.content || '').trim()) {
    issues.push({tab: 'content', message: '填写原报文正文'})
  }
  if (!isOriginalMessage(form) && !hasCompleteDataBinding()) issues.push({tab: 'data', message: '完成数据源、数据项和要素关联'})
  if (!isOriginalMessage(form) && (isStructuredFile(form) || isUnstructuredFile(form)) && !form.fileGeneration?.sourceFilePath && !findFirstStringField(form.content, 'filePath')) issues.push({tab: 'file', message: '配置源文件地址'})
  if (!isOriginalMessage(form) && (isStructuredFile(form) || isUnstructuredFile(form)) && !hasFileGenerationRule()) issues.push({tab: 'file', message: isUnstructuredFile(form) ? '补全原始文件名、目标目录、文件名规则和 JSONPath' : (!hasMatchedFileRuleTemplate() ? '匹配并应用已发布文件规则模板' : (form.fileGeneration?.parserMode === 'PASSTHROUGH' ? '配置文件名时间规则' : '配置文件名或内容时间规则'))})
  if (isUnstructuredFile(form) && form.fileGeneration?.fileType === 'SHAPEFILE' && !shapefileSidecars.value.length) issues.push({tab: 'file', message: '至少选择一个 Shapefile 文件扩展名'})
  if (!isOriginalMessage(form) && (invalidTimeBindings.value.length || invalidValueBindings.value.length)) issues.push({tab: 'bindings', message: '修正变量绑定路径或值来源'})
  if (!hasCompleteTargets()) issues.push({tab: 'target', message: '为投递目标配置 Group 和 Topic'})
  return issues
})
const completedTabCount = computed(() => configurationTabs.value.length - new Set(reviewIssues.value.map(issue => issue.tab)).size)
const activeTabIndex = computed(() => Math.max(0, configurationTabs.value.findIndex(tab => tab[0] === activeTab.value)))
const hasPreviousTab = computed(() => activeTabIndex.value > 0)
const hasNextTab = computed(() => activeTabIndex.value < configurationTabs.value.length - 1)
const tabIssueCount = tab => reviewIssues.value.filter(issue => issue.tab === tab).length
const changedSections = computed(() => {
  if (!selected.value || !isEditorDirty.value) return []
  const groups = [
    ['基本信息', ['name', 'type', 'businessType', 'timeGenerationMode', 'description', 'encoding']], ['报文内容', ['content']],
    ['数据关联', ['dataBinding']], ['文件模板', ['fileGeneration']], ['变量绑定', ['bindings']], ['投递目标', ['deliveryTargets']]
  ]
  return groups.filter(([, keys]) => keys.some(key => JSON.stringify(form[key]) !== JSON.stringify(selected.value[key]))).map(([label]) => label)
})
function locateIssue(issue) {
  inspectorOpen.value = false
  activeTab.value = issue.tab
  requestAnimationFrame(() => {
    const panel = document.getElementById('config-panel-' + issue.tab)
    panel?.scrollIntoView({block: 'start'})
    panel?.querySelector('input, textarea, select, button')?.focus()
  })
}

watch(totalPages, value => { if (page.value > value) page.value = value })
watch(dataSourceFilter, () => { page.value = 1 })
watch(sourceKeyword, () => scheduleCatalogSearch('sources'))
watch(dataItemKeyword, () => scheduleCatalogSearch('dataItems'))
watch(elementKeyword, () => scheduleCatalogSearch('elements'))
watch(activeTargetComponentId, () => {
  groupSuggestionsOpen.value = false
  activeGroupSuggestionIndex.value = -1
  topicSuggestionsOpen.value = false
  activeTopicSuggestionIndex.value = -1
})
watch(activeTab, tab => { if (tab === 'data') initializeDataSelector() })
watch(() => form.type, (type, previousType) => {
  if (['FILE', 'UNSTRUCTURED_FILE'].includes(normalizeMessageType(type)) && !form.fileGeneration) {
    form.fileGeneration = createFileGeneration({}, normalizeMessageType(type))
  }
  if (type === 'FILE' && previousType === 'UNSTRUCTURED_FILE') {
    form.fileGeneration = createFileGeneration({processingMode: '', storageType: form.fileGeneration?.storageType, sourceFilePath: form.fileGeneration?.sourceFilePath || '', sourceFileName: form.fileGeneration?.sourceFileName || ''}, 'FILE')
  }
  if (type === 'UNSTRUCTURED_FILE') form.fileGeneration = normalizeFileGeneration(form.fileGeneration, 'UNSTRUCTURED_FILE')
  if (!['FILE', 'UNSTRUCTURED_FILE'].includes(normalizeMessageType(type))) {
    delete form.fileGeneration
    if (activeTab.value === 'file') activeTab.value = 'basic'
  }
})
watch([dialog, isEditorDirty], () => emit('editing-state', isEditorDirty.value), { immediate: true, flush: 'sync' })

function warnBeforeUnload(event) {
  if (!isEditorDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
function handleGlobalCreate(event) { if (event.detail?.page === 'messages') openCreate() }
onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  window.addEventListener('global-create', handleGlobalCreate)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  window.removeEventListener('global-create', handleGlobalCreate)
  clearTimeout(dataItemTimer); clearTimeout(sourceTimer); clearTimeout(elementTimer)
})

function syncForm() {
  if (!selected.value) return
  Object.keys(form).forEach(key => delete form[key])
  Object.assign(form, JSON.parse(JSON.stringify(selected.value)))
  form.businessType = form.businessType || 'UNKNOWN'
  form.timeGenerationMode = 'DATA_POLICY'
  delete form.timePlan
  form.bindings = (form.bindings || []).map(binding => normalizeTimeBinding(binding, form.businessType))
  if (!form.dataBinding) {
    const legacySource = props.sources.find(item => item.id === form.sourceId)
    form.dataBinding = {
      dataItemCode: legacySource?.code || legacySource?.dataItemCode || '',
      dataItemName: legacySource?.name || legacySource?.dataItemName || '',
      sourceCode: legacySource?.sourceCode || '', sourceName: legacySource?.sourceCodeName || '', elements: []
    }
  }
  form.deliveryTargets = deliveryTargetsOf(form)
  form.componentIds = form.deliveryTargets.map(item => item.componentId)
  form.componentId = form.componentIds[0] || ''
  activeTargetComponentId.value = form.deliveryTargets[0]?.targetId || ''
  if ((isStructuredFile(form) || isUnstructuredFile(form)) && !form.fileGeneration) {
    form.fileGeneration = createFileGeneration({}, form.type)
  }
  if (isStructuredFile(form) || isUnstructuredFile(form)) form.fileGeneration = normalizeFileGeneration(form.fileGeneration, form.type)
  fileInspection.value = null
  Object.assign(valueBindingDraft, { path: '', provider: 'MESSAGE_ID', targetType: 'string', value: '', format: 'yyyy-MM-dd HH:mm:ss' })
  bindingSection.value = 'time'
  bindingFilter.value = 'ALL'
  bindingKeyword.value = ''
  valueFieldKeyword.value = ''
  inspectorOpen.value = false
  valueBindingEditorOpen.value = false
  bindingPreviewOpen.value = false
  editingValueBindingId.value = ''
  savedFormSnapshot.value = currentFormSnapshot()
  if (isStructuredFile(form) && !isOriginalMessage(form) && !form.fileGeneration?.ruleTemplateId) nextTick(autoApplyMatchedFileRuleTemplate)
}
function openFor(item, target) {
  selectedId.value = item.id
  syncForm()
  if (target === 'edit') activeTab.value = 'basic'
  dialog.value = target
  if (target === 'edit') setRoute('messages', item.id, true)
}
function openCopy(item) {
  selectedId.value = item.id
  Object.assign(copyForm, {name: `${item.name} - 副本`, includeDeliveryTargets: false})
  copyError.value = ''
  dialog.value = 'copy'
}
function submitCopy() {
  const name = copyForm.name.trim()
  if (!name) { copyError.value = '请输入新报文名称'; return }
  if (props.templates.some(item => item.name.trim() === name)) { copyError.value = '该报文名称已存在，请修改后再复制'; return }
  copyError.value = ''
  emit('create', copyMessageDraft(selected.value, name, copyForm.includeDeliveryTargets), created => {
    dialog.value = ''
    selectedId.value = created.id
    setRoute('messages', created.id, true)
  }, error => { copyError.value = error || '复制失败，请重试' })
}
function openPreGenerate(item) {
  selectedId.value = item.id
  preGenerateForm.plannedTriggerTime = localDateTimeValue()
  preGeneration.value = null
  preGenerateError.value = ''
  dialog.value = 'pre-generate'
  runPreGeneration()
}
async function runPreGeneration() {
  const previousScrollTop = preGenerateCode.value?.scrollTop || 0
  preGenerateError.value = ''
  try {
    preGeneration.value = preGenerateMessage(selected.value, preGenerateForm.plannedTriggerTime)
    await nextTick()
    if (preGenerateCode.value) preGenerateCode.value.scrollTop = previousScrollTop
  }
  catch (error) { preGeneration.value = null; preGenerateError.value = error.message }
}
watch(() => props.routeId, id => {
  if (id === 'new') { dialog.value = 'create'; return }
  if (!id) { if (dialog.value === 'edit' || dialog.value === 'create') dialog.value = ''; return }
  const item = props.templates.find(row => row.id === id)
  if (item && (selectedId.value !== id || dialog.value !== 'edit')) openFor(item, 'edit')
}, {immediate: true})
watch(dialog, value => {
  if (value === 'edit') setRoute('messages', selectedId.value, true)
  else if (value === 'create') setRoute('messages', 'new')
  else if (value === '') setRoute('messages')
})
function normalizedForm(status = form.status) {
  const deliveryTargets = (form.deliveryTargets || []).filter(item => item.componentId).map(item => ({
    targetId: item.targetId || createRequestId(),
    componentId: item.componentId,
    type: componentOf(item.componentId)?.type || item.type || 'ROCKETMQ',
    producerGroup: String(item.producerGroup || '').trim(),
    topic: String(item.topic || '').trim()
  }))
  const componentIds = deliveryTargets.map(item => item.componentId)
  const firstTarget = deliveryTargets[0] || {}
  const dataBinding = { ...(form.dataBinding || {}), elements: [...(form.dataBinding?.elements || [])] }
  const fileGeneration = form.fileGeneration ? JSON.parse(JSON.stringify(form.fileGeneration)) : undefined
  // 生成文件的 SIM 标识由后端作为固定不变量维护，不接收历史页面保存的自定义值。
  if (fileGeneration) {
    delete fileGeneration.outputMarker
    delete fileGeneration.presetId
    for (const binding of [...(fileGeneration.fileNameBindings || []), ...(fileGeneration.contentBindings || [])]) {
      normalizeFileTimeSelection(binding, form.businessType)
      if (['RELATIVE', 'DERIVED', 'SHIFT_BY_FILENAME_DELTA'].includes(binding.mode)) binding.mode = 'SET'
      delete binding.relativeTo
      delete binding.offsetMinutes
      delete binding.referenceFileNameTimeIndex
    }
    if (isUnstructuredFile(form)) {
      delete fileGeneration.encoding
      delete fileGeneration.delimiter
      delete fileGeneration.timeColumn
      delete fileGeneration.sourceTimeFormat
      delete fileGeneration.contentBindings
      delete fileGeneration.parserMode
      fileGeneration.schemaVersion = 3
      fileGeneration.processingMode = 'BINARY_COPY'
      fileGeneration.referenceBindings = {
        fileNamePath: fileGeneration.fileNamePath, filePathPath: fileGeneration.filePathPath,
        fileTypePath: fileGeneration.fileTypePath, fileSizePath: fileGeneration.fileSizePath
      }
      fileGeneration.collisionPolicy = fileGeneration.overwritePolicy === 'FAIL' ? 'FAIL_IF_EXISTS' : 'OVERWRITE'
      if (fileGeneration.fileType === 'SHAPEFILE') fileGeneration.fileGroup = {sidecars: [...shapefileSidecars.value]}
      else delete fileGeneration.fileGroup
    }
  }
  const result = { ...form, status, deliveryTargets, componentIds, componentId: componentIds[0] || '', producerGroup: firstTarget.producerGroup || '', topic: firstTarget.topic || '', dataBinding, fileGeneration, bindings: (form.bindings || []).map(binding => normalizeTimeBinding(binding, form.businessType)) }
  result.timeGenerationMode = 'DATA_POLICY'
  delete result.timePlan
  if (isOriginalMessage(form)) {
    result.fileGeneration = {schemaVersion: 3, processingMode: 'ORIGINAL_MESSAGE'}
    result.bindings = []
    delete result.dataBinding
    delete result.sourceId
    result.contentSha256 = sha256Utf8(result.content || '')
  }
  return result
}
function save(afterSave) {
  saveError.value = ''
  if ((selected.value?.status === 'PUBLISHED' || referenceTasks.value.length) &&
      !window.confirm(`本次保存会创建待发布版本，关联 ${referenceTasks.value.length} 个任务将继续使用当前发布版本，其中 ${referenceTasks.value.filter(item => item.status === 'ENABLED').length} 个已启用自动调度。确认保存草稿？`)) return
  // “保存草稿”是明确的状态迁移动作：已发布报文发生配置变更后必须重新发布，
  // 避免页面展示的发布态与实际待审核配置不一致。
  const payload = normalizedForm('DRAFT')
  emit('update', payload, result => {
    if (result?.success) {
      form.status = payload.status
      savedFormSnapshot.value = currentFormSnapshot()
      if (typeof afterSave === 'function') afterSave()
    } else saveError.value = result?.error || '保存失败，输入已保留，请重试'
  })
}
function saveCurrentTab(afterSave) {
  if (activeTab.value === 'data') { saveDataBinding(afterSave); return }
  if (!isOriginalMessage(form) && (invalidTimeBindings.value.length || invalidValueBindings.value.length)) {
    emit('notify', '变量绑定配置不完整，请检查字段路径和值来源', 'error')
    activeTab.value = 'bindings'
    return
  }
  if (activeTab.value === 'target' && !hasCompleteTargets()) {
    emit('notify', '请为每个 MQ 实例分别选择 Producer Group 和 Topic', 'error')
    return
  }
  if (activeTab.value === 'file' && !hasFileGenerationRule()) {
    emit('notify', isUnstructuredFile(form) ? '请补全非结构化文件来源、目标目录、文件名规则和外层报文 JSONPath' : (!hasMatchedFileRuleTemplate() ? '当前三要素没有匹配的已发布文件规则模板' : (form.fileGeneration?.parserMode === 'PASSTHROUGH' ? '原样复制模式必须配置文件名时间规则' : '请至少配置一条文件名或内容时间规则')), 'error')
    return
  }
  save(afterSave)
}
function publish() {
  saveError.value = ''
  if (reviewIssues.value.length) { locateIssue(reviewIssues.value[0]); saveError.value = '请先完成下方待完善项，再发布'; return }
  if (!window.confirm(`将发布当前整份配置并替换任务后续执行使用的版本，关联 ${referenceTasks.value.length} 个任务。请确认配置和投递目标。继续发布？`)) return
  if (!isOriginalMessage(form) && (invalidTimeBindings.value.length || invalidValueBindings.value.length)) { emit('notify', '请先修正变量绑定配置', 'error'); activeTab.value = 'bindings'; return }
  if (!isOriginalMessage(form) && !hasCompleteDataBinding()) { emit('notify', '请先完成数据源、数据项和要素项关联', 'error'); activeTab.value = 'data'; return }
  if (!isOriginalMessage(form) && (isStructuredFile(form) || isUnstructuredFile(form)) && !hasFileGenerationRule()) {
    emit('notify', '请先完成 FILE 文件模板配置', 'error'); activeTab.value = 'file'; return
  }
  if (!hasCompleteTargets()) { emit('notify', '请先完成每个 MQ 实例的 Group 和 Topic 配置', 'error'); activeTab.value = 'target'; return }
  const payload = normalizedForm('PUBLISHED')
  emit('update', payload, result => {
    if (!result?.success) { saveError.value = result?.error || '发布失败，输入已保留'; return }
    form.status = payload.status
    savedFormSnapshot.value = currentFormSnapshot()
    // 发布成功仍停留当前章节，便于继续核对配置。
  })
}
function confirmEditorClose() {
  return !isEditorDirty.value || window.confirm('当前报文配置尚未保存，关闭后修改将丢失。是否继续关闭？')
}
function selectConfigurationTab(tab) {
  if (tab === activeTab.value) return
  activeTab.value = tab
}
function moveConfigurationTab(offset) {
  const next = configurationTabs.value[activeTabIndex.value + offset]
  if (next) selectConfigurationTab(next[0])
}
function saveAndNext() {
  if (!hasNextTab.value) { saveCurrentTab(); return }
  saveCurrentTab(() => moveConfigurationTab(1))
}
function handleConfigurationTabKey(event, tab) {
  const tabs = configurationTabs.value.map(item => item[0])
  const index = tabs.indexOf(tab)
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  selectConfigurationTab(tabs[nextIndex])
  requestAnimationFrame(() => document.querySelector(`[data-config-tab="${tabs[nextIndex]}"]`)?.focus())
}
function handleTargetTabKey(event, componentId) {
  const ids = (form.deliveryTargets || []).map(item => item.targetId)
  const index = ids.indexOf(componentId)
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
  activeTargetComponentId.value = ids[nextIndex]
  requestAnimationFrame(() => document.querySelector(`[data-target-tab="${ids[nextIndex]}"]`)?.focus())
}
function openTopicSuggestions() {
  groupSuggestionsOpen.value = false
  activeGroupSuggestionIndex.value = -1
  activeTopicSuggestionIndex.value = -1
  topicSuggestionsOpen.value = true
}
function openGroupSuggestions() {
  topicSuggestionsOpen.value = false
  activeTopicSuggestionIndex.value = -1
  activeGroupSuggestionIndex.value = -1
  groupSuggestionsOpen.value = true
}
function chooseGroup(group) {
  if (!activeDeliveryTarget.value) return
  activeDeliveryTarget.value.producerGroup = group
  groupSuggestionsOpen.value = false
  activeGroupSuggestionIndex.value = -1
}
function handleGroupKeydown(event) {
  if (event.key === 'Escape') {
    groupSuggestionsOpen.value = false
    activeGroupSuggestionIndex.value = -1
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
  if (event.key === 'Enter' && (!groupSuggestionsOpen.value || activeGroupSuggestionIndex.value < 0)) return
  event.preventDefault()
  groupSuggestionsOpen.value = true
  if (event.key === 'Enter') {
    chooseGroup(groupSuggestions.value[activeGroupSuggestionIndex.value])
    return
  }
  const direction = event.key === 'ArrowDown' ? 1 : -1
  const length = groupSuggestions.value.length
  activeGroupSuggestionIndex.value = length
    ? (activeGroupSuggestionIndex.value + direction + length) % length
    : -1
}
function chooseTopic(topic) {
  if (!activeDeliveryTarget.value) return
  activeDeliveryTarget.value.topic = topic
  topicSuggestionsOpen.value = false
  activeTopicSuggestionIndex.value = -1
}
function handleTopicKeydown(event) {
  if (event.key === 'Escape') {
    topicSuggestionsOpen.value = false
    activeTopicSuggestionIndex.value = -1
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
  if (event.key === 'Enter' && (!topicSuggestionsOpen.value || activeTopicSuggestionIndex.value < 0)) return
  event.preventDefault()
  topicSuggestionsOpen.value = true
  if (event.key === 'Enter') {
    chooseTopic(topicSuggestions.value[activeTopicSuggestionIndex.value])
    return
  }
  const direction = event.key === 'ArrowDown' ? 1 : -1
  const length = topicSuggestions.value.length
  activeTopicSuggestionIndex.value = length
    ? (activeTopicSuggestionIndex.value + direction + length) % length
    : -1
}
function formatContent() {
  try { form.content = JSON.stringify(JSON.parse(form.content), null, 2); emit('notify', 'JSON 格式化与校验通过') }
  catch { emit('notify', 'JSON 格式不合法', 'error') }
}
function openCreate() {
  Object.assign(createForm, { name: '', type: 'JSON', processingMode: '', businessType: 'REALTIME', timeGenerationMode: 'DATA_POLICY', description: '' })
  createError.value = ''
  dialog.value = 'create'
}
function isTargetSelected(componentId) { return selectedTargetIds.value.includes(componentId) }
function toggleTargetComponent(component, checked) {
  const targets = [...(form.deliveryTargets || [])]
  const index = targets.findIndex(item => item.componentId === component.id)
  if (checked && index < 0) {
    targets.push({ targetId: createRequestId(), componentId: component.id, type: component.type || 'ROCKETMQ', producerGroup: '', topic: '' })
    activeTargetComponentId.value = targets[targets.length - 1].targetId
  } else if (!checked && index >= 0) {
    targets.splice(index, 1)
    if (!targets.some(item => item.targetId === activeTargetComponentId.value)) activeTargetComponentId.value = targets[0]?.targetId || ''
  }
  form.deliveryTargets = targets
  form.componentIds = targets.map(item => item.componentId)
  form.componentId = form.componentIds[0] || ''
}
function addTargetForComponent(component) {
  const target = {targetId: createRequestId(), componentId: component.id, type: component.type || 'ROCKETMQ', producerGroup: '', topic: ''}
  form.deliveryTargets = [...(form.deliveryTargets || []), target]
  form.componentIds = form.deliveryTargets.map(item => item.componentId)
  form.componentId = form.componentIds[0] || ''
  activeTargetComponentId.value = target.targetId
}
function validateTargets() {
  for (const target of form.deliveryTargets || []) {
    emit('check-component', { id: target.componentId, topic: target.topic })
  }
}
const targetValidationPending = computed(() => (form.deliveryTargets || []).some(target =>
  isPending(`check:${target.componentId}:${target.topic || ''}`)
))
function hasCompleteTargets() {
  return Boolean(form.deliveryTargets?.length && form.deliveryTargets.every(item => componentOf(item.componentId) && item.topic && item.producerGroup))
}
function hasCompleteDataBinding() {
  return Boolean(form.dataBinding?.dataItemCode && form.dataBinding?.sourceCode && form.dataBinding?.elements?.length)
}
function scheduleCatalogSearch(level) {
  const timers = { dataItems: dataItemTimer, sources: sourceTimer, elements: elementTimer }
  clearTimeout(timers[level])
  const timer = setTimeout(() => {
    if (level === 'sources') loadSourceOptions()
    if (level === 'dataItems' && form.dataBinding?.sourceCode) loadDataItemOptions()
    if (level === 'elements' && form.dataBinding?.sourceCode) loadElementOptions()
  }, 300)
  if (level === 'dataItems') dataItemTimer = timer
  if (level === 'sources') sourceTimer = timer
  if (level === 'elements') elementTimer = timer
}
const catalogRequests = {dataItems: latestRequest(), sources: latestRequest(), elements: latestRequest()}
async function loadDataItemOptions() {
  const isLatest = catalogRequests.dataItems()
  catalogLoading.dataItems = true
  try { const rows = await api.searchDataItemOptions(form.dataBinding.sourceCode, dataItemKeyword.value, 20); if (isLatest()) dataItemOptions.value = rows }
  catch (error) { if (isLatest()) emit('notify', error.message, 'error') }
  finally { if (isLatest()) catalogLoading.dataItems = false }
}
async function loadSourceOptions() {
  const isLatest = catalogRequests.sources()
  catalogLoading.sources = true
  try { const rows = await api.searchDataSourceOptions(sourceKeyword.value, 20); if (isLatest()) sourceOptions.value = rows }
  catch (error) { if (isLatest()) emit('notify', error.message, 'error') }
  finally { if (isLatest()) catalogLoading.sources = false }
}
async function loadElementOptions() {
  const isLatest = catalogRequests.elements()
  catalogLoading.elements = true
  try { const rows = await api.searchElementOptions(form.dataBinding.dataItemCode, form.dataBinding.sourceCode, elementKeyword.value, 50); if (isLatest()) elementOptions.value = rows }
  catch (error) { if (isLatest()) emit('notify', error.message, 'error') }
  finally { if (isLatest()) catalogLoading.elements = false }
}
function confirmCascadeReset(message) {
  return !form.dataBinding?.dataItemCode && !form.dataBinding?.elements?.length || window.confirm(message)
}
function chooseDataSource(item) {
  if (form.dataBinding?.sourceCode === item.code) return
  if (!confirmCascadeReset('更换数据源将清空已选数据项和要素项，是否继续？')) return
  clearFileRuleTemplateReference()
  form.dataBinding = { dataItemCode: '', dataItemName: '', sourceCode: item.code, sourceName: item.name, elements: [] }
  form.sourceId = ''
  dataItemKeyword.value = ''; elementKeyword.value = ''; dataItemOptions.value = []; elementOptions.value = []
  loadDataItemOptions()
}
function chooseDataItem(item) {
  if (form.dataBinding?.dataItemCode === item.code) return
  if (form.dataBinding?.elements?.length && !window.confirm('更换数据项将清空已选要素项，是否继续？')) return
  clearFileRuleTemplateReference()
  form.dataBinding.dataItemCode = item.code
  form.dataBinding.dataItemName = item.name
  form.dataBinding.elements = []
  const legacySource = props.sources.find(source => (source.code || source.dataItemCode) === form.dataBinding.dataItemCode && source.sourceCode === form.dataBinding.sourceCode)
  form.sourceId = legacySource?.id || ''
  elementKeyword.value = ''; elementOptions.value = []
  loadElementOptions()
}
function isElementSelected(item) { return form.dataBinding?.elements?.some(element => element.id === item.id) }
function toggleElement(item) {
  clearFileRuleTemplateReference()
  const elements = [...(form.dataBinding?.elements || [])]
  const index = elements.findIndex(element => element.id === item.id)
  if (index >= 0) elements.splice(index, 1); else elements.push({ ...item })
  form.dataBinding.elements = elements
  nextTick(autoApplyMatchedFileRuleTemplate)
}
function toggleAllElements() {
  clearFileRuleTemplateReference()
  const allSelected = elementOptions.value.length && elementOptions.value.every(isElementSelected)
  const visibleIds = new Set(elementOptions.value.map(item => item.id))
  const retained = (form.dataBinding?.elements || []).filter(item => !visibleIds.has(item.id))
  form.dataBinding.elements = allSelected ? retained : [...retained, ...elementOptions.value.map(item => ({ ...item }))]
  nextTick(autoApplyMatchedFileRuleTemplate)
}
function initializeDataSelector() {
  sourceKeyword.value = form.dataBinding?.sourceCode || ''
  dataItemKeyword.value = form.dataBinding?.dataItemCode || ''
  elementKeyword.value = ''
  loadSourceOptions()
  if (form.dataBinding?.sourceCode) loadDataItemOptions()
  if (form.dataBinding?.sourceCode) loadElementOptions()
}
function saveDataBinding(afterSave) {
  if (!hasCompleteDataBinding()) { emit('notify', '请依次选择数据源、数据项和至少一个要素项', 'error'); return }
  save(afterSave)
}
function timeBindingOf(path) {
  return (form.bindings || []).find(binding => binding.path === path && (binding.kind === 'TIME_RULE' || binding.kind === 'TIME_OFFSET'))
}
function timeStrategyLabel(binding) {
  const strategy = normalizeTimeBinding(binding, form.businessType).strategy
  return timeStrategies.find(item => item[0] === strategy)?.[1] || '未配置'
}
function timeStrategyLabelForField(field) {
  const binding = timeBindingOf(field.path)
  return binding ? timeStrategyLabel(binding) : '不替换'
}
function timeStrategyDescription(strategy) {
  return describeTimeStrategy(strategy, 'DATA_POLICY')
}
function normalizeBindingsForBusinessType() {
  form.bindings = (form.bindings || []).map(binding => normalizeTimeBinding(binding, form.businessType))
  if (form.businessType === 'REALTIME' && valueBindingDraft.provider === 'PERIOD_END_TIME') {
    valueBindingDraft.provider = 'BUSINESS_BASE_TIME'
  }
  if (form.businessType === 'REALTIME' && form.fileGeneration) {
    for (const binding of [...(form.fileGeneration.fileNameBindings || []), ...(form.fileGeneration.contentBindings || [])]) {
      normalizeFileTimeSelection(binding, form.businessType)
    }
  }
}
function normalizeFileTimeSelection(binding, businessType = form.businessType) {
  const source = binding.provider || binding.source || 'BUSINESS_BASE_TIME'
  let category = binding.sourceCategory || fileTimeCategory(source)
  if (businessType === 'REALTIME' && category === 'FORECAST_TIME') category = 'ISSUE_TIME'
  const options = fileTimeOptions(category)
  binding.sourceCategory = category
  binding.source = options.some(option => option[0] === source) ? source : options[0][0]
  delete binding.provider
  return binding
}
function fileTimeMethods(binding) { return fileTimeOptions(binding.sourceCategory || fileTimeCategory(binding.source)) }
function changeFileTimeCategory(binding) { binding.source = fileTimeOptions(binding.sourceCategory)[0][0] }
function toggleTimeBinding(field) {
  const list = [...(form.bindings || [])]
  const index = list.findIndex(binding => binding.path === field.path && (binding.kind === 'TIME_RULE' || binding.kind === 'TIME_OFFSET'))
  if (index >= 0) list.splice(index, 1)
  else list.push({ id: `time-rule-${Date.now()}-${list.length}`, kind: 'TIME_RULE', path: field.path, strategy: recommendedTimeStrategy(field.path, form.businessType), format: field.format })
  form.bindings = list
}
function updateTimeStrategy(field, strategy) {
  const list = [...(form.bindings || [])]
  const index = list.findIndex(binding => binding.path === field.path)
  const item = normalizeTimeBinding({ ...(index >= 0 ? list[index] : {}), id: index >= 0 ? list[index].id : `time-rule-${Date.now()}-${list.length}`, kind: 'TIME_RULE', path: field.path, strategy, format: field.format }, form.businessType)
  if (index >= 0) list[index] = item; else list.push(item)
  form.bindings = list
}
function bindAllTimeFields() {
  const existing = [...(form.bindings || [])]
  detectedTimeFields.value.forEach(field => {
    if (!existing.some(binding => binding.path === field.path && (binding.kind === 'TIME_RULE' || binding.kind === 'TIME_OFFSET'))) existing.push({ id: `time-rule-${Date.now()}-${existing.length}`, kind: 'TIME_RULE', path: field.path, strategy: recommendedTimeStrategy(field.path, form.businessType), format: field.format })
  })
  form.bindings = existing.map(binding => normalizeTimeBinding(binding, form.businessType))
}
function toggleAllTimeBindings() {
  if (!allTimeFieldsSelected.value) {
    bindAllTimeFields()
    return
  }
  const detectedPaths = new Set(detectedTimeFields.value.map(field => field.path))
  form.bindings = (form.bindings || []).filter(binding => !detectedPaths.has(binding.path)
    || (binding.kind !== 'TIME_RULE' && binding.kind !== 'TIME_OFFSET'))
}
function openValueBindingEditor(binding) {
  editingValueBindingId.value = binding?.id || ''
  Object.assign(valueBindingDraft, binding ? {
    path: binding.path || '', provider: binding.provider || 'MESSAGE_ID', targetType: binding.targetType || 'string',
    value: binding.value ?? '', format: binding.format || 'yyyy-MM-dd HH:mm:ss'
  } : { path: '', provider: 'MESSAGE_ID', targetType: 'string', value: '', format: 'yyyy-MM-dd HH:mm:ss' })
  valueFieldKeyword.value = ''
  valueBindingEditorOpen.value = true
}
function saveValueBinding() {
  if (!valueBindingDraft.path) { emit('notify', '请先选择要绑定的报文字段', 'error'); return }
  if (valueRuleBindings.value.some(binding => binding.path === valueBindingDraft.path && binding.id !== editingValueBindingId.value)) {
    emit('notify', '该字段已经配置系统值绑定', 'error'); return
  }
  const binding = {
    id: editingValueBindingId.value || `value-rule-${Date.now()}-${(form.bindings || []).length}`,
    kind: 'VALUE_RULE', path: valueBindingDraft.path, provider: valueBindingDraft.provider,
    targetType: valueBindingDraft.targetType || 'string'
  }
  if (['PLANNED_TRIGGER_TIME', 'BUSINESS_BASE_TIME', 'PERIOD_END_TIME'].includes(binding.provider)) binding.format = valueBindingDraft.format
  if (binding.provider === 'CONSTANT') binding.value = valueBindingDraft.value
  const list = [...(form.bindings || [])]
  const index = list.findIndex(item => item.id === editingValueBindingId.value)
  if (index >= 0) list[index] = binding
  else list.push(binding)
  form.bindings = list
  valueBindingEditorOpen.value = false
  editingValueBindingId.value = ''
  Object.assign(valueBindingDraft, { path: '', provider: 'MESSAGE_ID', targetType: 'string', value: '', format: 'yyyy-MM-dd HH:mm:ss' })
}
function removeValueBinding(id) {
  if (!window.confirm('确认删除这条系统值绑定？对应报文字段将在执行时保持模板原值。')) return
  form.bindings = (form.bindings || []).filter(binding => binding.id !== id)
  valueBindingEditorOpen.value = false
  editingValueBindingId.value = ''
}
function valueProviderLabel(provider) { return valueProviders.find(item => item[0] === provider)?.[1] || provider }
async function copyBindingPath(path) {
  try { await navigator.clipboard.writeText(path); emit('notify', '字段路径已复制') }
  catch { emit('notify', '复制失败，请手动复制字段路径', 'error') }
}
function openBindingPreview() {
  bindingPreviewTime.value = localDateTimeValue()
  bindingPreviewOpen.value = true
  runBindingPreview()
}
function runBindingPreview() {
  bindingPreviewError.value = ''
  try { bindingPreview.value = preGenerateMessage(form, bindingPreviewTime.value) }
  catch (error) { bindingPreview.value = null; bindingPreviewError.value = error.message }
}
async function inspectSourceFile() {
  const sourceReference = form.fileGeneration?.sourceFilePath || form.fileGeneration?.sourceFileName || findFirstStringField(form.content, 'filePath')
  if (!sourceReference) { emit('notify', '请填写源文件地址，或先在报文内容中配置 filePath', 'error'); return }
  fileInspecting.value = true
  try {
    const configuredDelimiter = form.fileGeneration?.delimiter
    const inspectionDelimiter = configuredDelimiter && configuredDelimiter !== 'AUTO' ? configuredDelimiter : (/\.txt(?:\?|$)/i.test(sourceReference) ? 'TAB' : ',')
    fileInspection.value = await api.inspectFile(sourceReference, inspectionDelimiter, form.fileGeneration?.storageType || 'OSS')
    const detected = fileInspection.value.timeColumns || []
    if (detected.length) emit('notify', `已识别 ${detected.length} 个日期字段，请确认需要替换的字段`)
    else emit('notify', '扫描完成，但未识别到完整日期字段；可配置组合字段或键值规则', 'error')
  } catch (error) { emit('notify', error.message, 'error') }
  finally { fileInspecting.value = false }
}
/** 三要素改变时解除旧模板引用；已有内联规则保留，避免用户配置被无提示清空。 */
function clearFileRuleTemplateReference() {
  if (!form.fileGeneration) return
  delete form.fileGeneration.ruleTemplateId
  delete form.fileGeneration.ruleTemplateVersion
  delete form.fileGeneration.ruleTemplateName
}

/** 三要素唯一命中已发布模板时自动复制稳定规则快照。 */
function autoApplyMatchedFileRuleTemplate() {
  if (form.type !== 'FILE' || isOriginalMessage(form) || matchedFileRuleTemplates.value.length !== 1) return
  const template = matchedFileRuleTemplates.value[0]
  // 已应用同一模板时保留锁定版本，升级必须由配置人员明确确认。
  if (form.fileGeneration?.ruleTemplateId === template.id) return
  form.fileGeneration = normalizeFileGeneration(applyFileRuleTemplate(form.fileGeneration, template))
  fileInspection.value = null
  emit('notify', `已根据数据源、数据项和要素项自动应用“${template.name}”`)
}

/** 使用候选模板的完整要素集合，并立即建立唯一模板快照。 */
function chooseCandidateFileRuleTemplate(template) {
  const templateElements = Array.isArray(template.binding?.elements) ? template.binding.elements : []
  const byCode = new Map([...elementOptions.value, ...templateElements].map(item => [String(item.code || item), item]))
  form.dataBinding.elements = elementCodesOf(template.binding).map(code => {
    const item = byCode.get(code)
    return typeof item === 'object' ? {...item} : {id: code, code, name: ''}
  })
  clearFileRuleTemplateReference()
  nextTick(autoApplyMatchedFileRuleTemplate)
}

/** 配置人员确认后才把模板新版本复制到当前报文草稿。 */
function upgradeFileRuleTemplate() {
  if (!templateUpgradeAvailable.value || !matchedTemplate.value) return
  if (!window.confirm(`文件规则模板“${matchedTemplate.value.name}”已有新版本，确认更新当前报文草稿中的规则快照？`)) return
  form.fileGeneration = normalizeFileGeneration(applyFileRuleTemplate(form.fileGeneration, matchedTemplate.value))
  fileInspection.value = null
  emit('notify', `已更新“${matchedTemplate.value.name}”的规则快照，请检查并重新发布报文`)
}

/** 切换为 Shapefile 时使用标准四件套，其他文件类型不保留文件组。 */
function changeUnstructuredFileType() {
  if (form.fileGeneration.fileType === 'SHAPEFILE') {
    form.fileGeneration.fileGroup = {sidecars: [...SHAPEFILE_EXTENSIONS]}
  } else delete form.fileGeneration.fileGroup
}

/** 更新一个 Shapefile 扩展名选择。 */
function toggleShapefileSidecar(extension, checked) {
  const selectedExtensions = new Set(shapefileSidecars.value)
  if (checked) selectedExtensions.add(extension); else selectedExtensions.delete(extension)
  form.fileGeneration.fileGroup = {sidecars: SHAPEFILE_EXTENSIONS.filter(item => selectedExtensions.has(item))}
}
function addDetectedContentBinding(column) {
  const bindings = form.fileGeneration.contentBindings || (form.fileGeneration.contentBindings = [])
  if (bindings.some(binding => binding.fields?.includes(column.columnName))) return
  bindings.push({mode: 'SHIFT', fields: [column.columnName], format: column.format, source: 'BUSINESS_BASE_TIME'})
}
function changeFileParserMode() {
  fileInspection.value = null
  form.fileGeneration.contentBindings = form.fileGeneration.parserMode === 'FIXED_WIDTH'
    ? [{mode: 'SHIFT', fields: ['Year', 'Month', 'Day', 'Hour'], source: 'BUSINESS_BASE_TIME'}]
    : []
}
function chooseUnstructuredFileNameCandidate(event) {
  const candidate = unstructuredFileNameCandidates.value.find(item => item.index === Number(event.target.value))
  form.fileGeneration.fileNameBindings = candidate ? [{...candidate, sourceCategory: 'ISSUE_TIME', source: 'BUSINESS_BASE_TIME'}] : []
}
function changeFileProcessingMode() {
  const mode = form.fileGeneration?.processingMode || ''
  if (!mode) return
  if (mode === 'ORIGINAL_MESSAGE') {
    form.fileGeneration = normalizeFileGeneration({schemaVersion: 3, processingMode: mode}, 'FILE')
    form.bindings = []
    form.dataBinding = {dataItemCode: '', dataItemName: '', sourceCode: '', sourceName: '', elements: []}
    fileInspection.value = null
    if (['data', 'bindings'].includes(activeTab.value)) activeTab.value = 'file'
    emit('notify', '系统将按发布版本原样发送正文，不处理正文引用的文件')
    return
  }
  form.fileGeneration = normalizeFileGeneration(createFileGeneration({processingMode: mode}, 'FILE'), 'FILE')
}
const contentSha256 = item => item?.contentSha256 || sha256Utf8(item?.content || '')
function submitCreate() {
  if (!createForm.name.trim()) { createError.value = '请输入报文名称'; return }
  if (createForm.type === 'FILE' && !['RULE_DRIVEN', 'ORIGINAL_MESSAGE'].includes(createForm.processingMode)) { createError.value = '请选择报文处理方式'; return }
  createError.value = ''
  const fileReference = ['FILE', 'UNSTRUCTURED_FILE'].includes(createForm.type)
  const defaultMessageId = createRequestId()
  const item = {
    ...createForm, name: createForm.name.trim(), description: createForm.description.trim(), status: 'DRAFT', encoding: 'UTF-8', sourceId: '',
    dataBinding: { dataItemCode: '', dataItemName: '', sourceCode: '', sourceName: '', elements: [] },
    deliveryTargets: [],
    componentIds: [], componentId: '', producerGroup: '', topic: '',
    content: fileReference ? JSON.stringify({metadata: {messageId: defaultMessageId}, records: [{effectTimePeriod: {startTime: '2025/06/10 00:00:00', endTime: '2025/06/13 00:00:00'}, fileName: 'SOURCE.csv', filePath: 'forecast/SOURCE.csv', fileType: 'csv', planFileSize: '0'}]}, null, 2) : JSON.stringify({metadata: {messageId: defaultMessageId}, records: []}, null, 2),
    fileGeneration: fileReference ? createFileGeneration(createForm.type === 'FILE' ? {processingMode: createForm.processingMode} : {}, createForm.type) : undefined,
    bindings: [{ id: `value-rule-${Date.now()}-0`, kind: 'VALUE_RULE', path: '$.metadata.messageId', provider: 'MESSAGE_ID', targetType: 'string' }]
  }
  if (createForm.type === 'FILE' && createForm.processingMode === 'ORIGINAL_MESSAGE') {
    item.dataBinding = undefined; item.bindings = []; item.content = ''
  }
  emit('create', item, created => { selectedId.value = created.id; syncForm(); activeTab.value = isOriginalMessage(created) ? 'content' : 'data'; dialog.value = 'edit' }, error => { createError.value = error || '保存失败，请重试' })
}
function confirmDelete() {
  if (!selected.value || referenceTasks.value.length) return
  emit('remove', selected.value.id, () => { selectedId.value = ''; dialog.value = '' })
}
</script>

<template>
  <main class="page message-page">
    <div v-show="!routeId" class="page-heading"><div><h1>报文模板</h1><p>每行展示一份报文，点击名称查看完整配置。</p></div><button v-if="canManage" class="button primary" @click="openCreate"><AppIcon name="plus" :size="16" />新建报文</button></div>
    <section v-show="!routeId" class="card message-list-card">
      <ListFilters>
        <label><span>搜索报文</span><SearchInput v-model="keyword" aria-label="搜索报文" placeholder="名称、数据源名称或 Topic" /></label>
        <label>数据源<select v-model="dataSourceFilter"><option value="ALL">全部数据源</option><option value="UNASSOCIATED">未关联数据源</option><option v-for="source in messageSourceOptions" :key="source[0]" :value="source[0]">{{ source[1] }}（{{ source[0] }}）</option></select></label>
        <label>状态<select v-model="statusFilter"><option value="ALL">全部</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option></select></label>
        <button v-if="keyword || statusFilter !== 'ALL' || dataSourceFilter !== 'ALL'" class="link-button" @click="keyword = ''; statusFilter = 'ALL'; dataSourceFilter = 'ALL'">清除筛选</button>
      </ListFilters>
      <div class="table-scroll"><table class="data-table management-table message-table"><thead><tr><th>报文名称</th><th class="responsive-low">数据源名称</th><th class="responsive-low">关联数据项</th><th>关联 Topic</th><th>状态</th><th class="operation-cell">操作</th></tr></thead><tbody>
        <tr v-for="item in visibleTemplates" :key="item.id">
          <td><button class="management-primary message-name" @click="openFor(item, 'detail')">{{ item.name }}</button><small>{{ item.description || '暂无业务描述' }}</small></td>
          <td class="management-body responsive-low"><TruncatedText :text="dataSourceName(item)" /></td>
          <td class="management-body responsive-low"><TruncatedText :text="dataItemName(item)" /></td>
          <td class="management-body target-cell"><TruncatedText :text="targetTopicsOf(item).join('、') || '未关联'" code copyable /></td>
          <td class="status-cell"><StatusBadge :status="item.status" /></td>
          <td class="operation-cell"><div class="row-actions"><button class="link-button" @click="openFor(item, 'detail')">查看</button><button v-if="canManage" class="link-button" @click="openFor(item, 'edit')">配置</button><button class="link-button" @click="openPreGenerate(item)">预生成</button><button v-if="canManage" class="link-button" @click="openCopy(item)">复制</button><button v-if="canManage" class="link-button danger-text" @click="openFor(item, 'delete')">删除</button></div></td>
        </tr>
        <tr v-if="!visibleTemplates.length"><td colspan="6" class="empty-state"><template v-if="templates.length">没有匹配的报文。<br><button class="link-button empty-state-action" @click="keyword = ''; statusFilter = 'ALL'; dataSourceFilter = 'ALL'">清除筛选</button></template><template v-else>还没有报文模板。<br><button v-if="canManage" class="link-button empty-state-action" @click="openCreate">新建第一份报文</button></template></td></tr>
      </tbody></table></div>
      <ListPagination v-model:page="page" v-model:page-size="pageSize" :total="filteredTemplates.length" :total-pages="totalPages" />
    </section>

    <AppModal v-if="dialog === 'detail' && selected" title="报文详情" wide @close="dialog = ''">
      <div class="message-detail unified-detail">
        <DetailHeader eyebrow="业务报文" :title="selected.name" :code="selected.id" :description="selected.description || '未填写业务描述'">
          <template #aside><StatusBadge :status="selected.status"/></template>
        </DetailHeader>
        <DetailGrid :columns="3">
          <div><dt>报文类型</dt><dd>{{ selected.type }} 报文</dd></div><div><dt>业务类型</dt><dd>{{ businessTypeLabel(selected.businessType) }}</dd></div><div><dt>处理方式</dt><dd>{{ isOriginalMessage(selected) ? '原报文直发' : (isUnstructuredFile(selected) ? '文件原样复制' : '按规则生成') }}</dd></div><div v-if="!isOriginalMessage(selected)"><dt>关联数据项</dt><dd>{{ dataItemName(selected) }}</dd></div><div><dt>默认编码</dt><dd>{{ selected.encoding || 'UTF-8' }}</dd></div>
        </DetailGrid>
        <DetailSection title="数据关联" v-if="!isOriginalMessage(selected)" description="报文生成时使用的数据源、数据项与要素项">
          <div class="binding-overview"><div><span>数据源</span><b>{{ selected.dataBinding?.sourceName || '未关联' }}</b><code>{{ selected.dataBinding?.sourceCode || '—' }}</code></div><div><span>数据项</span><b>{{ selected.dataBinding?.dataItemName || '未关联' }}</b><code>{{ selected.dataBinding?.dataItemCode || '—' }}</code></div></div>
          <div class="linked-elements-card">
            <div class="linked-elements-heading"><b>要素项</b><span>{{ selected.dataBinding?.elements?.length || 0 }} 项</span></div>
            <div v-if="selected.dataBinding?.elements?.length" class="linked-elements-list"><span v-for="element in selected.dataBinding.elements" :key="element.id || element.code"><code>{{ element.code || '—' }}</code><b>{{ element.name || '未命名要素' }}</b></span></div>
            <div v-else class="linked-elements-empty">尚未选择要素项</div>
          </div>
        </DetailSection>
        <DetailSection v-if="(selected.bindings || []).some(item => item.kind === 'TIME_RULE' || item.kind === 'TIME_OFFSET')" title="时间规则" :count="(selected.bindings || []).filter(item => item.kind === 'TIME_RULE' || item.kind === 'TIME_OFFSET').length">
          <div class="table-scroll"><table class="data-table"><thead><tr><th>报文字段路径</th><th>生成规则</th><th>输出格式</th></tr></thead><tbody><tr v-for="binding in (selected.bindings || []).filter(item => item.kind === 'TIME_RULE' || item.kind === 'TIME_OFFSET')" :key="binding.id"><td><code class="detail-path">{{ binding.path }}</code></td><td>{{ timeStrategyLabel(binding) }}</td><td><code class="detail-format">{{ binding.format || 'yyyy-MM-dd HH:mm:ss' }}</code></td></tr></tbody></table></div>
        </DetailSection>
        <DetailSection v-if="(selected.bindings || []).some(item => item.kind === 'VALUE_RULE')" title="系统值绑定" :count="(selected.bindings || []).filter(item => item.kind === 'VALUE_RULE').length">
          <div class="table-scroll"><table class="data-table"><thead><tr><th>报文字段路径</th><th>值来源</th><th>目标类型</th></tr></thead><tbody><tr v-for="binding in (selected.bindings || []).filter(item => item.kind === 'VALUE_RULE')" :key="binding.id"><td><code class="detail-path">{{ binding.path }}</code></td><td>{{ valueProviderLabel(binding.provider) }}</td><td><code class="detail-format">{{ binding.targetType || 'string' }}</code></td></tr></tbody></table></div>
        </DetailSection>
        <DetailSection v-if="isOriginalMessage(selected)" title="原报文直发" description="系统按发布版本原样发送正文，不处理正文引用的文件。">
          <DetailGrid :columns="2"><div><dt>正文 SHA-256</dt><dd><code>{{ contentSha256(selected) }}</code></dd></div><div><dt>正文编码</dt><dd>UTF-8</dd></div></DetailGrid>
        </DetailSection>
        <DetailSection v-else-if="isStructuredFile(selected) || isUnstructuredFile(selected)" title="文件生成配置" :description="isUnstructuredFile(selected) ? '文件内容按字节原样复制，只替换文件名和外层报文中的文件引用。' : '文件会被解析，已配置的内容时间字段会按业务时间改写。'">
          <DetailGrid :columns="4"><div><dt>文件存储</dt><dd>{{ normalizeStorageType(selected.fileGeneration?.storageType) }}</dd></div><div><dt>原始文件</dt><dd>{{ selected.fileGeneration?.sourceFilePath || selected.fileGeneration?.sourceFileName || '读取报文 filePath' }}</dd></div><div><dt>文件名时间</dt><dd>{{ selected.fileGeneration?.fileNameBindings?.length || 0 }} 项</dd></div><div><dt>{{ isUnstructuredFile(selected) ? '处理方式' : '内容时间' }}</dt><dd>{{ isUnstructuredFile(selected) ? '原样复制' : `${selected.fileGeneration?.contentBindings?.length || (selected.fileGeneration?.timeColumn ? 1 : 0)} 项` }}</dd></div></DetailGrid>
        </DetailSection>
        <DetailSection title="默认投递目标" description="一次任务执行会分别向以下目标投递" :count="deliveryTargetsOf(selected).length">
          <div v-if="deliveryTargetsOf(selected).length" class="table-scroll"><table class="data-table"><thead><tr><th>投递组件</th><th>通道</th><th>Producer Group / Topic</th></tr></thead><tbody><tr v-for="target in deliveryTargetsOf(selected)" :key="target.componentId"><td><b>{{ componentOf(target.componentId)?.name || target.componentId }}</b></td><td>RocketMQ</td><td>{{ target.producerGroup || '未配置' }} / {{ target.topic || '未配置' }}</td></tr></tbody></table></div><div v-else class="inline-empty">尚未配置 RocketMQ 投递目标</div>
        </DetailSection>
        <DetailSection title="模板原文" description="数据库中保存的模板内容；实际投递报文请前往执行记录查看" collapsible>
          <pre class="code-block">{{ selected.content || '未配置报文内容' }}</pre>
        </DetailSection>
      </div>
      <template #footer><button class="button secondary" @click="openPreGenerate(selected)">{{ isOriginalMessage(selected) ? '预览原报文' : '预生成报文' }}</button><button class="button secondary" @click="dialog = ''">关闭</button><button v-if="canManage" class="button primary" @click="dialog = 'edit'; activeTab = 'basic'; syncForm()">配置报文</button></template>
    </AppModal>

    <AppDetailPage v-if="canManage && dialog === 'edit' && selected" :title="`配置报文 · ${selected.name}`" :before-close="confirmEditorClose" @close="dialog = ''">
      <section class="editor-status-strip"><div><StatusBadge :status="form.status || 'DRAFT'"/><span v-if="isEditorDirty" class="unsaved-indicator" role="status">未保存</span><span>关联 {{ referenceTasks.length }} 个任务 · {{ referenceTasks.filter(item => item.status === 'ENABLED').length }} 个已启用</span></div><button class="issue-summary" :class="{ ready: !reviewIssues.length }" @click="inspectorOpen = true">{{ reviewIssues.length ? `待完善 ${reviewIssues.length} 项` : '配置检查通过' }} →</button></section>
      <p v-if="saveError" class="notice pre-generate-error" role="alert">{{ saveError }}</p>
      <template #header-actions><button v-if="selected.status !== 'PUBLISHED'" class="button primary" :disabled="isPending(`update:messages:${selected.id}`)" @click="publish">{{ isPending(`update:messages:${selected.id}`) ? '正在发布…' : '发布报文' }}</button></template>
      <div class="message-context"><div><b>{{ selected.name }}</b><small>{{ selected.type }} · {{ selected.description }}</small></div></div>
      <div v-if="selected.status === 'PUBLISHED' && isEditorDirty" class="published-edit-notice"><b>正在修改已发布报文</b><span>保存后形成待发布修改；当前已发布版本继续生效，重新发布后新配置才用于后续执行。</span></div>
      <div class="editor-workbench">
      <header class="editor-step-header">
        <div class="config-step-navigation"><span class="config-step-label">配置步骤</span><small>已完成 {{ completedTabCount }}/{{ configurationTabs.length }} · 草稿可暂存未完成配置</small></div>
        <nav class="tabs" role="tablist" aria-label="报文配置步骤"><button v-for="(tab, index) in configurationTabs" :key="tab[0]" type="button" role="tab" :data-config-tab="tab[0]" :aria-controls="`config-panel-${tab[0]}`" :aria-selected="activeTab === tab[0]" :tabindex="activeTab === tab[0] ? 0 : -1" :class="{ active: activeTab === tab[0], complete: !tabIssueCount(tab[0]) }" @click="selectConfigurationTab(tab[0])" @keydown="handleConfigurationTabKey($event, tab[0])"><i>{{ index + 1 }}</i><span>{{ tab[1] }}</span><small v-if="tabIssueCount(tab[0])" class="tab-issue-count">{{ tabIssueCount(tab[0]) }}</small></button></nav>
      </header>
      <div class="editor-main">
      <section v-if="activeTab === 'basic'" id="config-panel-basic" class="config-panel" role="tabpanel"><div class="card-heading"><div><h2>基本信息</h2><p>业务类型和结构化 FILE 的处理方式由报文本身明确声明。</p></div></div><div class="form-grid"><label>报文名称<input v-model="form.name"></label><label>报文类型<select v-model="form.type"><option value="JSON">JSON 报文</option><option value="FILE">结构化 FILE</option><option value="UNSTRUCTURED_FILE">非结构化 FILE</option></select></label><label v-if="isStructuredFile(form)">报文处理方式（必填）<select v-model="form.fileGeneration.processingMode" @change="changeFileProcessingMode"><option value="" disabled>请选择</option><option value="RULE_DRIVEN">按规则生成</option><option value="ORIGINAL_MESSAGE">原报文直发</option></select><small>选择后，系统会立即调整后续配置步骤并清理互斥字段。</small></label><label v-else-if="isUnstructuredFile(form)">报文处理方式<input value="二进制文件复制" disabled></label><label>业务类型<select v-model="form.businessType" @change="normalizeBindingsForBusinessType"><option value="UNKNOWN" disabled>请选择</option><option value="REALTIME">实况</option><option value="FORECAST">预报</option></select><small>实况直接使用任务触发时间；预报按数据项的起报点、时段和间隔生成。</small></label><label>业务描述<input v-model="form.description"></label><label v-if="!isUnstructuredFile(form) && !isOriginalMessage(form)">默认编码<select v-model="form.encoding"><option>UTF-8</option><option>GBK</option></select></label></div><div v-if="isOriginalMessage(form)" class="notice original-message-notice"><b>系统将按发布版本原样发送正文，不处理正文引用的文件。</b><span>时间、Message ID、文件名、路径、空格、字段顺序、换行和转义形式均保持不变。</span></div></section>
      <section v-else-if="activeTab === 'content'" id="config-panel-content" class="config-panel" role="tabpanel"><div class="card-heading"><div><h2>{{ isOriginalMessage(form) ? '原报文正文' : '报文内容' }}</h2><p>{{ isOriginalMessage(form) ? '保存原始字符序列；执行时不会格式化、替换字段或修改空格与换行。' : '使用 JSON 结构与变量占位符定义最终报文。' }}</p></div><button v-if="!isOriginalMessage(form)" class="button secondary" @click="formatContent">格式化 / 校验</button></div><textarea v-model="form.content" class="code-editor" spellcheck="false"></textarea><div v-if="isOriginalMessage(form)" class="notice subtle"><b>正文 SHA-256：</b><code>{{ contentSha256(form) }}</code></div><div class="button-row"><button class="button secondary" @click="editorPreview = true">查看原文</button></div></section>
      <section v-else-if="activeTab === 'data'" id="config-panel-data" class="config-panel" role="tabpanel"><div class="card-heading"><div><h2>数据关联</h2><p>依次选择数据源、该数据源提供的数据项，以及参与报文生成的要素项。</p></div></div><div class="data-linkage-grid">
        <section class="linkage-step"><h3><span>1</span>选择数据源</h3><p>按来源编码或中文名称远程搜索，最多返回 20 条。</p><label class="catalog-search">搜索数据源<input v-model="sourceKeyword" placeholder="输入来源编码或中文名称"></label><div class="catalog-options"><button v-for="item in sourceOptions" :key="item.code" type="button" :class="{ selected: form.dataBinding?.sourceCode === item.code }" @click="chooseDataSource(item)"><code>{{ item.code }}</code><b>{{ item.name || '未配置中文名称' }}</b><small>{{ item.dataItemCount }} 个数据项</small></button><div v-if="catalogLoading.sources" class="catalog-empty">正在搜索…</div><div v-else-if="!sourceOptions.length" class="catalog-empty">没有匹配的数据源</div></div></section>
        <section class="linkage-step" :class="{ disabled: !form.dataBinding?.sourceCode }"><h3><span>2</span>选择数据项</h3><p>只显示所选数据源实际提供的数据项。</p><label class="catalog-search">筛选数据项<input v-model="dataItemKeyword" :disabled="!form.dataBinding?.sourceCode" placeholder="数据项编码或中文名称"></label><div class="catalog-options"><button v-for="item in dataItemOptions" :key="item.code" type="button" :class="{ selected: form.dataBinding?.dataItemCode === item.code }" @click="chooseDataItem(item)"><code>{{ item.code }}</code><b>{{ item.name || '未配置中文名称' }}</b><small>{{ item.elementCount }} 个要素</small></button><div v-if="catalogLoading.dataItems" class="catalog-empty">正在加载…</div><div v-else-if="form.dataBinding?.sourceCode && !dataItemOptions.length" class="catalog-empty">没有匹配的数据项</div></div></section>
        <section class="linkage-step element-step" :class="{ disabled: !form.dataBinding?.sourceCode }"><h3><span>3</span>选择要素项</h3><p>支持搜索、多选及全选当前结果。</p><label class="catalog-search">搜索要素项<input v-model="elementKeyword" :disabled="!form.dataBinding?.sourceCode" placeholder="要素编码或中文名称"></label><button class="select-all" type="button" :disabled="!elementOptions.length" @click="toggleAllElements">全选/取消当前结果 · 已选 {{ form.dataBinding?.elements?.length || 0 }} 项</button><div class="element-options"><label v-for="item in elementOptions" :key="item.id" :class="{ selected: isElementSelected(item) }"><input type="checkbox" :checked="isElementSelected(item)" @change="toggleElement(item)"><span><b>{{ item.code }} · {{ item.name || '未配置中文名称' }}</b><small>{{ item.unit || '无单位' }} · {{ item.dataFormat || '未配置格式' }}</small></span></label><div v-if="catalogLoading.elements" class="catalog-empty">正在加载…</div><div v-else-if="form.dataBinding?.sourceCode && !elementOptions.length" class="catalog-empty">没有匹配的要素项</div></div></section>
      </div><div class="binding-summary"><div><b>{{ form.dataBinding?.sourceCode || '未选择数据源' }} / {{ form.dataBinding?.dataItemCode || '未选择数据项' }}</b><small>{{ form.dataBinding?.sourceName || '—' }} · {{ form.dataBinding?.dataItemName || '—' }}</small><div class="selected-element-chips"><span v-for="element in form.dataBinding?.elements" :key="element.id">{{ element.code }} {{ element.name }}</span></div></div><strong>已选 {{ form.dataBinding?.elements?.length || 0 }} 个要素</strong></div></section>
      <section v-else-if="activeTab === 'file'" id="config-panel-file" class="config-panel file-template-panel" role="tabpanel">
        <div class="card-heading"><div><h2>{{ isUnstructuredFile(form) ? '非结构化文件复制' : '结构化文件生成规则' }}</h2><p>{{ isUnstructuredFile(form) ? '配置源文件、目标位置和外层报文引用；不解析文件正文。' : '按文件规则模板解析内容并替换已配置的时间字段。' }}</p></div><button v-if="isStructuredFile(form)" class="button secondary" :disabled="fileInspecting || ['PASSTHROUGH', 'POSITIONAL_TEXT', 'FIXED_WIDTH'].includes(form.fileGeneration.parserMode)" @click="inspectSourceFile">{{ fileInspecting ? '正在识别…' : '识别文件结构' }}</button></div>
        <section v-if="isStructuredFile(form)" class="file-rule-section preset-section">
          <div><span class="section-index">01</span><div><h3>文件规则模板</h3><p>按数据源、数据项和完整要素集合自动匹配唯一的已发布模板。</p></div></div>
          <div v-if="hasMatchedFileRuleTemplate()" class="matched-file-template"><span>已应用</span><div><b>{{ form.fileGeneration.ruleTemplateName || matchedTemplate?.name || form.fileGeneration.ruleTemplateId }}</b><small v-if="templateUpgradeAvailable">模板已有新版本，当前报文仍使用已锁定快照。</small></div><button v-if="templateUpgradeAvailable" class="button secondary small" type="button" @click="upgradeFileRuleTemplate">可升级</button></div>
          <div v-else-if="candidateTemplates.length" class="file-template-candidates"><p>请选择适用模板，系统会同时带入该模板的完整要素集合：</p><button v-for="template in candidateTemplates" :key="template.id" type="button" @click="chooseCandidateFileRuleTemplate(template)"><b>{{ template.name }}</b><small>{{ elementCodesOf(template.binding).join('、') }}</small><span>使用此模板</span></button></div>
          <div v-else class="file-rule-empty">当前数据源和数据项下没有可用的已发布文件规则模板。请先完成模板配置并发布。</div>
        </section>
        <section class="file-rule-section">
          <div><span class="section-index">{{ isUnstructuredFile(form) ? '01' : '02' }}</span><div><h3>源文件与目标位置</h3><p>{{ isUnstructuredFile(form) ? '源文件内容保持不变，目标文件名按业务时间生成。' : '编码、分隔符和解析方式来自已应用的规则模板。' }}</p></div></div>
          <div class="form-grid file-source-grid">
            <label>文件存储<select v-model="form.fileGeneration.storageType"><option value="OSS">阿里云 OSS</option><option value="OBS">华为云 OBS</option><option value="HTTP">HTTP（Nginx）</option></select></label>
            <label class="wide-field">源文件地址<input v-model.trim="form.fileGeneration.sourceFilePath" :placeholder="form.fileGeneration.storageType === 'HTTP' ? '例如 http://127.0.0.1:8088/files/source.nc' : '例如 forecast/source.nc'"></label>
            <label>原始文件名<input v-model.trim="form.fileGeneration.sourceFileName" placeholder="例如 forecast_2026091708.nc"></label>
            <template v-if="isUnstructuredFile(form)">
              <label>文件类型<select v-model="form.fileGeneration.fileType" @change="changeUnstructuredFileType"><option v-for="type in ['NC','PNG','JPG','TIF','GRIB','ZIP','SHAPEFILE','OTHER']" :key="type" :value="type">{{ type === 'SHAPEFILE' ? 'Shapefile' : type === 'OTHER' ? '其他文件' : type }}</option></select></label>
              <label class="wide-field">目标目录<input v-model.trim="form.fileGeneration.targetDirectory" placeholder="例如 generated/weather"></label>
              <label>文件名时间片段<select :value="form.fileGeneration.fileNameBindings[0]?.index ?? ''" @change="chooseUnstructuredFileNameCandidate"><option value="">请选择识别出的时间片段</option><option v-for="candidate in unstructuredFileNameCandidates" :key="candidate.index" :value="candidate.index">第 {{ Number(candidate.index || 0) + 1 }} 个时间：{{ candidate.sourceText || '历史样例不可用，请重新填写原始文件名' }}</option></select><small>{{ unstructuredFileNameCandidates.length ? '选择原始文件名中需要替换的时间。' : '请先填写包含日期时间的原始文件名。' }}</small></label>
              <label v-if="form.fileGeneration.fileNameBindings.length">文件名时间格式<input v-model.trim="form.fileGeneration.fileNameBindings[0].format" placeholder="yyyyMMddHH"></label>
              <fieldset v-if="form.fileGeneration.fileNameBindings.length" class="file-time-source-field wide-field"><legend>文件名时间来源</legend><div class="file-time-source-control"><select v-model="form.fileGeneration.fileNameBindings[0].sourceCategory" aria-label="一级时间来源" @change="changeFileTimeCategory(form.fileGeneration.fileNameBindings[0])"><option v-for="source in availableFileTimeSources" :key="source[0]" :value="source[0]">{{ source[1] }}</option></select><span aria-hidden="true">对应</span><select v-model="form.fileGeneration.fileNameBindings[0].source" aria-label="时间来源具体方式"><option v-for="option in fileTimeMethods(form.fileGeneration.fileNameBindings[0])" :key="option[0]" :value="option[0]">{{ option[1] }}</option></select></div></fieldset>
              <label>同名文件<select v-model="form.fileGeneration.overwritePolicy"><option value="OVERWRITE">覆盖已有文件</option><option value="FAIL">停止并报错</option></select></label>
              <label>文件名 JSONPath<input v-model.trim="form.fileGeneration.fileNamePath" placeholder="$.fileName"></label>
              <label>文件路径 JSONPath<input v-model.trim="form.fileGeneration.filePathPath" placeholder="$.filePath"></label>
              <label>文件类型 JSONPath<input v-model.trim="form.fileGeneration.fileTypePath" placeholder="$.fileType"></label>
              <label>文件大小 JSONPath<input v-model.trim="form.fileGeneration.fileSizePath" placeholder="$.fileSize"></label>
              <fieldset v-if="form.fileGeneration.fileType === 'SHAPEFILE'" class="wide-field shapefile-group"><legend>Shapefile 文件组</legend><p>主文件和所选附属文件使用同一基础名同步复制；任一文件失败时不投递报文。</p><label v-for="extension in SHAPEFILE_EXTENSIONS" :key="extension"><input type="checkbox" :checked="shapefileSidecars.includes(extension)" @change="toggleShapefileSidecar(extension, $event.target.checked)">{{ extension }}</label></fieldset>
            </template>
            <template v-else>
              <label>解析方式<select v-model="form.fileGeneration.parserMode" @change="changeFileParserMode"><option value="PASSTHROUGH">仅替换文件名（内容原样复制）</option><option value="DELIMITED">表格 / 分隔文本</option><option value="KEY_VALUE">键值文本</option><option value="POSITIONAL_TEXT">无表头文本定位</option><option value="FIXED_WIDTH">定长文本</option></select></label><label>字符编码<select v-model="form.fileGeneration.encoding"><option value="AUTO">自动识别</option><option value="UTF-8">UTF-8</option><option value="GB18030">GB18030</option></select></label><label>字段分隔符<select v-model="form.fileGeneration.delimiter"><option value="AUTO">自动识别</option><option value=",">逗号</option><option value="TAB">制表符</option><option value="|">竖线</option><option value=";">分号</option></select></label>
            </template>
          </div>
        </section>
        <div v-if="isUnstructuredFile(form)" class="notice"><b>文件内容按字节原样复制，只替换文件名和外层报文中的文件引用。</b><span v-if="form.fileGeneration.fileType === 'SHAPEFILE'"> Shapefile 主文件和附属文件同步复制。</span></div>
        <div v-else class="notice"><b>结构化处理：</b>文件会被解析，已配置的内容时间字段会按业务时间改写。PASSTHROUGH 模式下源文件内容按字节复制，仅替换文件名和外层报文中的文件引用。时间替换规则由文件规则模板统一维护。</div>
      </section>
      <section v-else-if="activeTab === 'bindings'" id="config-panel-bindings" class="config-panel time-binding-panel" role="tabpanel">
        <div class="binding-page-heading"><div><h2>变量绑定</h2><p>明确每个报文字段在执行时如何生成；没有启用的字段保持模板原值。</p></div><div class="button-row compact"><button class="button secondary" type="button" @click="editorPreview = true">查看模板原文</button><button class="button secondary" type="button" @click="openBindingPreview">预览绑定结果</button></div></div>
        <nav class="binding-section-tabs" role="tablist" aria-label="变量绑定类型">
          <button type="button" role="tab" :aria-selected="bindingSection === 'time'" :class="{ active: bindingSection === 'time' }" @click="bindingSection = 'time'; bindingKeyword = ''"><span>时间字段</span><b>{{ configuredTimeBindingCount }}/{{ detectedTimeFields.length }}</b></button>
          <button type="button" role="tab" :aria-selected="bindingSection === 'value'" :class="{ active: bindingSection === 'value' }" @click="bindingSection = 'value'; bindingKeyword = ''"><span>系统字段</span><b>{{ valueRuleBindings.length }}</b></button>
        </nav>

        <section v-if="bindingSection === 'time'" class="binding-workspace" aria-label="时间字段绑定">
          <div class="binding-toolbar">
            <SearchInput v-model="bindingKeyword" aria-label="搜索时间字段" placeholder="搜索字段名称、JSONPath 或示例值" />
            <div class="binding-filter" role="group" aria-label="时间字段筛选"><button v-for="item in [['ALL','全部'],['ACTIVE','已启用'],['INACTIVE','保持原值']]" :key="item[0]" type="button" :aria-pressed="bindingFilter === item[0]" :class="{ active: bindingFilter === item[0] }" @click="bindingFilter = item[0]">{{ item[1] }}</button></div>
            <label class="binding-select-all"><input type="checkbox" :checked="allTimeFieldsSelected" :indeterminate="someTimeFieldsSelected && !allTimeFieldsSelected" aria-label="全选时间字段替换" @change="toggleAllTimeBindings"><span>{{ allTimeFieldsSelected ? '取消全选' : '全选' }}</span></label>
            <button class="button secondary" type="button" :disabled="!detectedTimeFields.length" @click="bindAllTimeFields">应用推荐规则</button>
          </div>
          <div class="time-rule-context"><div><span>当前时间</span><b>本次任务触发时间</b></div><i>→</i><div><span>起报时间</span><b>{{ form.businessType === 'FORECAST' ? '按数据项起报点确定' : '与任务触发时间一致' }}</b></div><i>→</i><div><span>预报时间</span><b>{{ form.businessType === 'FORECAST' ? '按数据项时段和间隔生成' : '实况不使用' }}</b></div></div>
          <div v-if="!detectedTimeFields.length" class="binding-empty">没有识别到日期时间字段。请先在“报文内容”中填写支持的日期格式。</div>
          <div v-else-if="!visibleTimeFields.length" class="binding-empty">当前筛选条件下没有字段。</div>
          <div v-else class="mapping-list time-mapping-list">
            <article v-for="field in visibleTimeFields" :key="field.path" class="mapping-row" :class="{ active: timeBindingOf(field.path) }">
              <label class="mapping-toggle"><input type="checkbox" :checked="Boolean(timeBindingOf(field.path))" :aria-label="`绑定 ${field.field}`" @change="toggleTimeBinding(field)"><span></span></label>
              <div class="mapping-field"><div><b>{{ field.field }}</b><em>{{ timeBindingOf(field.path) ? '已启用' : '保持原值' }}</em></div><button type="button" title="复制字段路径" @click="copyBindingPath(field.path)"><code>{{ field.path }}</code><span>复制</span></button><small>当前值：{{ field.sample }} · {{ field.format }}</small></div>
              <div class="mapping-arrow">→</div>
              <div class="mapping-rule" :class="{ disabled: !timeBindingOf(field.path) }"><label><span class="visually-hidden">生成方式</span><select :disabled="!timeBindingOf(field.path)" :value="timeBindingOf(field.path)?.strategy || ''" :aria-label="`${field.field} 生成规则`" @change="updateTimeStrategy(field, $event.target.value)"><option v-for="strategy in timeStrategiesForPath(field.path, form.businessType)" :key="strategy[0]" :value="strategy[0]">{{ strategy[1] }}</option></select></label></div>
            </article>
          </div>
          <div class="binding-help"><b>时间来源说明</b><p><strong>当前时间：</strong>{{ timeStrategyDescription('TASK_TRIGGER_TIME') }}<strong>起报时间：</strong>{{ timeStrategyDescription('BUSINESS_BASE_TIME') }}</p><p v-if="form.businessType === 'FORECAST'"><strong>预报时间：</strong>{{ timeStrategyDescription('DATA_INTERVAL_SEQUENCE') }}<strong>预报结束时间：</strong>{{ timeStrategyDescription('PERIOD_END_TIME') }}</p><small>{{ form.businessType === 'FORECAST' ? '预报使用数据项的 period、period_interval 和 pre_time_point；参数不符合文件要求时请先修改数据项。' : '实况直接使用任务触发时间，不读取或强制校验预报时段、间隔和预报时点。' }}</small></div>
        </section>

        <section v-else class="binding-workspace" aria-label="系统字段绑定">
          <div class="system-binding-heading"><div><h3>系统字段绑定</h3><p>将消息 ID、执行时间或固定值写入指定报文字段。</p></div><button class="button primary" type="button" @click="openValueBindingEditor()">添加绑定</button></div>
          <div class="binding-toolbar system-toolbar"><SearchInput v-model="bindingKeyword" aria-label="搜索系统字段绑定" placeholder="搜索字段路径、值来源或配置值" /><span>已配置 {{ valueRuleBindings.length }} 项</span></div>
          <div v-if="valueRuleBindings.filter(binding => !bindingKeyword || [binding.path, valueProviderLabel(binding.provider), binding.value, binding.format].some(value => String(value || '').toLowerCase().includes(bindingKeyword.toLowerCase()))).length" class="mapping-list system-mapping-list">
            <article v-for="binding in valueRuleBindings.filter(binding => !bindingKeyword || [binding.path, valueProviderLabel(binding.provider), binding.value, binding.format].some(value => String(value || '').toLowerCase().includes(bindingKeyword.toLowerCase())))" :key="binding.id" class="mapping-row active">
              <div class="mapping-kind">{{ binding.provider === 'MESSAGE_ID' ? 'ID' : 'SYS' }}</div>
              <div class="mapping-field"><div><b>{{ binding.path.split('.').pop() }}</b><em v-if="binding.provider === 'MESSAGE_ID'">推荐</em></div><button type="button" title="复制字段路径" @click="copyBindingPath(binding.path)"><code>{{ binding.path }}</code><span>复制</span></button><small>输出类型：{{ binding.targetType || 'string' }}</small></div>
              <div class="mapping-arrow">→</div>
              <div class="mapping-rule"><span>值来源</span><b>{{ valueProviderLabel(binding.provider) }}</b><small>{{ binding.provider === 'CONSTANT' ? `固定值：${binding.value}` : (binding.format || '每次执行自动生成') }}</small></div>
              <button class="button secondary mapping-edit" type="button" @click="openValueBindingEditor(binding)">编辑</button>
            </article>
          </div>
          <div v-else class="binding-empty">{{ bindingKeyword ? '没有匹配的系统字段绑定。' : '还没有系统字段绑定。点击“添加绑定”选择报文字段和值来源。' }}</div>
        </section>
      </section>
      <section v-else id="config-panel-target" class="config-panel" role="tabpanel">
        <div class="card-heading"><div><h2>默认投递目标</h2><p>所有 JSON 和文件处理结果都作为报文正文，通过 RocketMQ 的 Group 和 Topic 发送。</p></div><button class="button secondary" :disabled="!hasCompleteTargets() || targetValidationPending" @click="validateTargets">{{ targetValidationPending ? '正在验证…' : '验证全部目标' }}</button></div>
        <div class="target-form">
          <fieldset class="target-instance-field"><legend>投递目标实例（可多选）</legend><div class="instance-options">
            <label v-for="item in rocketComponents" :key="item.id" class="instance-option" :class="{ selected: isTargetSelected(item.id) }"><input type="checkbox" :checked="isTargetSelected(item.id)" @change="toggleTargetComponent(item, $event.target.checked)"><span><b>{{ item.name }}</b><small>RocketMQ · {{ item.namesrvAddr || item.nameServer }}</small></span><button class="link-button small" type="button" @click.prevent="addTargetForComponent(item)">添加目标</button></label>
          </div><p v-if="!form.deliveryTargets?.length" class="field-error">请至少选择一个 MQ 实例。</p></fieldset>
          <template v-if="form.deliveryTargets?.length">
            <span class="target-tabs-label">已选实例配置</span>
            <div class="target-tabs" role="tablist" aria-label="已选 MQ 实例">
              <button v-for="target in form.deliveryTargets" :key="target.targetId" type="button" role="tab" :data-target-tab="target.targetId" :aria-controls="`target-panel-${target.targetId}`" :aria-selected="activeTargetComponentId === target.targetId" :tabindex="activeTargetComponentId === target.targetId ? 0 : -1" :class="{ active: activeTargetComponentId === target.targetId }" @click="activeTargetComponentId = target.targetId" @keydown="handleTargetTabKey($event, target.targetId)"><span>{{ componentOf(target.componentId)?.name || target.componentId }}</span><small>{{ target.producerGroup || '未选 Group' }} · {{ target.topic || '未选 Topic' }}</small></button>
            </div>
            <div v-if="activeDeliveryTarget" :id="`target-panel-${activeTargetComponentId}`" class="target-editor" role="tabpanel">
              <div class="target-editor-heading"><div><b>{{ activeTargetComponent?.name }}</b><small>{{ activeTargetComponent?.namesrvAddr || activeTargetComponent?.nameServer }}</small></div><span>当前实例独立配置</span></div>
              <div class="form-grid"><label class="group-field">Producer Group<div class="group-combobox"><input v-model.trim="activeDeliveryTarget.producerGroup" role="combobox" aria-autocomplete="list" :aria-expanded="groupSuggestionsOpen" :aria-controls="`group-suggestions-${activeTargetComponentId}`" :aria-activedescendant="activeGroupSuggestionIndex >= 0 ? `group-option-${activeTargetComponentId}-${activeGroupSuggestionIndex}` : undefined" placeholder="输入 Group 名称进行模糊搜索" autocomplete="off" @focus="$event.target.select(); openGroupSuggestions()" @input="openGroupSuggestions" @keydown="handleGroupKeydown" @blur="groupSuggestionsOpen = false"><div v-if="groupSuggestionsOpen" :id="`group-suggestions-${activeTargetComponentId}`" class="group-suggestions" role="listbox"><button v-for="(group, index) in groupSuggestions" :id="`group-option-${activeTargetComponentId}-${index}`" :key="group" type="button" role="option" :aria-selected="activeGroupSuggestionIndex === index" :class="{ active: activeGroupSuggestionIndex === index }" @mouseenter="activeGroupSuggestionIndex = index" @mousedown.prevent="chooseGroup(group)">{{ group }}</button><span v-if="!groupSuggestions.length" class="group-empty">没有匹配项，可直接使用当前输入</span></div></div><small class="group-hint">支持模糊搜索和手动输入，最多显示 20 条建议。</small></label><label class="topic-field">Topic<div class="topic-combobox"><input v-model.trim="activeDeliveryTarget.topic" role="combobox" aria-autocomplete="list" :aria-expanded="topicSuggestionsOpen" :aria-controls="`topic-suggestions-${activeTargetComponentId}`" :aria-activedescendant="activeTopicSuggestionIndex >= 0 ? `topic-option-${activeTargetComponentId}-${activeTopicSuggestionIndex}` : undefined" placeholder="输入 Topic 名称进行模糊搜索" autocomplete="off" @focus="$event.target.select(); openTopicSuggestions()" @input="openTopicSuggestions" @keydown="handleTopicKeydown" @blur="topicSuggestionsOpen = false"><div v-if="topicSuggestionsOpen" :id="`topic-suggestions-${activeTargetComponentId}`" class="topic-suggestions" role="listbox"><button v-for="(topic, index) in topicSuggestions" :id="`topic-option-${activeTargetComponentId}-${index}`" :key="topic" type="button" role="option" :aria-selected="activeTopicSuggestionIndex === index" :class="{ active: activeTopicSuggestionIndex === index }" @mouseenter="activeTopicSuggestionIndex = index" @mousedown.prevent="chooseTopic(topic)">{{ topic }}</button><span v-if="!topicSuggestions.length" class="topic-empty">没有匹配项，可直接使用当前输入</span></div></div><small class="topic-hint">支持模糊搜索和手动输入，最多显示 20 条建议。</small></label></div>
            </div>
          </template>
        </div>
        <div class="notice"><b>执行规则：</b>一次任务执行会把同一份最终报文正文向每个已选 RocketMQ 目标分别发送，并独立记录成功与失败。</div>
      </section>
      </div>
      </div>
      <AppDrawer v-if="inspectorOpen" title="配置检查" description="发布前逐项确认报文内容、数据关联、变量规则和投递目标。" @close="inspectorOpen = false">
        <div class="drawer-status" :class="{ ready: !reviewIssues.length }"><b>{{ reviewIssues.length ? `${reviewIssues.length} 项待完善` : '可以发布' }}</b><span>{{ isEditorDirty ? '当前有未保存修改' : '当前修改已保存' }}</span></div>
        <dl class="inspector-facts"><div><dt>当前版本</dt><dd>{{ form.status === 'PUBLISHED' ? '已发布' : '草稿' }}</dd></div><div><dt>已完成步骤</dt><dd>{{ completedTabCount }}/{{ configurationTabs.length }}</dd></div><div><dt>关联任务</dt><dd>{{ referenceTasks.length }} 个</dd></div></dl>
        <div v-if="reviewIssues.length" class="inspector-issues"><button v-for="issue in reviewIssues" :key="`${issue.tab}-${issue.message}`" type="button" @click="locateIssue(issue)"><span>{{ configurationTabs.find(tab => tab[0] === issue.tab)?.[1] }}</span><b>{{ issue.message }}</b><i>→</i></button></div>
        <div v-else class="inspector-ready"><b>页面配置完整</b><span>仍请在发布前核对业务内容和投递目标。</span></div>
        <template #footer><button class="button secondary" type="button" @click="inspectorOpen = false">关闭</button></template>
      </AppDrawer>
      <AppDrawer v-if="valueBindingEditorOpen" :title="editingValueBindingId ? '编辑系统字段绑定' : '添加系统字段绑定'" description="选择报文字段，并指定执行时写入该字段的值。" wide @close="valueBindingEditorOpen = false">
        <div class="drawer-form">
          <label>搜索报文字段<input v-model="valueFieldKeyword" placeholder="字段名称、JSONPath 或当前值"></label>
          <fieldset class="field-picker"><legend>报文字段</legend><label v-for="field in drawerScalarFields" :key="field.path" :class="{ selected: valueBindingDraft.path === field.path, bound: valueRuleBindings.some(binding => binding.path === field.path && binding.id !== editingValueBindingId) }"><input v-model="valueBindingDraft.path" type="radio" :value="field.path" :disabled="valueRuleBindings.some(binding => binding.path === field.path && binding.id !== editingValueBindingId)"><span><b>{{ field.field }}</b><code>{{ field.path }}</code><small>{{ valueRuleBindings.some(binding => binding.path === field.path && binding.id !== editingValueBindingId) ? '已配置绑定' : `当前值：${String(field.sample ?? '')}` }}</small></span></label><p v-if="!drawerScalarFields.length">没有匹配的报文字段。</p></fieldset>
          <label>值来源<select v-model="valueBindingDraft.provider"><option v-for="provider in availableValueProviders" :key="provider[0]" :value="provider[0]">{{ provider[1] }}</option></select></label>
          <label>输出类型<select v-model="valueBindingDraft.targetType"><option>string</option><option>integer</option><option>number</option><option>boolean</option><option>json</option></select></label>
          <label v-if="valueBindingDraft.provider === 'CONSTANT'">固定值<input v-model="valueBindingDraft.value" placeholder="输入固定值"></label>
          <label v-else-if="['PLANNED_TRIGGER_TIME', 'BUSINESS_BASE_TIME', 'PERIOD_END_TIME'].includes(valueBindingDraft.provider)">时间格式<select v-model="valueBindingDraft.format"><option>yyyy-MM-dd HH:mm:ss</option><option>yyyy/MM/dd HH:mm:ss</option></select></label>
          <div class="binding-result-summary"><span>绑定结果</span><b>{{ valueBindingDraft.path || '尚未选择字段' }}</b><small>{{ valueProviderLabel(valueBindingDraft.provider) }} → {{ valueBindingDraft.targetType }}</small></div>
        </div>
        <template #footer><button v-if="editingValueBindingId" class="button danger" type="button" @click="removeValueBinding(editingValueBindingId)">删除绑定</button><span class="drawer-footer-spacer"></span><button class="button secondary" type="button" @click="valueBindingEditorOpen = false">取消</button><button class="button primary" type="button" @click="saveValueBinding">{{ editingValueBindingId ? '保存修改' : '添加绑定' }}</button></template>
      </AppDrawer>
      <AppDrawer v-if="bindingPreviewOpen" title="预览绑定结果" description="基于当前未保存配置生成，仅用于检查字段替换，不会投递或保存。" wide @close="bindingPreviewOpen = false">
        <div class="binding-preview-settings"><label>当前时间<input v-model="bindingPreviewTime" type="datetime-local" step="1"></label><button class="button primary" type="button" @click="runBindingPreview">重新生成</button></div>
        <p v-if="bindingPreviewError" class="notice pre-generate-error" role="alert">{{ bindingPreviewError }}</p>
        <template v-else-if="bindingPreview"><div class="binding-preview-summary"><div><span>已替换</span><b>{{ bindingPreview.replacementCount }} 个字段</b></div><div><span>未启用时间字段</span><b>{{ detectedTimeFields.length - configuredTimeBindingCount }} 个</b></div><div><span>存在问题</span><b :class="{ warning: bindingPreview.warnings.length }">{{ bindingPreview.warnings.length }} 项</b></div></div><div v-if="bindingPreview.replacedPaths.length" class="replaced-paths"><span>本次替换</span><code v-for="path in bindingPreview.replacedPaths" :key="path">{{ path }}</code></div><div v-if="bindingPreview.warnings.length" class="notice warning-notice">{{ bindingPreview.warnings.join('；') }}</div><pre class="code-block binding-preview-code">{{ bindingPreview.content }}</pre></template>
        <template #footer><button class="button secondary" type="button" @click="bindingPreviewOpen = false">关闭</button></template>
      </AppDrawer>
      <template #footer><span class="save-hint">{{ changedSections.length ? `已修改：${changedSections.join('、')}` : '当前没有未保存修改' }}</span><button v-if="hasPreviousTab" class="button secondary" type="button" @click="moveConfigurationTab(-1)">上一步</button><button class="button secondary" :disabled="(activeTab === 'data' && !hasCompleteDataBinding()) || isPending(`update:messages:${selected.id}`)" @click="saveCurrentTab">{{ isPending(`update:messages:${selected.id}`) ? '正在保存…' : '保存草稿' }}</button><button v-if="hasNextTab" class="button primary" :disabled="(activeTab === 'data' && !hasCompleteDataBinding()) || isPending(`update:messages:${selected.id}`)" @click="saveAndNext">保存并下一步</button></template>
    </AppDetailPage>

    <AppDetailPage v-if="canManage && dialog === 'create'" title="新建报文" :before-close="confirmEditorClose" @close="dialog = ''"><p class="muted">先明确报文业务语义和处理方式，再进入后续配置。</p><div class="form-grid"><label>报文名称（必填）<input v-model="createForm.name" autofocus placeholder="例如 weather_station_message" @input="createError = ''"></label><label>报文类型（必填）<select v-model="createForm.type" @change="createForm.processingMode = ''"><option value="JSON">JSON 报文</option><option value="FILE">结构化 FILE</option><option value="UNSTRUCTURED_FILE">非结构化 FILE</option></select></label><label v-if="createForm.type === 'FILE'">报文处理方式（必填）<select v-model="createForm.processingMode"><option value="" disabled>请选择</option><option value="RULE_DRIVEN">按规则生成</option><option value="ORIGINAL_MESSAGE">原报文直发</option></select></label><label v-else-if="createForm.type === 'UNSTRUCTURED_FILE'">报文处理方式<input value="二进制文件复制" disabled></label><label>业务类型（必填）<select v-model="createForm.businessType"><option value="REALTIME">实况</option><option value="FORECAST">预报</option></select><small>实况不校验预报参数；预报使用数据项的起报点、时段和间隔。</small></label><label>业务描述<input v-model="createForm.description" placeholder="简要说明报文用途"></label></div><div class="notice">结构化 FILE 必须明确选择处理方式；原报文直发只保留正文和投递目标步骤。一天多个执行时间直接配置在任务 Cron 中。</div><p v-if="createError" class="status-badge negative">{{ createError }}</p><template #footer><button class="button secondary" @click="confirmEditorClose() && (dialog = '')">取消</button><button class="button primary" :disabled="isPending('create:messages')" @click="submitCreate">{{ isPending('create:messages') ? '正在创建…' : '创建并继续配置' }}</button></template></AppDetailPage>
    <AppModal v-if="canManage && dialog === 'delete' && selected" title="删除报文" @close="dialog = ''"><p>确定删除报文 <b>{{ selected.name }}</b> 吗？删除后无法恢复。</p><div v-if="referenceTasks.length" class="notice"><b>当前不能删除：</b>该报文仍被 {{ referenceTasks.length }} 个任务引用：{{ referenceTasks.map(item => item.name).join('、') }}。</div><div v-else class="notice">该报文没有被任务引用，确认后将删除该配置。</div><template #footer><button class="button secondary" @click="dialog = ''">取消</button><button class="button danger" :disabled="referenceTasks.length || isPending(`remove:messages:${selected.id}`)" @click="confirmDelete">{{ isPending(`remove:messages:${selected.id}`) ? '正在删除…' : '确认删除' }}</button></template></AppModal>
    <AppModal v-if="canManage && dialog === 'copy' && selected" title="复制报文" @close="dialog = ''">
      <div class="copy-source-summary"><span>来源报文</span><b>{{ selected.name }}</b><small>{{ selected.type }} · {{ selected.status === 'PUBLISHED' ? '已发布' : '草稿' }}</small></div>
      <div class="form-grid copy-form"><label>新报文名称（必填）<input v-model.trim="copyForm.name" autofocus @input="copyError = ''"></label></div>
      <label class="copy-target-option"><input v-model="copyForm.includeDeliveryTargets" type="checkbox"><span><b>同时复制 MQ 投递目标</b><small>默认不复制，避免副本被误用于原有 Topic 和 Group。</small></span></label>
      <p v-if="copyError" class="field-error" role="alert">{{ copyError }}</p>
      <div class="notice">报文内容、数据关联、变量规则和文件配置将被复制；新报文固定保存为草稿。</div>
      <template #footer><button class="button secondary" @click="dialog = ''">取消</button><button class="button primary" :disabled="isPending('create:messages')" @click="submitCopy">{{ isPending('create:messages') ? '正在复制…' : '复制并配置' }}</button></template>
    </AppModal>
    <AppModal v-if="dialog === 'pre-generate' && selected" :title="`预生成报文 · ${selected.name}`" wide @close="dialog = ''">
      <div class="pre-generate-notice"><b>{{ isOriginalMessage(selected) ? '仅预览，不投递' : '仅生成，不投递' }}</b><span>{{ isOriginalMessage(selected) ? '展示发布正文和 SHA-256，不计算业务时间，也不处理正文引用的文件。' : '使用已保存的模板替换系统值与时间规则，不会连接 MQ 或产生执行记录。' }}</span></div>
      <div class="pre-generate-layout">
        <aside class="pre-generate-settings"><span class="panel-eyebrow">{{ isOriginalMessage(selected) ? '原文信息' : '生成条件' }}</span><label v-if="!isOriginalMessage(selected)">当前时间<input v-model="preGenerateForm.plannedTriggerTime" type="datetime-local" step="1"></label><dl><div><dt>报文类型</dt><dd>{{ selected.type }}</dd></div><div v-if="isOriginalMessage(selected)"><dt>处理方式</dt><dd>原报文直发</dd></div><div v-if="!isOriginalMessage(selected)"><dt>数据源</dt><dd>{{ dataSourceName(selected) }}</dd></div><div v-if="!isOriginalMessage(selected)"><dt>数据项</dt><dd>{{ dataItemName(selected) }}</dd></div></dl><button class="button primary" @click="runPreGeneration">{{ isOriginalMessage(selected) ? '重新计算哈希' : '重新预生成' }}</button><small>{{ isOriginalMessage(selected) ? '正文按 UTF-8 计算 SHA-256，不做任何格式化。' : '简单预生成不读取实时数据，也不改写源文件。' }}</small></aside>
        <section class="pre-generate-result"><div class="pre-generate-heading"><div><span class="panel-eyebrow">预生成结果 · 未投递</span><b v-if="preGeneration">已替换 {{ preGeneration.replacementCount }} 个字段</b></div><span v-if="preGeneration" class="status-badge positive">预生成完成</span></div>
          <p v-if="preGenerateError" class="notice pre-generate-error" role="alert">{{ preGenerateError }}</p>
          <template v-else-if="preGeneration"><div class="pre-generate-facts"><div v-if="isOriginalMessage(selected)"><span>正文 SHA-256</span><code>{{ preGeneration.contentSha256 }}</code></div><div v-if="!isOriginalMessage(selected)"><span>消息 ID</span><code>{{ preGeneration.messageId }}</code></div><div><span>{{ isOriginalMessage(selected) ? '校验时间' : '生成时间' }}</span><b>{{ preGeneration.generatedAt }}</b></div><div v-if="!isOriginalMessage(selected)"><span>当前时间</span><b>{{ preGeneration.plannedAt }}</b></div><div v-if="!isOriginalMessage(selected)"><span>起报时间</span><b>{{ preGeneration.businessBaseAt }}</b></div><div v-if="!isOriginalMessage(selected) && (isStructuredFile(selected) || isUnstructuredFile(selected))"><span>目标文件名</span><code>{{ preGeneration.targetFileName }}</code></div><div v-if="isUnstructuredFile(selected)"><span>源文件名</span><code>{{ preGeneration.sourceFileName }}</code></div><div v-if="isUnstructuredFile(selected)"><span>目标文件路径</span><code>{{ preGeneration.targetFilePath }}</code></div><div v-if="isUnstructuredFile(selected)"><span>处理方式</span><b>原样复制</b></div></div><div v-if="isUnstructuredFile(selected) && preGeneration.targetFiles?.length > 1" class="notice subtle file-group-preview"><b>文件组目标：</b><code v-for="path in preGeneration.targetFiles" :key="path">{{ path }}</code></div><div v-if="isStructuredFile(selected) && !isOriginalMessage(selected)" class="notice subtle">预计替换 {{ selected.fileGeneration?.contentBindings?.length || 0 }} 个文件内容时间字段；解析方式：{{ selected.fileGeneration?.parserMode || '未配置' }}。</div><div v-if="preGeneration.replacedPaths.length" class="replaced-paths"><span>本次替换</span><code v-for="path in preGeneration.replacedPaths" :key="path">{{ path }}</code></div><div v-if="preGeneration.warnings.length" class="notice warning-notice"><b>存在 {{ preGeneration.warnings.length }} 项未替换：</b>{{ preGeneration.warnings.join('；') }}</div><pre ref="preGenerateCode" class="code-block">{{ preGeneration.content }}</pre></template>
        </section>
      </div>
      <template #footer><span class="save-hint">预生成结果不会保存</span><button class="button secondary" @click="dialog = ''">关闭</button></template>
    </AppModal>
    <AppModal v-if="editorPreview" title="模板原文 · 当前编辑内容" wide @close="editorPreview = false"><p class="notice subtle">这里展示未替换的模板变量；实际投递报文以执行记录为准。</p><pre class="code-block">{{ form.content }}</pre></AppModal>
  </main>
</template>

<style scoped>
.review-summary { padding: 14px 16px; margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa; font-size: 14px; }.review-summary > div { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 8px; }

.message-list-card { padding: 0; overflow: hidden; }
.list-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 18px 20px; border-bottom: 1px solid #ebeef5; }
.list-toolbar h2 { margin: 0; font-size: 17px; }.list-toolbar p { margin: 6px 0 0; color: #667085; }
.filters { display: flex; align-items: flex-end; gap: 12px; }.filters label { display: block; color: #606266; font-size: 13px; font-weight: 600; }.filters label > span:first-child { display: block; margin-bottom: 7px; }
.filters label { width: 300px; }
.message-table { min-width: 960px; table-layout: fixed; }.message-table th:nth-child(1) { width: 170px; }.message-table th:nth-child(2) { width: 125px; }.message-table th:nth-child(3) { width: 140px; }.message-table th:nth-child(4) { width: 185px; }.message-table th:nth-child(5) { width: 80px; }.message-table th:nth-child(6) { width: 260px; }
.message-table td { overflow: hidden; color: #4f6178; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.message-table th:first-child, .message-table td:first-child { padding-left: 20px; }.message-table th:last-child, .message-table td:last-child { padding-right: 20px; }.message-name { max-width: 100%; overflow: hidden; color: var(--management-link); font-size: 16px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.target-cell { color: #4f6178 !important; font-family: inherit; font-size: 15px; font-weight: 450; }
.message-table td.status-cell { overflow: visible; text-overflow: clip; }
.message-table .operation-cell { text-align: center; }
.message-table .operation-cell .row-actions { justify-content: center; gap: 10px; }
.message-detail { color: #465973; }
.editor-status-strip { display: flex; min-height: 46px; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fafafa; }
.editor-status-strip > div { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: var(--type-form-label); }
.issue-summary { padding: 4px 8px; border: 0; border-radius: 4px; background: var(--red-soft); color: var(--red); font-weight: 650; }
.ready-summary { color: var(--green); font-size: var(--type-form-label); font-weight: 650; }
.unified-detail { display: grid; gap: 16px; }
.binding-overview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; border: 1px solid #f0f0f0; border-radius: 8px; background: #fafafa; }.binding-overview > div { min-width: 0; padding: 13px 15px; border-right: 1px solid #f0f0f0; }.binding-overview > div:last-child { border-right: 0; }.binding-overview span, .binding-overview b, .binding-overview code { display: block; }.binding-overview span { color: #8c8c8c; font-size: 13px; }.binding-overview b { margin-top: 4px; color: #262626; font-size: 15px; }.binding-overview code { margin-top: 3px; color: #595959; font: 600 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.linked-elements-card { overflow: hidden; margin-top: 12px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; }
.linked-elements-heading { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 16px; padding: 0 15px; border-bottom: 1px solid #e6ebf2; background: #f7f9fc; }
.linked-elements-heading b { color: #334a64; font-size: 15px; font-weight: 650; }
.linked-elements-heading span { color: #64758c; font-size: 13px; font-weight: 600; }
.linked-elements-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); background: #fff; }
.linked-elements-list > span { min-width: 0; padding: 11px 15px; border-right: 1px solid #e8edf4; border-bottom: 1px solid #e8edf4; background: #fff; }
.linked-elements-list > span:nth-child(3n) { border-right: 0; }
.linked-elements-list code, .linked-elements-list b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.linked-elements-list code { color: #1677ff; font: 650 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.linked-elements-list b { margin-top: 3px; color: #40546d; font-size: 14px; font-weight: 600; line-height: 1.5; }
.linked-elements-empty { padding: 18px; color: #7d8a9d; text-align: center; font-size: 14px; }
.inline-empty { padding: 17px; border: 1px dashed #d9d9d9; border-radius: 8px; color: #8c8c8c; text-align: center; background: #fafafa; font-size: 14px; }
.message-detail .code-block { max-height: 320px; margin: 0; padding: 17px 18px; border-color: #30343b; border-radius: 6px; background: #1f2329; color: #d9e3f0; font-size: 14px; line-height: 1.65; }
.copy-source-summary { padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fff; }
.copy-source-summary span, .copy-source-summary b, .copy-source-summary small { display: block; }
.copy-source-summary span, .copy-source-summary small { color: var(--muted); font-size: var(--type-form-label); }
.copy-source-summary b { margin: 4px 0; color: var(--ink); font-size: 16px; }
.copy-form { grid-template-columns: 1fr; margin-top: 16px; }
.copy-target-option { display: flex; align-items: flex-start; gap: 10px; margin-top: 16px; padding: 13px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; cursor: pointer; }
.copy-target-option input { margin-top: 2px; }
.copy-target-option b, .copy-target-option small { display: block; }
.copy-target-option b { color: var(--ink); font-size: var(--type-form-body); }
.copy-target-option small { margin-top: 3px; color: var(--muted); font-size: var(--type-form-label); }
.pre-generate-notice { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 11px 14px; border: 1px solid #b7eb8f; border-radius: var(--radius-sm); background: var(--green-soft); color: #237804; }
.pre-generate-notice b { flex: none; }
.pre-generate-notice span { color: #3f6600; }
.pre-generate-layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 14px; min-height: 470px; }
.pre-generate-settings, .pre-generate-result { min-width: 0; padding: 17px; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fff; }
.panel-eyebrow { color: #7c899d; font-size: 11px; font-weight: 750; letter-spacing: .08em; }
.pre-generate-settings > label { display: block; margin-top: 16px; color: #526078; font-size: var(--type-form-label); font-weight: 650; }
.pre-generate-settings input { display: block; width: 100%; height: var(--control-height); margin-top: 7px; padding: 0 10px; border: 1px solid #d9d9d9; border-radius: var(--radius-sm); color: var(--text); }
.pre-generate-settings dl { margin: 17px 0; border-top: 1px solid var(--line); }
.pre-generate-settings dl div { padding: 10px 0; border-bottom: 1px solid var(--line); }
.pre-generate-settings dt { color: var(--muted); font-size: var(--type-form-label); }
.pre-generate-settings dd { margin: 3px 0 0; color: var(--ink); font-weight: 650; }
.pre-generate-settings .button { width: 100%; }
.pre-generate-settings > small { display: block; margin-top: 10px; color: var(--muted); line-height: 1.6; }
.pre-generate-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
.pre-generate-heading b { display: block; margin-top: 4px; color: var(--ink); font-size: 15px; }
.pre-generate-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 13px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fafafa; }
.pre-generate-facts > div { min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.pre-generate-facts span, .pre-generate-facts b, .pre-generate-facts code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pre-generate-facts span { color: var(--muted); font-size: var(--type-form-label); }
.pre-generate-facts b, .pre-generate-facts code { margin-top: 3px; color: var(--text); font-size: var(--type-form-body); }
.replaced-paths { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 13px; }
.replaced-paths > span { margin-right: 2px; color: var(--muted); font-size: var(--type-form-label); }
.replaced-paths code { padding: 3px 7px; border: 1px solid #b7eb8f; border-radius: 4px; background: var(--green-soft); color: #237804; font-size: 11px; }
.pre-generate-result .code-block { max-height: 410px; margin: 0; }
.warning-notice { border-color: #ffd591; background: var(--amber-soft); color: #ad4e00; }
.pre-generate-error { border-color: #ffccc7; background: var(--red-soft); color: var(--red); }
body .page .message-detail .data-table th { padding: 12px 14px; background: #f7f9fc; color: #687890; font-size: 13px; font-weight: 650; letter-spacing: .01em; }
body .page .message-detail .data-table td { padding: 15px 14px; color: #4d5f77; font-size: 15px; font-weight: 400; line-height: 1.55; }
body .page .message-detail .detail-path { color: #2c486d; font: 600 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
body .page .message-detail .detail-format { color: #5c6d84; font: 500 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.message-context { display: flex; align-items: flex-start; justify-content: space-between; padding: 0 0 14px; }.message-context b { font-size: 17px; }.message-context small { display: block; margin-top: 4px; color: var(--muted); font-size: var(--type-form-label); }
.editor-workbench { display: grid; min-width: 0; gap: 14px; }
.editor-step-header { overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.config-step-navigation { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 13px 14px; border-bottom: 1px solid var(--line); background: #fafbfd; }
.config-step-label { color: #526078; font-size: var(--type-form-label); font-weight: 700; }
.config-step-navigation small { color: var(--muted); font-size: 11px; }
.unsaved-indicator { display: inline-flex; align-items: center; gap: 6px; color: var(--amber); font-size: var(--type-form-label); font-weight: 650; }.unsaved-indicator::before { width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ''; }
.editor-step-header .tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); margin: 0; overflow: visible; border: 0; }
.editor-step-header .tabs button { position: relative; display: grid; min-height: 58px; grid-template-columns: 25px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 10px 14px; border: 0; border-right: 1px solid var(--line); border-bottom: 3px solid transparent; border-radius: 0; background: #fff; color: #5f6f85; font-size: var(--type-form-body); font-weight: 600; text-align: left; }
.editor-step-header .tabs button:last-child { border-right: 0; }
.editor-step-header .tabs button:hover { background: #f5f8ff; }
.editor-step-header .tabs button.active { border-bottom-color: var(--blue); background: var(--blue-soft); color: var(--management-link); }
.editor-step-header .tabs button > i { display: grid; width: 24px; height: 24px; place-items: center; border: 1px solid #d9e0ea; border-radius: 50%; background: #fff; color: #77869a; font: normal 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.editor-step-header .tabs button.complete > i { border-color: #b7eb8f; background: var(--green-soft); color: var(--green); }
.editor-step-header .tabs button.active > i { border-color: #91caff; color: var(--blue); }
.tab-issue-count { display: inline-grid; min-width: 18px; height: 18px; place-items: center; border-radius: 9px; background: var(--red); color: #fff; font-size: 10px; }
.editor-main { min-width: 0; }
.config-panel { min-height: 420px; padding: 18px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; }
.issue-summary.ready { background: var(--green-soft); color: var(--green); }
.inspector-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 13px 14px; border-bottom: 1px solid var(--line); background: #fafbfd; }
.inspector-heading span { color: #526078; font-size: var(--type-form-label); font-weight: 700; }
.inspector-heading b { color: var(--amber); font-size: 12px; }
.inspector-heading b.ready { color: var(--green); }
.inspector-facts { margin: 0; padding: 5px 14px; }
.inspector-facts div { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid #f0f0f0; }
.inspector-facts dt { color: var(--muted); font-size: 12px; }
.inspector-facts dd { margin: 0; color: var(--text); font-size: 12px; font-weight: 650; }
.inspector-issues { display: grid; gap: 6px; padding: 10px; }
.inspector-issues button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; padding: 9px 10px; border: 1px solid #ffe7ba; border-radius: 6px; background: #fffaf0; color: #ad4e00; text-align: left; }
.inspector-issues button:hover { border-color: #ffc069; background: var(--amber-soft); }
.inspector-issues span { grid-column: 1; color: #8c6d1f; font-size: 11px; }
.inspector-issues b { grid-column: 1; font-size: 12px; line-height: 1.45; }
.inspector-issues i { grid-column: 2; grid-row: 1 / 3; align-self: center; font-style: normal; }
.inspector-ready { display: grid; gap: 4px; margin: 10px; padding: 12px; border: 1px solid #b7eb8f; border-radius: 6px; background: var(--green-soft); }
.inspector-ready b { color: var(--green); font-size: 13px; }
.inspector-ready span { color: #3f6600; font-size: 11px; line-height: 1.55; }
.config-panel .form-grid label { font-size: var(--type-form-label); }.config-panel .form-grid input, .config-panel .form-grid select { min-height: var(--control-height); color: var(--text); font-size: var(--type-form-body); }.config-panel .code-editor { font-size: var(--type-form-body); }
.published-edit-notice { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; padding: 11px 14px; border: 1px solid #ffd591; border-radius: 6px; background: var(--amber-soft); color: #d46b08; font-size: var(--type-form-label); }.published-edit-notice b { flex: 0 0 auto; color: #ad4e00; }.published-edit-notice span { color: #874d00; }
.data-linkage-grid { display: grid; grid-template-columns: 1.05fr 1fr 1.2fr; gap: 12px; }.linkage-step { min-width: 0; padding: 15px; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fafafa; }.linkage-step.disabled { opacity: .62; }.linkage-step h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; color: var(--ink); font-size: 15px; }.linkage-step h3 span { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: var(--blue); color: #fff; font-size: 12px; }.linkage-step > p { min-height: 40px; margin: 0 0 10px; color: var(--muted); font-size: var(--type-form-label); }.catalog-search { display: block; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.catalog-search input { width: 100%; height: var(--control-height); margin-top: 7px; padding: 0 11px; border: 1px solid #d9d9d9; border-radius: var(--radius-sm); outline: 0; background: #fff; color: var(--text); font-size: var(--type-form-body); }.catalog-search input:focus { border-color: #1677ff; box-shadow: 0 0 0 3px #1677ff1a; }.catalog-options, .element-options { max-height: 270px; margin-top: 8px; overflow: auto; }.catalog-options > button { display: grid; width: 100%; gap: 3px; padding: 10px 11px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; text-align: left; }.catalog-options > button:hover, .catalog-options > button.selected { border-color: #91caff; background: var(--blue-soft); }.catalog-options code { overflow: hidden; color: var(--management-link); font-size: var(--type-form-body); text-overflow: ellipsis; }.catalog-options b { overflow: hidden; color: var(--ink); font-size: var(--type-form-body); text-overflow: ellipsis; white-space: nowrap; }.catalog-options small, .element-options small { color: var(--muted); font-size: var(--type-form-label); }.catalog-empty { padding: 22px 8px; color: var(--muted); text-align: center; font-size: var(--type-form-body); }.select-all { width: 100%; margin-top: 8px; padding: 9px 10px; border: 1px solid #91caff; border-radius: var(--radius-sm); background: var(--blue-soft); color: var(--management-link); font-size: var(--type-form-label); text-align: left; }.element-options > label { display: flex; align-items: flex-start; gap: 8px; padding: 10px; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; }.element-options > label:hover, .element-options > label.selected { border-color: #91caff; background: var(--blue-soft); }.element-options input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }.element-options span { min-width: 0; }.element-options b, .element-options small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.element-options b { font-size: var(--type-form-body); }.binding-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 14px 16px; border: 1px solid #91caff; border-radius: var(--radius-md); background: var(--blue-soft); }.binding-summary b, .binding-summary small { display: block; }.binding-summary b { font-size: var(--type-form-body); }.binding-summary small { margin-top: 3px; color: var(--text); font-size: var(--type-form-label); }.binding-summary strong { flex: 0 0 auto; color: var(--management-link); font-size: var(--type-form-body); }.selected-element-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }.selected-element-chips span { padding: 4px 8px; border: 1px solid #91caff; border-radius: 4px; background: #fff; color: var(--management-link); font-size: var(--type-form-label); }
.target-form { display: grid; gap: 18px; }.target-instance-field { min-width: 0; margin: 0; padding: 0; border: 0; }.target-instance-field legend { margin-bottom: 9px; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.instance-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.instance-option { display: flex; align-items: center; min-width: 0; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; cursor: pointer; transition: border-color .2s, background .2s; }.instance-option:hover { border-color: #a9bcf5; }.instance-option.selected { border-color: var(--blue); background: var(--blue-soft); }.instance-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--blue); }.instance-option span { min-width: 0; }.instance-option b, .instance-option small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.instance-option b { color: var(--ink); font-size: var(--type-form-body); }.instance-option small { margin-top: 3px; color: var(--muted); font-size: var(--type-form-label); }.field-error { margin: 8px 0 0; color: var(--red); font-size: var(--type-form-label); }
.target-tabs-label { margin-bottom: -11px; color: #526078; font-size: var(--type-form-label); font-weight: 650; }
.target-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; border-bottom: 1px solid var(--line); }.target-tabs button { min-width: 210px; padding: 10px 13px; border: 1px solid var(--line); border-bottom: 2px solid transparent; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: #f7f9fc; color: var(--text); text-align: left; }.target-tabs button:hover { border-color: #a9bcf5; }.target-tabs button.active { border-color: #a9bcf5; border-bottom-color: var(--blue); background: var(--blue-soft); color: var(--ink); }.target-tabs span, .target-tabs small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.target-tabs span { font-size: var(--type-form-body); font-weight: 650; }.target-tabs small { margin-top: 4px; color: var(--muted); font-size: var(--type-form-label); }.target-editor { padding: 16px; border: 1px solid #a9bcf5; border-radius: var(--radius-md); background: #f8faff; }.target-editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }.target-editor-heading b, .target-editor-heading small { display: block; }.target-editor-heading b { color: var(--ink); font-size: 15px; }.target-editor-heading small { margin-top: 3px; color: var(--muted); font-size: var(--type-form-label); }.target-editor-heading > span { padding: 4px 8px; border-radius: 7px; background: var(--blue-soft); color: var(--management-link); font-size: var(--type-form-label); }
.topic-field, .group-field { min-width: 0; }.topic-combobox, .group-combobox { position: relative; margin-top: 7px; }.config-panel .form-grid .topic-combobox input, .config-panel .form-grid .group-combobox input { margin-top: 0; }.topic-suggestions, .group-suggestions { position: absolute; z-index: 8; top: calc(100% + 4px); right: 0; left: 0; max-height: 240px; padding: 4px; overflow-y: auto; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; box-shadow: 0 6px 16px #0000001f; }.topic-suggestions button, .group-suggestions button { display: block; width: 100%; padding: 9px 10px; overflow: hidden; border: 0; border-radius: 4px; background: transparent; color: var(--text); font: 500 var(--type-form-body)/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: left; text-overflow: ellipsis; white-space: nowrap; }.topic-suggestions button:hover, .topic-suggestions button.active, .group-suggestions button:hover, .group-suggestions button.active { background: var(--blue-soft); color: var(--management-link); }.topic-empty, .group-empty { display: block; padding: 10px; color: var(--muted); font-size: var(--type-form-label); text-align: center; }.topic-hint, .group-hint { display: block; margin-top: 6px; color: var(--muted); font-size: var(--type-form-label); font-weight: 400; }
.binding-page-heading, .system-binding-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }.binding-page-heading h2, .system-binding-heading h3 { margin: 0; color: var(--ink); font-size: 18px; }.binding-page-heading p, .system-binding-heading p { margin: 5px 0 0; color: var(--muted); font-size: var(--type-form-label); }
.binding-page-heading .button-row.compact { flex: none; margin: 0; }
.binding-section-tabs { display: flex; gap: 24px; margin: 18px 0 0; border-bottom: 1px solid var(--line); }.binding-section-tabs button { display: flex; min-height: 44px; align-items: center; gap: 8px; padding: 0 2px; border: 0; border-bottom: 3px solid transparent; background: transparent; color: #617188; font-size: var(--type-form-body); font-weight: 650; }.binding-section-tabs button.active { border-bottom-color: var(--blue); color: var(--management-link); }.binding-section-tabs b { display: grid; min-width: 22px; height: 20px; place-items: center; padding: 0 6px; border-radius: 10px; background: #eef2f7; color: #667085; font-size: 11px; }.binding-section-tabs button.active b { background: #e6f4ff; color: var(--blue); }
.binding-workspace { padding-top: 16px; }.binding-toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) auto auto auto; align-items: center; gap: 10px; }.binding-toolbar > .search-input { min-width: 0; }.binding-filter { display: flex; overflow: hidden; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); background: #fff; }.binding-filter button { min-height: var(--control-height); padding: 0 12px; border: 0; border-right: 1px solid #d9e0ea; background: #fff; color: #5f6f85; font-size: var(--type-form-label); }.binding-filter button:last-child { border-right: 0; }.binding-filter button.active { background: var(--blue-soft); color: var(--management-link); font-weight: 650; }.binding-select-all { display: inline-flex; min-height: var(--control-height); align-items: center; gap: 7px; padding: 0 11px; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); background: #fff; color: var(--text); cursor: pointer; font-size: var(--type-form-label); white-space: nowrap; }.binding-select-all input { width: 16px; height: 16px; flex: 0 0 auto; margin: 0; accent-color: var(--blue); }
.time-rule-context { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 12px; margin: 14px 0; padding: 12px 16px; border: 1px solid #a9bcf5; border-radius: var(--radius-md); background: var(--blue-soft); }.time-rule-context div { min-width: 0; }.time-rule-context span, .time-rule-context b { display: block; }.time-rule-context span { color: #65758b; font-size: 11px; }.time-rule-context b { margin-top: 3px; overflow: hidden; color: var(--ink); font-size: var(--type-form-label); text-overflow: ellipsis; white-space: nowrap; }.time-rule-context i, .mapping-arrow { color: #84a3e8; font-style: normal; }
.mapping-list { display: grid; gap: 8px; }.mapping-row { position: relative; display: grid; min-width: 0; grid-template-columns: 26px minmax(250px, 1.2fr) 22px minmax(250px, 1fr); align-items: center; gap: 12px; padding: 13px 14px 13px 17px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fff; }.mapping-row::before { position: absolute; inset: 0 auto 0 0; width: 3px; background: #cbd5e1; content: ''; }.mapping-row.active { border-color: #c8d8fa; background: #fbfcff; }.mapping-row.active::before { background: var(--blue); }.mapping-toggle { display: grid; place-items: center; cursor: pointer; }.mapping-toggle input { position: absolute; opacity: 0; }.mapping-toggle span { position: relative; width: 18px; height: 18px; border: 1px solid #b6c0ce; border-radius: 4px; background: #fff; }.mapping-toggle input:focus-visible + span { outline: 3px solid #1677ff26; outline-offset: 2px; }.mapping-toggle input:checked + span { border-color: var(--blue); background: var(--blue); }.mapping-toggle input:checked + span::after { position: absolute; top: 2px; left: 5px; width: 5px; height: 9px; border-right: 2px solid #fff; border-bottom: 2px solid #fff; content: ''; transform: rotate(45deg); }
.time-mapping-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.time-mapping-list .mapping-row { grid-template-columns: 24px minmax(150px, 1fr) minmax(180px, 250px); min-height: 78px; gap: 10px; padding: 10px 12px; border: 1px solid #dfe5ee; border-radius: var(--radius-sm); background: #fff; }
.time-mapping-list .mapping-row::before { display: none; }
.time-mapping-list .mapping-row.active { background: #fbfdff; }
.time-mapping-list .mapping-row:not(.active) { background: #fafafa; }
.time-mapping-list .mapping-arrow { display: none; }
.mapping-field, .mapping-rule { min-width: 0; }.mapping-field > div { display: flex; align-items: center; gap: 8px; }.mapping-field b { overflow: hidden; color: var(--ink); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.mapping-field em { flex: none; padding: 2px 6px; border-radius: 4px; background: #f1f3f6; color: #68778c; font-size: 10px; font-style: normal; }.mapping-row.active .mapping-field em { background: var(--blue-soft); color: var(--management-link); }.mapping-field > button { display: flex; max-width: 100%; align-items: center; gap: 7px; margin-top: 4px; padding: 0; border: 0; background: transparent; text-align: left; }.mapping-field code { overflow: hidden; color: #3d5f8a; font: 600 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }.mapping-field button span { flex: none; color: var(--management-link); font-size: 11px; opacity: 0; }.mapping-field button:hover span, .mapping-field button:focus-visible span { opacity: 1; }.mapping-field small, .mapping-rule small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.5; }
.mapping-rule label, .mapping-rule > span { display: block; color: #64748b; font-size: 11px; font-weight: 650; }.mapping-rule select { width: 100%; height: var(--control-height); margin-top: 5px; padding: 0 10px; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); background: #fff; color: var(--text); font-size: var(--type-form-body); }.time-mapping-list .mapping-rule select { margin-top: 0; }.mapping-rule.disabled select { background: #f2f4f7; color: var(--quiet); }.mapping-rule > b { display: block; margin-top: 5px; color: var(--ink); font-size: 14px; }.binding-help { margin: 12px 0 0; padding: 13px 15px; border: 1px solid #dfe5ee; border-radius: var(--radius-sm); background: #fafbfd; color: #526078; font-size: var(--type-form-label); line-height: 1.65; }.binding-help > b { display: block; margin-bottom: 4px; color: var(--ink); }.binding-help p { margin: 2px 0; }.binding-help strong { margin-right: 4px; color: #334a64; }.binding-help strong:not(:first-child) { margin-left: 14px; }.binding-help small { display: block; margin-top: 5px; color: var(--muted); }.binding-help code { color: var(--management-link); }.binding-empty { margin-top: 12px; padding: 34px 16px; border: 1px dashed #cbd5e1; border-radius: var(--radius-md); background: #fafbfd; color: var(--muted); font-size: var(--type-form-body); text-align: center; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.system-binding-heading { align-items: center; }.system-toolbar { display: flex; justify-content: space-between; margin: 14px 0; }.system-toolbar .search-input { width: min(440px, 100%); }.system-toolbar > span { color: var(--muted); font-size: var(--type-form-label); }.system-mapping-list .mapping-row { grid-template-columns: 42px minmax(250px, 1.2fr) 22px minmax(220px, .8fr) auto; }.mapping-kind { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 6px; background: var(--blue-soft); color: var(--management-link); font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }.mapping-edit { justify-self: end; }
.drawer-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; border: 1px solid #ffd591; border-radius: var(--radius-sm); background: var(--amber-soft); }.drawer-status b { color: #ad4e00; }.drawer-status span { color: #874d00; font-size: var(--type-form-label); }.drawer-status.ready { border-color: #b7eb8f; background: var(--green-soft); }.drawer-status.ready b, .drawer-status.ready span { color: #237804; }
.drawer-form { display: grid; gap: 16px; }.drawer-form > label { color: #526078; font-size: var(--type-form-label); font-weight: 650; }.drawer-form > label input, .drawer-form > label select { display: block; width: 100%; height: var(--control-height); margin-top: 7px; padding: 0 11px; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); background: #fff; color: var(--text); }.field-picker { min-width: 0; max-height: 320px; margin: 0; padding: 8px; overflow-y: auto; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); }.field-picker legend { padding: 0 6px; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.field-picker > label { display: flex; align-items: flex-start; gap: 9px; padding: 10px; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; }.field-picker > label:hover, .field-picker > label.selected { border-color: #91caff; background: var(--blue-soft); }.field-picker > label.bound { opacity: .58; cursor: not-allowed; }.field-picker input { margin-top: 3px; accent-color: var(--blue); }.field-picker span { min-width: 0; }.field-picker b, .field-picker code, .field-picker small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.field-picker b { color: var(--ink); font-size: var(--type-form-body); }.field-picker code { margin-top: 3px; color: #3d5f8a; font-size: 11px; }.field-picker small { margin-top: 3px; color: var(--muted); font-size: 11px; }.field-picker > p { color: var(--muted); text-align: center; }.binding-result-summary { padding: 12px 14px; border: 1px solid #a9bcf5; border-radius: var(--radius-sm); background: var(--blue-soft); }.binding-result-summary span, .binding-result-summary b, .binding-result-summary small { display: block; }.binding-result-summary span, .binding-result-summary small { color: #64748b; font-size: 11px; }.binding-result-summary b { margin: 4px 0; overflow-wrap: anywhere; color: var(--ink); font: 600 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }.drawer-footer-spacer { flex: 1; }
.binding-preview-settings { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 16px; }.binding-preview-settings label { min-width: 0; flex: 1; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.binding-preview-settings input { display: block; width: 100%; height: var(--control-height); margin-top: 7px; padding: 0 10px; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); }.binding-preview-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 14px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sm); }.binding-preview-summary div { padding: 11px 12px; border-right: 1px solid var(--line); }.binding-preview-summary div:last-child { border-right: 0; }.binding-preview-summary span, .binding-preview-summary b { display: block; }.binding-preview-summary span { color: var(--muted); font-size: 11px; }.binding-preview-summary b { margin-top: 4px; color: var(--ink); font-size: 14px; }.binding-preview-summary b.warning { color: var(--amber); }.binding-preview-code { max-height: 520px; margin: 0; overflow: auto; }
.file-template-panel .form-grid { margin-top: 18px; }
.file-template-panel label small { display: block; margin-top: 6px; color: var(--muted); font-size: var(--type-form-label); font-weight: 400; }
.file-generation-flow { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 14px; border: 1px solid #a9bcf5; border-radius: var(--radius-md); background: #f5f8ff; color: var(--management-link); font-size: var(--type-form-body); }
.file-generation-flow span { padding: 7px 11px; border-radius: var(--radius-sm); background: #fff; }.file-generation-flow b { color: #7894e9; }
.file-inspection-result { display: flex; align-items: stretch; gap: 10px; margin-top: 16px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fafbfd; }.file-inspection-result > div, .file-inspection-result button { min-width: 150px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; text-align: left; }.file-inspection-result button { cursor: pointer; }.file-inspection-result button.selected { border-color: var(--blue); background: var(--blue-soft); }.file-inspection-result span, .file-inspection-result b, .file-inspection-result small { display: block; }.file-inspection-result span, .file-inspection-result small { color: var(--muted); font-size: var(--type-form-label); }.file-inspection-result b { margin: 4px 0; color: var(--ink); font-size: var(--type-form-body); }
.file-rule-steps { display: grid; grid-template-columns: repeat(4, 1fr); margin: 0 0 16px; border: 1px solid var(--line); border-radius: 8px; background: #fafafa; overflow: hidden; }
.file-rule-steps > div { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px 14px; border-right: 1px solid var(--line); }
.file-rule-steps > div:last-child { border-right: 0; }.file-rule-steps i { display: grid; flex: 0 0 24px; width: 24px; height: 24px; place-items: center; border-radius: 4px; background: #e6f4ff; color: #1677ff; font-size: 12px; font-style: normal; font-weight: 700; }
.file-rule-steps b, .file-rule-steps small { display: block; }.file-rule-steps b { color: var(--ink); font-size: 13px; }.file-rule-steps small { margin-top: 2px; color: var(--muted); font-size: 11px; }
.file-rule-section { margin-top: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.file-rule-section.passthrough { border-color: #91caff; background: #f7faff; }.file-rule-section.passthrough .file-rule-empty { border-color: #91caff; background: #fff; color: #3d5f8a; }
.file-rule-section > div:first-child { display: flex; align-items: flex-start; gap: 10px; }.file-rule-section > div:first-child > div { min-width: 0; flex: 1; }.file-rule-section h3 { margin: 0; color: var(--ink); font-size: 15px; }.file-rule-section p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }.section-index { color: #1677ff; font: 700 11px/20px ui-monospace, SFMono-Regular, Menlo, monospace; }
.preset-section { border-top: 3px solid #1677ff; }.matched-file-template { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 12px; margin-top: 14px; padding: 12px 14px; border: 1px solid #91caff; border-radius: 6px; background: var(--blue-soft); }.matched-file-template > span { padding: 3px 7px; border-radius: 4px; background: #e6f4ff; color: #1677ff; font-size: 11px; font-weight: 700; }.matched-file-template div { min-width: 0; }.matched-file-template b,.matched-file-template small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.matched-file-template b { color: var(--ink); font-size: var(--type-form-body); }.matched-file-template small { margin-top: 3px; color: var(--muted); font-size: 11px; }.matched-file-template strong { color: #1677ff; font-size: 12px; }
.file-template-candidates { display: grid; gap: 8px; margin-top: 14px; }.file-template-candidates > p { margin: 0; color: var(--muted); font-size: var(--type-form-label); }.file-template-candidates > button { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 3px 12px; align-items: center; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; color: var(--ink); text-align: left; cursor: pointer; }.file-template-candidates > button:hover { border-color: #91caff; background: var(--blue-soft); }.file-template-candidates b,.file-template-candidates small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.file-template-candidates small { color: var(--muted); }.file-template-candidates span { grid-column: 2; grid-row: 1 / span 2; color: var(--management-link); font-weight: 650; }.shapefile-group { display: flex; flex-wrap: wrap; gap: 10px 16px; margin: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); }.shapefile-group legend { padding: 0 5px; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.shapefile-group p { width: 100%; margin: 0; color: var(--muted); font-size: var(--type-form-label); }.shapefile-group label { display: inline-flex; align-items: center; gap: 6px; }.shapefile-group input { width: 16px; height: 16px; }.file-group-preview code { display: block; margin-top: 5px; overflow-wrap: anywhere; }
.file-source-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 14px; }.file-source-grid .wide-field { grid-column: span 2; }
.file-time-source-field{min-width:0;margin:0;padding:0;border:0}.file-time-source-field legend{margin-bottom:7px;padding:0;color:#526078;font-size:var(--type-form-label);font-weight:650}.file-time-source-control{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1.2fr);align-items:center;gap:8px}.file-time-source-control span{color:#8a98aa;font-size:12px}.file-time-source-control select{min-width:0;width:100%}
.file-rule-list { display: grid; gap: 8px; margin-top: 12px; }.file-rule-list article { display: grid; grid-template-columns: 130px minmax(170px, .8fr) minmax(220px, 1fr) minmax(140px, .7fr) auto; align-items: end; gap: 10px; padding: 11px 12px; border: 1px solid #e6eaf0; border-left: 3px solid #1677ff; border-radius: 6px; background: #fafbfd; }.file-rule-list label { display: grid; gap: 5px; color: #526078; font-size: 11px; font-weight: 650; }.file-rule-list input, .file-rule-list select { width: 100%; height: 34px; padding: 0 9px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; }.file-rule-list article > small { align-self: center; color: var(--muted); font-size: 11px; }.rule-kind { align-self: center; color: #1677ff; font-size: 12px; font-weight: 700; }.content-rule-list article { grid-template-columns: 130px minmax(200px, 1.2fr) minmax(190px, .8fr) minmax(170px, .8fr) minmax(120px, .5fr) auto; }.file-rule-empty { margin-top: 12px; padding: 18px; border: 1px dashed #d9d9d9; border-radius: 6px; background: #fafafa; color: var(--muted); text-align: center; font-size: 12px; }
.positional-rule-list article { grid-template-columns: repeat(4, minmax(150px, 1fr)); align-items: end; }.positional-rule-list .rule-kind { grid-column: 1 / -1; padding-bottom: 4px; border-bottom: 1px solid #e6eaf0; }.positional-rule-list article > small { min-height: 34px; display: flex; align-items: center; }.positional-rule-list article > .link-button { justify-self: start; }
@media (max-width: 1100px) { .file-rule-steps { grid-template-columns: repeat(2, 1fr); }.file-source-grid { grid-template-columns: 1fr 1fr; }.file-rule-list article, .content-rule-list article { grid-template-columns: 1fr 1fr; align-items: start; }.file-rule-list article > .link-button { justify-self: start; } }
@media (max-width: 1100px) { .editor-step-header .tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); }.data-linkage-grid { grid-template-columns: 1fr; }.linkage-step > p { min-height: 0; }.file-generation-flow { align-items: stretch; flex-direction: column; }.file-generation-flow b { display: none; }.binding-toolbar { grid-template-columns: minmax(220px, 1fr) auto; }.mapping-row, .system-mapping-list .mapping-row { grid-template-columns: 26px minmax(220px, 1fr) 18px minmax(240px, 340px); }.system-mapping-list .mapping-kind { display: none; }.system-mapping-list .mapping-edit { grid-column: 4; }.system-binding-heading { align-items: flex-start; } }
@media (max-width: 900px) { .list-toolbar, .filters { align-items: stretch; flex-direction: column; }.filters label { width: 100%; }.time-mapping-list { grid-template-columns: 1fr; }.binding-overview { grid-template-columns: 1fr; }.binding-overview > div { border-right: 0; border-bottom: 1px solid #e7ecf3; }.linked-elements-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.pre-generate-layout { grid-template-columns: 1fr; }.pre-generate-facts { grid-template-columns: 1fr; }.mapping-row, .system-mapping-list .mapping-row, .time-mapping-list .mapping-row { grid-template-columns: 24px minmax(0, 1fr); }.mapping-arrow { display: none; }.mapping-rule, .mapping-edit, .system-mapping-list .mapping-edit { grid-column: 2; }.time-mapping-list .mapping-rule { margin-top: 5px; }.time-rule-context { grid-template-columns: 1fr; }.time-rule-context i { display: none; }.system-toolbar { align-items: stretch; flex-direction: column; }.system-toolbar .search-input { width: 100%; }.binding-help strong:not(:first-child) { margin-left: 0; } }
@media (max-width: 680px) { .editor-step-header .tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); }.config-step-navigation { align-items: flex-start; flex-direction: column; }.binding-toolbar { grid-template-columns: 1fr; }.binding-filter { width: 100%; }.binding-filter button { flex: 1; }.binding-page-heading { align-items: stretch; flex-direction: column; }.binding-section-tabs { gap: 16px; }.matched-file-template { grid-template-columns: 1fr; }.matched-file-template strong { justify-self: start; }.file-time-source-field.wide-field{grid-column:auto}.file-time-source-control{grid-template-columns:1fr}.file-time-source-control span{display:none} }
</style>
