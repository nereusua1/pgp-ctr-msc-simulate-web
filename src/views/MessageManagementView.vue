<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppModal from '../components/AppModal.vue'
import AppIcon from '../components/AppIcon.vue'
import SearchInput from '../components/SearchInput.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailSection from '../components/DetailSection.vue'
import * as api from '../api'

const props = defineProps({ templates: Array, sources: Array, components: Array, tasks: Array, pendingActions: { type: Object, default: () => new Set() }, canManage: { type: Boolean, default: false } })
const emit = defineEmits(['update', 'create', 'remove', 'notify', 'check-component', 'editing-state'])
const selectedId = ref(props.templates[0]?.id || '')
const keyword = ref('')
const page = ref(1)
const pageSize = 10
const activeTab = ref('basic')
const dialog = ref('')
const activeTargetComponentId = ref('')
const createError = ref('')
const form = reactive({})
const createForm = reactive({ name: '', type: 'JSON', description: '' })
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
const timeStrategies = [
  ['TASK_TRIGGER_TIME', '计划触发时间'],
  ['BUSINESS_BASE_TIME', '业务基准时间'],
  ['DATA_INTERVAL_SEQUENCE', '按数据项间隔生成'],
  ['PERIOD_END_TIME', '预报结束时间']
]
const valueProviders = [
  ['MESSAGE_ID', '消息 ID'],
  ['PLANNED_TRIGGER_TIME', '计划触发时间'],
  ['BUSINESS_BASE_TIME', '业务基准时间'],
  ['PERIOD_END_TIME', '预报结束时间'],
  ['CONSTANT', '固定常量']
]
const valueBindingDraft = reactive({ path: '', provider: 'MESSAGE_ID', targetType: 'string', value: '', format: 'yyyy-MM-dd HH:mm:ss' })
let dataItemTimer
let sourceTimer
let elementTimer

const selected = computed(() => props.templates.find(item => item.id === selectedId.value))
const isPending = key => props.pendingActions.has(key)
const sourceName = id => props.sources.find(item => item.id === id)?.name || '未关联'
const dataItemName = item => item?.dataBinding?.dataItemName || sourceName(item?.sourceId)
const dataSourceName = item => item?.dataBinding?.sourceName || props.sources.find(source => source.sourceCode === item?.dataBinding?.sourceCode)?.sourceCodeName || '未关联'
const componentOf = id => props.components.find(item => item.id === id)
const producerGroupsOf = component => Array.isArray(component?.producerGroups) && component.producerGroups.length ? component.producerGroups : (component?.producerGroup ? [component.producerGroup] : [])
const topicsOf = component => Array.isArray(component?.topics) ? component.topics : []
const targetComponentIdsOf = template => Array.isArray(template?.componentIds) && template.componentIds.length
  ? template.componentIds
  : (template?.componentId ? [template.componentId] : [])
const deliveryTargetsOf = template => {
  if (Array.isArray(template?.deliveryTargets) && template.deliveryTargets.length) {
    return template.deliveryTargets.filter(item => item?.componentId).map(item => ({
      componentId: item.componentId, producerGroup: item.producerGroup || '', topic: item.topic || ''
    }))
  }
  return targetComponentIdsOf(template).map(componentId => {
    const component = componentOf(componentId)
    const groups = producerGroupsOf(component)
    const topics = topicsOf(component)
    return {
      componentId,
      producerGroup: groups.includes(template?.producerGroup) ? template.producerGroup : (groups[0] || ''),
      topic: topics.includes(template?.topic) ? template.topic : (topics[0] || '')
    }
  })
}
const targetTopicsOf = template => [...new Set(deliveryTargetsOf(template).map(item => item.topic).filter(Boolean))]
const filteredTemplates = computed(() => {
  const search = keyword.value.trim().toLowerCase()
  return props.templates.filter(item => !search || [item.name, item.type, item.description, dataItemName(item), dataSourceName(item), ...targetTopicsOf(item)]
    .some(value => String(value || '').toLowerCase().includes(search)))
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredTemplates.value.length / pageSize)))
const visibleTemplates = computed(() => filteredTemplates.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const referenceTasks = computed(() => props.tasks.filter(item => item.messageId === selected.value?.id))
const selectedTargetIds = computed(() => (form.deliveryTargets || []).map(item => item.componentId))
const activeDeliveryTarget = computed(() => (form.deliveryTargets || []).find(item => item.componentId === activeTargetComponentId.value))
const activeTargetComponent = computed(() => componentOf(activeTargetComponentId.value))
const activeProducerGroups = computed(() => producerGroupsOf(activeTargetComponent.value))
const activeTopics = computed(() => topicsOf(activeTargetComponent.value))
const detectedTimeFields = computed(() => {
  try {
    const fields = new Map()
    collectTimeFields(JSON.parse(form.content || '{}'), '$', fields)
    return [...fields.values()]
  } catch { return [] }
})
const detectedScalarFields = computed(() => {
  try {
    const fields = new Map()
    collectScalarFields(JSON.parse(form.content || '{}'), '$', fields)
    return [...fields.values()]
  } catch { return [] }
})
const valueRuleBindings = computed(() => (form.bindings || []).filter(binding => binding.kind === 'VALUE_RULE'))
const configuredTimeBindingCount = computed(() => detectedTimeFields.value.filter(field => timeBindingOf(field.path)).length)
const invalidTimeBindings = computed(() => (form.bindings || []).filter(binding => binding.kind === 'TIME_RULE'
  && (!timeStrategies.some(item => item[0] === binding.strategy) || Object.prototype.hasOwnProperty.call(binding, 'offset'))))
const invalidValueBindings = computed(() => valueRuleBindings.value.filter(binding => !binding.path
  || !valueProviders.some(item => item[0] === binding.provider) || (binding.provider === 'CONSTANT' && binding.value === undefined)))
const configurationTabs = computed(() => [
  ['basic', '基本信息'], ['content', '报文内容'], ['data', '数据关联'],
  ...(form.type === 'FILE' ? [['file', '文件模板']] : []),
  ['bindings', '变量绑定'], ['target', '默认投递目标']
])
const currentFormSnapshot = () => JSON.stringify(normalizedForm(form.status))
const isEditorDirty = computed(() => dialog.value === 'edit' && Boolean(savedFormSnapshot.value) && currentFormSnapshot() !== savedFormSnapshot.value)

watch(keyword, () => { page.value = 1 })
watch(totalPages, value => { if (page.value > value) page.value = value })
watch(sourceKeyword, () => scheduleCatalogSearch('sources'))
watch(dataItemKeyword, () => scheduleCatalogSearch('dataItems'))
watch(elementKeyword, () => scheduleCatalogSearch('elements'))
watch(activeTab, tab => { if (tab === 'data') initializeDataSelector() })
watch(() => form.type, type => {
  if (type === 'FILE' && !form.fileGeneration) {
    form.fileGeneration = { sourceFileName: '', sourceFilePath: '', timeColumn: '预报时间', sourceTimeFormat: 'yyyy-MM-dd_HH:mm:ss', delimiter: ',' }
  }
  if (type !== 'FILE' && activeTab.value === 'file') activeTab.value = 'basic'
})
watch([dialog, isEditorDirty], () => emit('editing-state', dialog.value === 'edit' && isEditorDirty.value), { immediate: true })

function warnBeforeUnload(event) {
  if (!isEditorDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  clearTimeout(dataItemTimer); clearTimeout(sourceTimer); clearTimeout(elementTimer)
})

function syncForm() {
  if (!selected.value) return
  Object.keys(form).forEach(key => delete form[key])
  Object.assign(form, JSON.parse(JSON.stringify(selected.value)))
  form.bindings = (form.bindings || []).map(normalizeTimeBinding)
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
  activeTargetComponentId.value = form.deliveryTargets[0]?.componentId || ''
  if (form.type === 'FILE' && !form.fileGeneration) {
    form.fileGeneration = { sourceFileName: '', sourceFilePath: '', timeColumn: '预报时间', sourceTimeFormat: 'yyyy-MM-dd_HH:mm:ss', delimiter: ',' }
  }
  if (form.type === 'FILE' && !form.fileGeneration.delimiter) form.fileGeneration.delimiter = ','
  fileInspection.value = null
  Object.assign(valueBindingDraft, { path: '', provider: 'MESSAGE_ID', targetType: 'string', value: '', format: 'yyyy-MM-dd HH:mm:ss' })
  savedFormSnapshot.value = currentFormSnapshot()
}
function openFor(item, target) {
  selectedId.value = item.id
  syncForm()
  if (target === 'edit') activeTab.value = 'basic'
  dialog.value = target
}
function normalizedForm(status = form.status) {
  const deliveryTargets = [...new Map((form.deliveryTargets || []).filter(item => item.componentId).map(item => [item.componentId, {
    componentId: item.componentId,
    producerGroup: String(item.producerGroup || '').trim(),
    topic: String(item.topic || '').trim()
  }])).values()]
  const componentIds = deliveryTargets.map(item => item.componentId)
  const firstTarget = deliveryTargets[0] || {}
  const dataBinding = { ...(form.dataBinding || {}), elements: [...(form.dataBinding?.elements || [])] }
  const fileGeneration = form.fileGeneration ? { ...form.fileGeneration } : undefined
  // 生成文件的 SIM 标识由后端作为固定不变量维护，不接收历史页面保存的自定义值。
  if (fileGeneration) delete fileGeneration.outputMarker
  return { ...form, status, deliveryTargets, componentIds, componentId: componentIds[0] || '', producerGroup: firstTarget.producerGroup || '', topic: firstTarget.topic || '', dataBinding, fileGeneration, bindings: (form.bindings || []).map(normalizeTimeBinding) }
}
function save() {
  // “保存草稿”是明确的状态迁移动作：已发布报文发生配置变更后必须重新发布，
  // 避免页面展示的发布态与实际待审核配置不一致。
  const payload = normalizedForm('DRAFT')
  emit('update', payload, result => {
    if (result?.success) {
      form.status = payload.status
      savedFormSnapshot.value = currentFormSnapshot()
    }
  })
}
function saveCurrentTab() {
  if (activeTab.value === 'data') { saveDataBinding(); return }
  if (invalidTimeBindings.value.length || invalidValueBindings.value.length) {
    emit('notify', '变量绑定配置不完整，请检查字段路径和值来源', 'error')
    activeTab.value = 'bindings'
    return
  }
  if (activeTab.value === 'target' && !hasCompleteTargets()) {
    emit('notify', '请为每个 MQ 实例分别选择 Producer Group 和 Topic', 'error')
    return
  }
  if (activeTab.value === 'file' && !form.fileGeneration?.timeColumn) {
    emit('notify', '请配置文件时间字段', 'error')
    return
  }
  save()
}
function publish() {
  if (invalidTimeBindings.value.length || invalidValueBindings.value.length) { emit('notify', '请先修正变量绑定配置', 'error'); activeTab.value = 'bindings'; return }
  if (!hasCompleteDataBinding()) { emit('notify', '请先完成数据源、数据项和要素项关联', 'error'); activeTab.value = 'data'; return }
  if (form.type === 'FILE' && !form.fileGeneration?.timeColumn) {
    emit('notify', '请先完成 FILE 文件模板配置', 'error'); activeTab.value = 'file'; return
  }
  if (!hasCompleteTargets()) { emit('notify', '请先完成每个 MQ 实例的 Group 和 Topic 配置', 'error'); activeTab.value = 'target'; return }
  const payload = normalizedForm('PUBLISHED')
  emit('update', payload, result => {
    if (!result?.success) return
    form.status = payload.status
    savedFormSnapshot.value = currentFormSnapshot()
    dialog.value = ''
  })
}
function confirmEditorClose() {
  return !isEditorDirty.value || window.confirm('当前报文配置尚未保存，关闭后修改将丢失。是否继续关闭？')
}
function selectConfigurationTab(tab) {
  if (tab === activeTab.value) return
  if (isEditorDirty.value) emit('notify', '已保留当前修改；保存草稿前请勿关闭或离开报文配置。', 'warning')
  activeTab.value = tab
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
  const ids = (form.deliveryTargets || []).map(item => item.componentId)
  const index = ids.indexOf(componentId)
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
  activeTargetComponentId.value = ids[nextIndex]
  requestAnimationFrame(() => document.querySelector(`[data-target-tab="${ids[nextIndex]}"]`)?.focus())
}
function formatContent() {
  try { form.content = JSON.stringify(JSON.parse(form.content), null, 2); emit('notify', 'JSON 格式化与校验通过') }
  catch { emit('notify', 'JSON 格式不合法', 'error') }
}
function openCreate() {
  Object.assign(createForm, { name: '', type: 'JSON', description: '' })
  createError.value = ''
  dialog.value = 'create'
}
function isTargetSelected(componentId) { return selectedTargetIds.value.includes(componentId) }
function toggleTargetComponent(component, checked) {
  const targets = [...(form.deliveryTargets || [])]
  const index = targets.findIndex(item => item.componentId === component.id)
  if (checked && index < 0) {
    targets.push({ componentId: component.id, producerGroup: producerGroupsOf(component)[0] || '', topic: topicsOf(component)[0] || '' })
    activeTargetComponentId.value = component.id
  } else if (!checked && index >= 0) {
    targets.splice(index, 1)
    if (activeTargetComponentId.value === component.id) activeTargetComponentId.value = targets[0]?.componentId || ''
  }
  form.deliveryTargets = targets
  form.componentIds = targets.map(item => item.componentId)
  form.componentId = form.componentIds[0] || ''
}
function validateTargets() {
  for (const target of form.deliveryTargets || []) emit('check-component', { id: target.componentId, topic: target.topic })
}
const targetValidationPending = computed(() => (form.deliveryTargets || []).some(target =>
  isPending(`check:${target.componentId}:${target.topic || ''}`)
))
function hasCompleteTargets() {
  return Boolean(form.deliveryTargets?.length && form.deliveryTargets.every(item => item.componentId && item.producerGroup && item.topic))
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
async function loadDataItemOptions() {
  catalogLoading.dataItems = true
  try { dataItemOptions.value = await api.searchDataItemOptions(form.dataBinding.sourceCode, dataItemKeyword.value, 20) }
  catch (error) { emit('notify', error.message, 'error') }
  finally { catalogLoading.dataItems = false }
}
async function loadSourceOptions() {
  catalogLoading.sources = true
  try { sourceOptions.value = await api.searchDataSourceOptions(sourceKeyword.value, 20) }
  catch (error) { emit('notify', error.message, 'error') }
  finally { catalogLoading.sources = false }
}
async function loadElementOptions() {
  catalogLoading.elements = true
  try { elementOptions.value = await api.searchElementOptions(form.dataBinding.dataItemCode, form.dataBinding.sourceCode, elementKeyword.value, 50) }
  catch (error) { emit('notify', error.message, 'error') }
  finally { catalogLoading.elements = false }
}
function confirmCascadeReset(message) {
  return !form.dataBinding?.dataItemCode && !form.dataBinding?.elements?.length || window.confirm(message)
}
function chooseDataSource(item) {
  if (form.dataBinding?.sourceCode === item.code) return
  if (!confirmCascadeReset('更换数据源将清空已选数据项和要素项，是否继续？')) return
  form.dataBinding = { dataItemCode: '', dataItemName: '', sourceCode: item.code, sourceName: item.name, elements: [] }
  form.sourceId = ''
  dataItemKeyword.value = ''; elementKeyword.value = ''; dataItemOptions.value = []; elementOptions.value = []
  loadDataItemOptions()
}
function chooseDataItem(item) {
  if (form.dataBinding?.dataItemCode === item.code) return
  if (form.dataBinding?.elements?.length && !window.confirm('更换数据项将清空已选要素项，是否继续？')) return
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
  const elements = [...(form.dataBinding?.elements || [])]
  const index = elements.findIndex(element => element.id === item.id)
  if (index >= 0) elements.splice(index, 1); else elements.push({ ...item })
  form.dataBinding.elements = elements
}
function toggleAllElements() {
  const allSelected = elementOptions.value.length && elementOptions.value.every(isElementSelected)
  const visibleIds = new Set(elementOptions.value.map(item => item.id))
  const retained = (form.dataBinding?.elements || []).filter(item => !visibleIds.has(item.id))
  form.dataBinding.elements = allSelected ? retained : [...retained, ...elementOptions.value.map(item => ({ ...item }))]
}
function initializeDataSelector() {
  sourceKeyword.value = form.dataBinding?.sourceCode || ''
  dataItemKeyword.value = form.dataBinding?.dataItemCode || ''
  elementKeyword.value = ''
  loadSourceOptions()
  if (form.dataBinding?.sourceCode) loadDataItemOptions()
  if (form.dataBinding?.sourceCode) loadElementOptions()
}
function saveDataBinding() {
  if (!hasCompleteDataBinding()) { emit('notify', '请依次选择数据源、数据项和至少一个要素项', 'error'); return }
  save()
}
function collectTimeFields(value, path, fields) {
  if (Array.isArray(value)) {
    value.forEach(item => collectTimeFields(item, `${path}[*]`, fields))
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collectTimeFields(item, `${path}.${key}`, fields))
    return
  }
  const format = typeof value === 'string' && /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? 'yyyy/MM/dd HH:mm:ss'
    : (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value) ? 'yyyy-MM-dd HH:mm:ss' : '')
  if (format) {
    const normalizedPath = path.replace(/(?:\[\*\])+/g, '[*]')
    if (!fields.has(normalizedPath)) fields.set(normalizedPath, { path: normalizedPath, field: normalizedPath.split('.').pop(), sample: value, format })
  }
}
function collectScalarFields(value, path, fields) {
  if (Array.isArray(value)) {
    value.forEach(item => collectScalarFields(item, `${path}[*]`, fields))
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collectScalarFields(item, `${path}.${key}`, fields))
    return
  }
  const normalizedPath = path.replace(/(?:\[\*\])+/g, '[*]')
  if (!fields.has(normalizedPath)) fields.set(normalizedPath, { path: normalizedPath, field: normalizedPath.split('.').pop(), sample: value })
}
function timeBindingOf(path) {
  return (form.bindings || []).find(binding => binding.path === path && (binding.kind === 'TIME_RULE' || binding.kind === 'TIME_OFFSET'))
}
function recommendedTimeStrategy(path) {
  const normalized = String(path || '').toLowerCase()
  if (normalized.endsWith('endtime')) return 'PERIOD_END_TIME'
  if (normalized.endsWith('starttime')) return 'BUSINESS_BASE_TIME'
  if (normalized.endsWith('datatime') || normalized.endsWith('forecasttime') || normalized.endsWith('forecast_time')) return 'DATA_INTERVAL_SEQUENCE'
  return 'TASK_TRIGGER_TIME'
}
function normalizeTimeBinding(binding) {
  if (!binding || (binding.kind !== 'TIME_RULE' && binding.kind !== 'TIME_OFFSET')) return { ...binding }
  const normalized = {
    ...binding,
    kind: 'TIME_RULE',
    strategy: binding.strategy || recommendedTimeStrategy(binding.path),
    format: binding.format || 'yyyy-MM-dd HH:mm:ss'
  }
  if (normalized.strategy === 'TASK_TRIGGER_TIME' && String(normalized.path || '').toLowerCase().endsWith('starttime')) {
    normalized.strategy = 'BUSINESS_BASE_TIME'
  }
  delete normalized.offset
  return normalized
}
function timeStrategyLabel(binding) {
  const strategy = normalizeTimeBinding(binding).strategy
  return timeStrategies.find(item => item[0] === strategy)?.[1] || '未配置'
}
function timeStrategyLabelForField(field) {
  const strategy = timeBindingOf(field.path)?.strategy || recommendedTimeStrategy(field.path)
  return timeStrategies.find(item => item[0] === strategy)?.[1] || '未配置'
}
function toggleTimeBinding(field) {
  const list = [...(form.bindings || [])]
  const index = list.findIndex(binding => binding.path === field.path && (binding.kind === 'TIME_RULE' || binding.kind === 'TIME_OFFSET'))
  if (index >= 0) list.splice(index, 1)
  else list.push({ id: `time-rule-${Date.now()}-${list.length}`, kind: 'TIME_RULE', path: field.path, strategy: recommendedTimeStrategy(field.path), format: field.format })
  form.bindings = list
}
function updateTimeStrategy(field, strategy) {
  const list = [...(form.bindings || [])]
  const index = list.findIndex(binding => binding.path === field.path)
  const item = normalizeTimeBinding({ ...(index >= 0 ? list[index] : {}), id: index >= 0 ? list[index].id : `time-rule-${Date.now()}-${list.length}`, kind: 'TIME_RULE', path: field.path, strategy, format: field.format })
  if (index >= 0) list[index] = item; else list.push(item)
  form.bindings = list
}
function bindAllTimeFields() {
  const existing = [...(form.bindings || [])]
  detectedTimeFields.value.forEach(field => {
    if (!existing.some(binding => binding.path === field.path && (binding.kind === 'TIME_RULE' || binding.kind === 'TIME_OFFSET'))) existing.push({ id: `time-rule-${Date.now()}-${existing.length}`, kind: 'TIME_RULE', path: field.path, strategy: recommendedTimeStrategy(field.path), format: field.format })
  })
  form.bindings = existing.map(normalizeTimeBinding)
}
function addValueBinding() {
  if (!valueBindingDraft.path) { emit('notify', '请先选择要绑定的报文字段', 'error'); return }
  if (valueRuleBindings.value.some(binding => binding.path === valueBindingDraft.path)) {
    emit('notify', '该字段已经配置系统值绑定', 'error'); return
  }
  const binding = {
    id: `value-rule-${Date.now()}-${(form.bindings || []).length}`,
    kind: 'VALUE_RULE', path: valueBindingDraft.path, provider: valueBindingDraft.provider,
    targetType: valueBindingDraft.targetType || 'string'
  }
  if (['PLANNED_TRIGGER_TIME', 'BUSINESS_BASE_TIME', 'PERIOD_END_TIME'].includes(binding.provider)) binding.format = valueBindingDraft.format
  if (binding.provider === 'CONSTANT') binding.value = valueBindingDraft.value
  form.bindings = [...(form.bindings || []), binding]
  Object.assign(valueBindingDraft, { path: '', provider: 'MESSAGE_ID', targetType: 'string', value: '', format: 'yyyy-MM-dd HH:mm:ss' })
}
function removeValueBinding(id) { form.bindings = (form.bindings || []).filter(binding => binding.id !== id) }
function valueProviderLabel(provider) { return valueProviders.find(item => item[0] === provider)?.[1] || provider }
async function inspectSourceFile() {
  const sourceReference = form.fileGeneration?.sourceFilePath || form.fileGeneration?.sourceFileName || findFirstField(form.content, 'filePath')
  if (!sourceReference) { emit('notify', '请填写原始文件地址，或先在报文内容中配置 filePath', 'error'); return }
  fileInspecting.value = true
  try {
    fileInspection.value = await api.inspectFile(sourceReference, form.fileGeneration?.delimiter || ',')
    const first = fileInspection.value.timeColumns?.[0]
    if (first) {
      form.fileGeneration.timeColumn = first.columnName
      form.fileGeneration.sourceTimeFormat = first.format
      emit('notify', `已识别日期字段：${first.columnName}`)
    } else emit('notify', '扫描完成，但未识别到支持的日期字段', 'error')
  } catch (error) { emit('notify', error.message, 'error') }
  finally { fileInspecting.value = false }
}
function findFirstField(content, fieldName) {
  try {
    const queue = [JSON.parse(content || '{}')]
    while (queue.length) {
      const value = queue.shift()
      if (!value || typeof value !== 'object') continue
      if (typeof value[fieldName] === 'string' && value[fieldName].trim()) return value[fieldName].trim()
      queue.push(...Object.values(value).filter(item => item && typeof item === 'object'))
    }
  } catch { return '' }
  return ''
}
function submitCreate() {
  if (!createForm.name.trim()) { createError.value = '请输入报文名称'; return }
  createError.value = ''
  const fileReference = createForm.type === 'FILE'
  const component = props.components[0]
  const item = {
    ...createForm, name: createForm.name.trim(), description: createForm.description.trim(), status: 'DRAFT', encoding: 'UTF-8', sourceId: '',
    dataBinding: { dataItemCode: '', dataItemName: '', sourceCode: '', sourceName: '', elements: [] },
    deliveryTargets: component?.id ? [{ componentId: component.id, producerGroup: producerGroupsOf(component)[0] || '', topic: topicsOf(component)[0] || '' }] : [],
    componentIds: component?.id ? [component.id] : [], componentId: component?.id || '', producerGroup: producerGroupsOf(component)[0] || '', topic: topicsOf(component)[0] || '',
    content: fileReference ? '{\n  "metadata": {\n    "messageId": "示例消息标识"\n  },\n  "records": [{\n    "effectTimePeriod": {\n      "startTime": "2025/06/10 00:00:00",\n      "endTime": "2025/06/13 00:00:00"\n    },\n    "fileName": "SOURCE.csv",\n    "filePath": "http://localhost:8088/files/SOURCE.csv",\n    "fileType": "csv",\n    "planFileSize": "0"\n  }]\n}' : '{\n  "metadata": {\n    "messageId": "示例消息标识"\n  },\n  "records": []\n}',
    fileGeneration: fileReference ? { sourceFileName: '', sourceFilePath: '', timeColumn: '预报时间', sourceTimeFormat: 'yyyy-MM-dd_HH:mm:ss', delimiter: ',' } : undefined,
    bindings: [{ id: `value-rule-${Date.now()}-0`, kind: 'VALUE_RULE', path: '$.metadata.messageId', provider: 'MESSAGE_ID', targetType: 'string' }]
  }
  emit('create', item, created => { selectedId.value = created.id; syncForm(); activeTab.value = 'data'; dialog.value = 'edit' })
}
function confirmDelete() {
  if (!selected.value || referenceTasks.value.length) return
  emit('remove', selected.value.id, () => { selectedId.value = ''; dialog.value = '' })
}
</script>

<template>
  <main class="page message-page">
    <div class="page-heading"><div><h1>报文管理</h1><p>每行展示一份报文，点击名称查看完整配置。</p></div><button v-if="canManage" class="button primary" @click="openCreate"><AppIcon name="plus" :size="16" />新建报文</button></div>
    <section class="card message-list-card">
      <div class="list-toolbar">
        <div><h2>报文列表</h2><p>维护报文内容、变量绑定及关联 Topic。</p></div>
        <div class="filters"><label><span>搜索报文</span><SearchInput v-model="keyword" aria-label="搜索报文" placeholder="名称、数据源名称或 Topic" /></label></div>
      </div>
      <div class="table-scroll"><table class="data-table management-table message-table"><thead><tr><th>报文名称</th><th>数据源名称</th><th>关联数据项</th><th>关联 Topic</th><th>状态</th><th class="align-right">操作</th></tr></thead><tbody>
        <tr v-for="item in visibleTemplates" :key="item.id">
          <td><button class="management-primary message-name" @click="openFor(item, 'detail')">{{ item.name }}</button><small>{{ item.description || '暂无业务描述' }}</small></td>
          <td class="management-body" :title="dataSourceName(item)">{{ dataSourceName(item) }}</td>
          <td class="management-body" :title="dataItemName(item)">{{ dataItemName(item) }}</td>
          <td class="management-body target-cell" :title="targetTopicsOf(item).join('、') || '未关联'">{{ targetTopicsOf(item).join('、') || '未关联' }}</td>
          <td><StatusBadge :status="item.status" /></td>
          <td class="align-right"><div class="row-actions"><button class="link-button" @click="openFor(item, 'detail')">查看</button><button v-if="canManage" class="link-button" @click="openFor(item, 'edit')">配置</button><button class="link-button" @click="openFor(item, 'preview')">预览</button><button v-if="canManage" class="link-button danger-text" @click="openFor(item, 'delete')">删除</button></div></td>
        </tr>
        <tr v-if="!visibleTemplates.length"><td colspan="6" class="empty-state">没有匹配的报文。</td></tr>
      </tbody></table></div>
      <div class="pagination"><span>共 {{ filteredTemplates.length }} 份报文，第 {{ page }} / {{ totalPages }} 页</span><div><button class="button secondary small" :disabled="page <= 1" @click="page--">上一页</button><button class="button secondary small" :disabled="page >= totalPages" @click="page++">下一页</button></div></div>
    </section>

    <AppModal v-if="dialog === 'detail' && selected" title="报文详情" wide @close="dialog = ''">
      <div class="message-detail unified-detail">
        <DetailHeader eyebrow="业务报文" :title="selected.name" :code="selected.id" :description="selected.description || '未填写业务描述'">
          <template #aside><StatusBadge :status="selected.status"/></template>
        </DetailHeader>
        <DetailGrid :columns="3">
          <div><dt>报文类型</dt><dd>{{ selected.type }} 报文</dd></div><div><dt>关联数据项</dt><dd>{{ dataItemName(selected) }}</dd></div><div><dt>默认编码</dt><dd>{{ selected.encoding || 'UTF-8' }}</dd></div>
        </DetailGrid>
        <DetailSection title="数据关联" description="报文生成时使用的数据源、数据项与要素项">
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
        <DetailSection v-if="selected.type === 'FILE'" title="文件生成配置" description="执行时改写源文件并生成带 SIM 标识的新文件">
          <DetailGrid :columns="3"><div><dt>原始文件</dt><dd>{{ selected.fileGeneration?.sourceFilePath || selected.fileGeneration?.sourceFileName || '读取报文 filePath' }}</dd></div><div><dt>时间字段</dt><dd>{{ selected.fileGeneration?.timeColumn || '预报时间' }}</dd></div><div><dt>时间格式</dt><dd><code class="detail-format">{{ selected.fileGeneration?.sourceTimeFormat || 'yyyy-MM-dd_HH:mm:ss' }}</code></dd></div></DetailGrid>
        </DetailSection>
        <DetailSection title="默认投递目标" description="一次任务执行会分别向以下目标投递" :count="deliveryTargetsOf(selected).length">
          <div v-if="deliveryTargetsOf(selected).length" class="table-scroll"><table class="data-table"><thead><tr><th>MQ 实例</th><th>Producer Group</th><th>Topic</th></tr></thead><tbody><tr v-for="target in deliveryTargetsOf(selected)" :key="target.componentId"><td><b>{{ componentOf(target.componentId)?.name || target.componentId }}</b></td><td>{{ target.producerGroup || '未配置' }}</td><td>{{ target.topic || '未配置' }}</td></tr></tbody></table></div><div v-else class="inline-empty">尚未配置投递目标</div>
        </DetailSection>
        <DetailSection title="报文原文" description="数据库中保存的模板内容，真实执行结果请前往执行日志查看" collapsible>
          <pre class="code-block">{{ selected.content || '未配置报文内容' }}</pre>
        </DetailSection>
      </div>
      <template #footer><button class="button secondary" @click="dialog = 'preview'; syncForm()">查看模板预览</button><button class="button secondary" @click="dialog = ''">关闭</button><button v-if="canManage" class="button primary" @click="dialog = 'edit'; activeTab = 'basic'; syncForm()">配置报文</button></template>
    </AppModal>

    <AppModal v-if="canManage && dialog === 'edit' && selected" :title="`配置报文 · ${selected.name}`" wide :before-close="confirmEditorClose" @close="dialog = ''">
      <template #header-actions><button class="button primary" :disabled="selected.status === 'PUBLISHED' || isPending(`update:messages:${selected.id}`)" @click="publish">{{ isPending(`update:messages:${selected.id}`) ? '正在发布…' : (selected.status === 'PUBLISHED' ? '已发布' : '发布报文') }}</button></template>
      <div class="message-context"><div><b>{{ selected.name }}</b><small>{{ selected.type }} · {{ selected.description }}</small></div></div>
      <div v-if="selected.status === 'PUBLISHED'" class="published-edit-notice"><b>当前报文已发布</b><span>修改后点击“保存草稿”将自动转为草稿，完成检查后可在顶部重新发布。</span></div>
      <div class="config-step-navigation"><span class="config-step-label">配置步骤</span><span v-if="isEditorDirty" class="unsaved-indicator" role="status">未保存</span></div>
      <nav class="tabs" role="tablist" aria-label="报文配置步骤"><button v-for="tab in configurationTabs" :key="tab[0]" type="button" role="tab" :data-config-tab="tab[0]" :aria-controls="`config-panel-${tab[0]}`" :aria-selected="activeTab === tab[0]" :tabindex="activeTab === tab[0] ? 0 : -1" :class="{ active: activeTab === tab[0] }" @click="selectConfigurationTab(tab[0])" @keydown="handleConfigurationTabKey($event, tab[0])">{{ tab[1] }}</button></nav>
      <section v-if="activeTab === 'basic'" id="config-panel-basic" class="config-panel" role="tabpanel"><div class="card-heading"><div><h2>基本信息</h2><p>每份报文配置固定生成一条 MQ 消息。</p></div></div><div class="form-grid"><label>报文名称<input v-model="form.name"></label><label>报文类型<select v-model="form.type"><option>JSON</option><option>FILE</option></select></label><label>业务描述<input v-model="form.description"></label><label>默认编码<select v-model="form.encoding"><option>UTF-8</option><option>GBK</option></select></label></div></section>
      <section v-else-if="activeTab === 'content'" id="config-panel-content" class="config-panel" role="tabpanel"><div class="card-heading"><div><h2>报文内容</h2><p>使用 JSON 结构与变量占位符定义最终报文。</p></div><button class="button secondary" @click="formatContent">格式化 / 校验</button></div><textarea v-model="form.content" class="code-editor" spellcheck="false"></textarea><div class="button-row"><button class="button secondary" @click="dialog = 'preview'">生成样例</button></div></section>
      <section v-else-if="activeTab === 'data'" id="config-panel-data" class="config-panel" role="tabpanel"><div class="card-heading"><div><h2>数据关联</h2><p>依次选择数据源、该数据源提供的数据项，以及参与报文生成的要素项。</p></div></div><div class="data-linkage-grid">
        <section class="linkage-step"><h3><span>1</span>选择数据源</h3><p>按来源编码或中文名称远程搜索，最多返回 20 条。</p><label class="catalog-search">搜索数据源<input v-model="sourceKeyword" placeholder="输入来源编码或中文名称"></label><div class="catalog-options"><button v-for="item in sourceOptions" :key="item.code" type="button" :class="{ selected: form.dataBinding?.sourceCode === item.code }" @click="chooseDataSource(item)"><code>{{ item.code }}</code><b>{{ item.name || '未配置中文名称' }}</b><small>{{ item.dataItemCount }} 个数据项</small></button><div v-if="catalogLoading.sources" class="catalog-empty">正在搜索…</div><div v-else-if="!sourceOptions.length" class="catalog-empty">没有匹配的数据源</div></div></section>
        <section class="linkage-step" :class="{ disabled: !form.dataBinding?.sourceCode }"><h3><span>2</span>选择数据项</h3><p>只显示所选数据源实际提供的数据项。</p><label class="catalog-search">筛选数据项<input v-model="dataItemKeyword" :disabled="!form.dataBinding?.sourceCode" placeholder="数据项编码或中文名称"></label><div class="catalog-options"><button v-for="item in dataItemOptions" :key="item.code" type="button" :class="{ selected: form.dataBinding?.dataItemCode === item.code }" @click="chooseDataItem(item)"><code>{{ item.code }}</code><b>{{ item.name || '未配置中文名称' }}</b><small>{{ item.elementCount }} 个要素</small></button><div v-if="catalogLoading.dataItems" class="catalog-empty">正在加载…</div><div v-else-if="form.dataBinding?.sourceCode && !dataItemOptions.length" class="catalog-empty">没有匹配的数据项</div></div></section>
        <section class="linkage-step element-step" :class="{ disabled: !form.dataBinding?.sourceCode }"><h3><span>3</span>选择要素项</h3><p>支持搜索、多选及全选当前结果。</p><label class="catalog-search">搜索要素项<input v-model="elementKeyword" :disabled="!form.dataBinding?.sourceCode" placeholder="要素编码或中文名称"></label><button class="select-all" type="button" :disabled="!elementOptions.length" @click="toggleAllElements">全选/取消当前结果 · 已选 {{ form.dataBinding?.elements?.length || 0 }} 项</button><div class="element-options"><label v-for="item in elementOptions" :key="item.id" :class="{ selected: isElementSelected(item) }"><input type="checkbox" :checked="isElementSelected(item)" @change="toggleElement(item)"><span><b>{{ item.code }} · {{ item.name || '未配置中文名称' }}</b><small>{{ item.unit || '无单位' }} · {{ item.dataFormat || '未配置格式' }}</small></span></label><div v-if="catalogLoading.elements" class="catalog-empty">正在加载…</div><div v-else-if="form.dataBinding?.sourceCode && !elementOptions.length" class="catalog-empty">没有匹配的要素项</div></div></section>
      </div><div class="binding-summary"><div><b>{{ form.dataBinding?.sourceCode || '未选择数据源' }} / {{ form.dataBinding?.dataItemCode || '未选择数据项' }}</b><small>{{ form.dataBinding?.sourceName || '—' }} · {{ form.dataBinding?.dataItemName || '—' }}</small><div class="selected-element-chips"><span v-for="element in form.dataBinding?.elements" :key="element.id">{{ element.code }} {{ element.name }}</span></div></div><strong>已选 {{ form.dataBinding?.elements?.length || 0 }} 个要素</strong></div></section>
      <section v-else-if="activeTab === 'file'" id="config-panel-file" class="config-panel file-template-panel" role="tabpanel">
        <div class="card-heading"><div><h2>文件模板</h2><p>源文件由管理人员预先放入 Nginx；执行时按数据项时间间隔生成新文件，不覆盖源文件。</p></div><button class="button secondary" :disabled="fileInspecting" @click="inspectSourceFile">{{ fileInspecting ? '正在扫描…' : '扫描日期字段' }}</button></div>
        <div class="file-generation-flow"><span>读取人工源文件</span><b>→</b><span>按计划触发时间改写</span><b>→</b><span>发布带 SIM 标识的新文件</span><b>→</b><span>回填外层报文</span></div>
        <div class="form-grid">
          <label>原始文件地址（可选）<input v-model.trim="form.fileGeneration.sourceFilePath" placeholder="留空时读取外层报文中的 filePath"><small>完整 URL 必须属于 Nginx 受控根地址，也可填写共享目录相对路径。</small></label>
          <label>原始文件名（可选）<input v-model.trim="form.fileGeneration.sourceFileName" placeholder="例如 POLLUTION_SHORT_20250610.csv"><small>用于覆盖外层报文 fileName；未填写时自动从地址提取。</small></label>
          <label>文件时间字段<input v-model.trim="form.fileGeneration.timeColumn" placeholder="例如 预报时间"><small>按表头精确匹配；同一时间的多条记录会保持一致。</small></label>
          <label>原始时间格式<select v-model="form.fileGeneration.sourceTimeFormat"><option>yyyy-MM-dd_HH:mm:ss</option><option>yyyy-MM-dd HH:mm:ss</option><option>yyyy/MM/dd HH:mm:ss</option></select><small>样例 CSV 使用下划线格式。</small></label>
          <label>字段分隔符<select v-model="form.fileGeneration.delimiter"><option value=",">逗号（CSV）</option><option value="TAB">制表符（TXT）</option><option value="|">竖线（TXT）</option><option value=";">分号</option></select><small>文件扩展名不决定解析方式，CSV/TXT 均按此配置读取。</small></label>
        </div>
        <div v-if="fileInspection" class="file-inspection-result"><div><span>已扫描</span><b>{{ fileInspection.scannedRows }} 行样本</b></div><button v-for="column in fileInspection.timeColumns" :key="column.columnName" type="button" :class="{ selected: form.fileGeneration.timeColumn === column.columnName }" @click="form.fileGeneration.timeColumn = column.columnName; form.fileGeneration.sourceTimeFormat = column.format"><span>{{ column.columnName }}</span><b>{{ column.sample }}</b><small>{{ column.format }}</small></button><p v-if="!fileInspection.timeColumns?.length">未发现支持的日期字段。</p></div>
        <div class="notice"><b>时间规则：</b>文件第一个时间槽使用后端对齐后的业务基准时间，后续时间槽按所选数据项和数据源在 msc_sys.element_item_cfg 中配置的 period_interval 递增。源文件不存在时记录后端告警日志并终止本次发送。</div>
      </section>
      <section v-else-if="activeTab === 'bindings'" id="config-panel-bindings" class="config-panel time-binding-panel" role="tabpanel">
        <div class="card-heading"><div><h2>时间规则</h2><p>系统自动识别日期字段；任务提供计划触发时间，后端再依据数据项配置计算业务基准时间。</p></div><button class="button secondary" :disabled="!detectedTimeFields.length" @click="bindAllTimeFields">应用推荐规则</button></div>
        <div class="time-binding-guide"><div><span>调度输入</span><b>计划触发时间</b></div><div><span>业务起点</span><b>实况准点 / 预报起报点</b></div><div><span>数据间隔</span><b>读取 period_interval</b></div><div><span>结束时间</span><b>读取 period</b></div><strong>已配置 {{ configuredTimeBindingCount }} / {{ detectedTimeFields.length }}</strong></div>
        <div v-if="!detectedTimeFields.length" class="notice">未识别到 yyyy-MM-dd HH:mm:ss 或 yyyy/MM/dd HH:mm:ss 日期字段，请先检查报文内容。</div>
        <div v-else class="table-scroll"><table class="data-table time-binding-table"><thead><tr><th class="binding-check">替换</th><th>字段</th><th>报文路径</th><th>当前示例值</th><th>生成规则</th></tr></thead><tbody><tr v-for="field in detectedTimeFields" :key="field.path" :class="{ active: timeBindingOf(field.path) }"><td><input type="checkbox" :checked="Boolean(timeBindingOf(field.path))" :aria-label="`绑定 ${field.field}`" @change="toggleTimeBinding(field)"></td><td><b>{{ field.field }}</b><small>{{ field.format }}</small></td><td><code>{{ field.path }}</code></td><td>{{ field.sample }}</td><td><div class="time-strategy-control" :class="{ disabled: !timeBindingOf(field.path) }"><b>{{ timeStrategyLabelForField(field) }}</b><select class="time-strategy-select" :disabled="!timeBindingOf(field.path)" :value="timeBindingOf(field.path)?.strategy || recommendedTimeStrategy(field.path)" :aria-label="`${field.field} 生成规则`" @change="updateTimeStrategy(field, $event.target.value)"><option v-for="strategy in timeStrategies" :key="strategy[0]" :value="strategy[0]">{{ strategy[1] }}</option></select></div></td></tr></tbody></table></div>
        <p class="binding-help">“业务基准时间”会将实况对齐到最近准点、将预报对齐到最近起报点；“按数据项间隔生成”从该基准按 <code>period_interval</code> 递增；“预报结束时间”使用业务基准时间加 <code>period</code>。指定时间执行仅覆盖本次计划触发时间。</p>
        <div class="binding-section-heading"><div><h2>系统值绑定</h2><p>选择任意 JSON 字段及执行值来源；后端不推断字段名称，也不生成业务随机值。</p></div></div>
        <div class="value-binding-editor">
          <label>报文字段<select v-model="valueBindingDraft.path"><option value="">请选择 JSON 字段</option><option v-for="field in detectedScalarFields" :key="field.path" :value="field.path">{{ field.path }} · {{ String(field.sample ?? '') }}</option></select></label>
          <label>值来源<select v-model="valueBindingDraft.provider"><option v-for="provider in valueProviders" :key="provider[0]" :value="provider[0]">{{ provider[1] }}</option></select></label>
          <label>目标类型<select v-model="valueBindingDraft.targetType"><option>string</option><option>integer</option><option>number</option><option>boolean</option><option>json</option></select></label>
          <label v-if="valueBindingDraft.provider === 'CONSTANT'">常量值<input v-model="valueBindingDraft.value" placeholder="输入固定值"></label>
          <label v-else-if="['PLANNED_TRIGGER_TIME', 'BUSINESS_BASE_TIME', 'PERIOD_END_TIME'].includes(valueBindingDraft.provider)">时间格式<select v-model="valueBindingDraft.format"><option>yyyy-MM-dd HH:mm:ss</option><option>yyyy/MM/dd HH:mm:ss</option></select></label>
          <button class="button primary" type="button" @click="addValueBinding">添加绑定</button>
        </div>
        <div class="table-scroll"><table class="data-table value-binding-table"><thead><tr><th>报文字段路径</th><th>值来源</th><th>目标类型</th><th>配置值</th><th class="align-right">操作</th></tr></thead><tbody><tr v-for="binding in valueRuleBindings" :key="binding.id"><td><code>{{ binding.path }}</code></td><td>{{ valueProviderLabel(binding.provider) }}</td><td>{{ binding.targetType || 'string' }}</td><td>{{ binding.provider === 'CONSTANT' ? binding.value : (binding.format || '—') }}</td><td class="align-right"><button class="link-button danger-text" type="button" @click="removeValueBinding(binding.id)">删除</button></td></tr><tr v-if="!valueRuleBindings.length"><td colspan="5" class="empty-state">暂无系统值绑定。消息 ID 等执行值不会自动猜测，请按实际报文字段配置。</td></tr></tbody></table></div>
      </section>
      <section v-else id="config-panel-target" class="config-panel" role="tabpanel">
        <div class="card-heading"><div><h2>默认投递目标</h2><p>每个 MQ 实例分别维护自己的 Producer Group 和 Topic，多个实例不会合并路由选项。</p></div><button class="button secondary" :disabled="!hasCompleteTargets() || targetValidationPending" @click="validateTargets">{{ targetValidationPending ? '正在验证…' : '验证全部实例' }}</button></div>
        <div class="target-form">
          <fieldset class="target-instance-field"><legend>投递目标实例（可多选）</legend><div class="instance-options">
            <label v-for="item in components" :key="item.id" class="instance-option" :class="{ selected: isTargetSelected(item.id) }"><input type="checkbox" :checked="isTargetSelected(item.id)" @change="toggleTargetComponent(item, $event.target.checked)"><span><b>{{ item.name }}</b><small>{{ item.namesrvAddr || item.nameServer }}</small></span></label>
          </div><p v-if="!form.deliveryTargets?.length" class="field-error">请至少选择一个 MQ 实例。</p></fieldset>
          <template v-if="form.deliveryTargets?.length">
            <span class="target-tabs-label">已选实例配置</span>
            <div class="target-tabs" role="tablist" aria-label="已选 MQ 实例">
              <button v-for="target in form.deliveryTargets" :key="target.componentId" type="button" role="tab" :data-target-tab="target.componentId" :aria-controls="`target-panel-${target.componentId}`" :aria-selected="activeTargetComponentId === target.componentId" :tabindex="activeTargetComponentId === target.componentId ? 0 : -1" :class="{ active: activeTargetComponentId === target.componentId }" @click="activeTargetComponentId = target.componentId" @keydown="handleTargetTabKey($event, target.componentId)"><span>{{ componentOf(target.componentId)?.name || target.componentId }}</span><small>{{ target.producerGroup || '未选 Group' }} · {{ target.topic || '未选 Topic' }}</small></button>
            </div>
            <div v-if="activeDeliveryTarget" :id="`target-panel-${activeTargetComponentId}`" class="target-editor" role="tabpanel">
              <div class="target-editor-heading"><div><b>{{ activeTargetComponent?.name }}</b><small>{{ activeTargetComponent?.namesrvAddr || activeTargetComponent?.nameServer }}</small></div><span>当前实例独立配置</span></div>
              <div class="form-grid"><label>Producer Group<select v-model="activeDeliveryTarget.producerGroup" :disabled="!activeProducerGroups.length"><option disabled value="">请选择 Producer Group</option><option v-for="group in activeProducerGroups" :key="group" :value="group">{{ group }}</option></select></label><label>Topic<select v-model="activeDeliveryTarget.topic" :disabled="!activeTopics.length"><option disabled value="">请选择 Topic</option><option v-for="topic in activeTopics" :key="topic" :value="topic">{{ topic }}</option></select></label></div>
            </div>
          </template>
        </div>
        <div class="notice"><b>执行规则：</b>一次任务执行会向每个已选 MQ 目标各发送一条报文；每条投递独立记录成功或失败，互不覆盖。</div>
      </section>
      <template #footer><button class="button primary" :disabled="(activeTab === 'data' && !hasCompleteDataBinding()) || isPending(`update:messages:${selected.id}`)" @click="saveCurrentTab">{{ isPending(`update:messages:${selected.id}`) ? '正在保存…' : '保存草稿' }}</button></template>
    </AppModal>

    <AppModal v-if="canManage && dialog === 'create'" title="新建报文" @close="dialog = ''"><p class="muted">先创建基础草稿，随后通过可搜索的三级选择器关联数据源、数据项和要素项。</p><div class="form-grid"><label>报文名称（必填）<input v-model="createForm.name" autofocus placeholder="例如 weather_station_message" @input="createError = ''"></label><label>报文类型（必填）<select v-model="createForm.type"><option value="JSON">JSON 报文</option><option value="FILE">FILE 报文</option></select></label><label>业务描述<input v-model="createForm.description" placeholder="简要说明报文用途"></label></div><div class="notice">创建后自动进入“数据关联”，草稿完成关联前不能发布。</div><p v-if="createError" class="status-badge negative">{{ createError }}</p><template #footer><button class="button secondary" @click="dialog = ''">取消</button><button class="button primary" :disabled="isPending('create:messages')" @click="submitCreate">{{ isPending('create:messages') ? '正在创建…' : '创建并关联数据' }}</button></template></AppModal>
    <AppModal v-if="canManage && dialog === 'delete' && selected" title="删除报文" @close="dialog = ''"><p>确定删除报文 <b>{{ selected.name }}</b> 吗？删除后无法恢复。</p><div v-if="referenceTasks.length" class="notice"><b>当前不能删除：</b>该报文仍被 {{ referenceTasks.length }} 个任务引用：{{ referenceTasks.map(item => item.name).join('、') }}。</div><div v-else class="notice">该报文没有被任务引用，确认后将从 PostgreSQL 删除。</div><template #footer><button class="button secondary" @click="dialog = ''">取消</button><button class="button danger" :disabled="referenceTasks.length || isPending(`remove:messages:${selected.id}`)" @click="confirmDelete">{{ isPending(`remove:messages:${selected.id}`) ? '正在删除…' : '确认删除' }}</button></template></AppModal>
    <AppModal v-if="dialog === 'preview' && selected" title="数据库中的报文模板" wide @close="dialog = ''"><p class="muted">以下内容来自当前报文资源；真实执行生成的最终报文请在执行日志查看。</p><pre class="code-block">{{ form.content || selected.content }}</pre><template #footer><button class="button secondary" @click="dialog = ''">关闭</button></template></AppModal>
  </main>
</template>

<style scoped>
.message-list-card { padding: 0; overflow: hidden; }
.list-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 18px 20px; border-bottom: 1px solid #ebeef5; }
.list-toolbar h2 { margin: 0; font-size: 17px; }.list-toolbar p { margin: 6px 0 0; color: #667085; }
.filters { display: flex; align-items: flex-end; gap: 12px; }.filters label { display: block; color: #606266; font-size: 13px; font-weight: 600; }.filters label > span:first-child { display: block; margin-bottom: 7px; }
.filters label { width: 300px; }
.message-table { min-width: 1060px; table-layout: fixed; }.message-table th:nth-child(1) { width: 200px; }.message-table th:nth-child(2) { width: 185px; }.message-table th:nth-child(3) { width: 170px; }.message-table th:nth-child(4) { width: 245px; }.message-table th:nth-child(5) { width: 90px; }.message-table th:nth-child(6) { width: 170px; }
.message-table td { overflow: hidden; color: #4f6178; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.message-table th:first-child, .message-table td:first-child { padding-left: 20px; }.message-table th:last-child, .message-table td:last-child { padding-right: 20px; }.message-name { max-width: 100%; overflow: hidden; color: var(--management-link); font-size: 16px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.target-cell { color: #4f6178 !important; font-family: inherit; font-size: 15px; font-weight: 450; }
.message-detail { color: #465973; }
.unified-detail { display: grid; gap: 16px; }
.binding-overview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: hidden; border: 1px solid #e3e8f0; border-radius: 11px; background: #fafbfd; }.binding-overview > div { min-width: 0; padding: 13px 15px; border-right: 1px solid #e7ecf3; }.binding-overview > div:last-child { border-right: 0; }.binding-overview span, .binding-overview b, .binding-overview code { display: block; }.binding-overview span { color: #78879b; font-size: 13px; }.binding-overview b { margin-top: 4px; color: #334a64; font-size: 15px; }.binding-overview code { margin-top: 3px; color: #586f8a; font: 600 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.linked-elements-card { overflow: hidden; margin-top: 12px; border: 1px solid #e0e6ef; border-radius: 11px; background: #fff; }
.linked-elements-heading { display: flex; min-height: 42px; align-items: center; justify-content: space-between; gap: 16px; padding: 0 15px; border-bottom: 1px solid #e6ebf2; background: #f7f9fc; }
.linked-elements-heading b { color: #334a64; font-size: 15px; font-weight: 650; }
.linked-elements-heading span { color: #64758c; font-size: 13px; font-weight: 600; }
.linked-elements-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); background: #fff; }
.linked-elements-list > span { min-width: 0; padding: 11px 15px; border-right: 1px solid #e8edf4; border-bottom: 1px solid #e8edf4; background: #fff; }
.linked-elements-list > span:nth-child(3n) { border-right: 0; }
.linked-elements-list code, .linked-elements-list b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.linked-elements-list code { color: #2d5fcf; font: 650 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.linked-elements-list b { margin-top: 3px; color: #40546d; font-size: 14px; font-weight: 600; line-height: 1.5; }
.linked-elements-empty { padding: 18px; color: #7d8a9d; text-align: center; font-size: 14px; }
.inline-empty { padding: 17px; border: 1px dashed #d8e0eb; border-radius: 10px; color: #7d8a9d; text-align: center; background: #fafbfd; font-size: 14px; }
.message-detail .code-block { max-height: 320px; margin: 0; padding: 17px 18px; border-color: #273752; border-radius: 9px; background: #19253a; color: #d9e3f0; font-size: 14px; line-height: 1.65; }
body .page .message-detail .data-table th { padding: 12px 14px; background: #f7f9fc; color: #687890; font-size: 13px; font-weight: 650; letter-spacing: .01em; }
body .page .message-detail .data-table td { padding: 15px 14px; color: #4d5f77; font-size: 15px; font-weight: 400; line-height: 1.55; }
body .page .message-detail .detail-path { color: #2c486d; font: 600 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
body .page .message-detail .detail-format { color: #5c6d84; font: 500 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.message-context { display: flex; align-items: flex-start; justify-content: space-between; padding: 0 0 14px; }.message-context b { font-size: 17px; }.message-context small { display: block; margin-top: 4px; color: var(--muted); font-size: var(--type-form-label); }
.config-step-navigation { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.config-step-label { color: #526078; font-size: var(--type-form-label); font-weight: 700; }
.unsaved-indicator { display: inline-flex; align-items: center; gap: 6px; color: var(--amber); font-size: var(--type-form-label); font-weight: 650; }.unsaved-indicator::before { width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ''; }
.tabs { margin-top: 7px; }.tabs button { min-height: var(--control-height); border-radius: 8px 8px 0 0; font-size: var(--type-form-body); font-weight: 600; }.config-panel { min-height: 360px; }
.config-panel .form-grid label { font-size: var(--type-form-label); }.config-panel .form-grid input, .config-panel .form-grid select { min-height: var(--control-height); color: var(--text); font-size: var(--type-form-body); }.config-panel .code-editor { font-size: var(--type-form-body); }
.published-edit-notice { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; padding: 11px 14px; border: 1px solid #ead5a8; border-radius: var(--radius-sm); background: var(--amber-soft); color: var(--amber); font-size: var(--type-form-label); }.published-edit-notice b { flex: 0 0 auto; color: #9a691d; }.published-edit-notice span { color: #7d622f; }
.data-linkage-grid { display: grid; grid-template-columns: 1.05fr 1fr 1.2fr; gap: 12px; }.linkage-step { min-width: 0; padding: 15px; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fafbfd; }.linkage-step.disabled { opacity: .62; }.linkage-step h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; color: var(--ink); font-size: 15px; }.linkage-step h3 span { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: var(--blue); color: #fff; font-size: 12px; }.linkage-step > p { min-height: 40px; margin: 0 0 10px; color: var(--muted); font-size: var(--type-form-label); }.catalog-search { display: block; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.catalog-search input { width: 100%; height: var(--control-height); margin-top: 7px; padding: 0 11px; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); outline: 0; background: #fff; color: var(--text); font-size: var(--type-form-body); }.catalog-search input:focus { border-color: #6887e9; box-shadow: 0 0 0 3px #356cff13; }.catalog-options, .element-options { max-height: 270px; margin-top: 8px; overflow: auto; }.catalog-options > button { display: grid; width: 100%; gap: 3px; padding: 10px 11px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; text-align: left; }.catalog-options > button:hover, .catalog-options > button.selected { border-color: #a9bcf5; background: var(--blue-soft); }.catalog-options code { overflow: hidden; color: var(--management-link); font-size: var(--type-form-body); text-overflow: ellipsis; }.catalog-options b { overflow: hidden; color: var(--ink); font-size: var(--type-form-body); text-overflow: ellipsis; white-space: nowrap; }.catalog-options small, .element-options small { color: var(--muted); font-size: var(--type-form-label); }.catalog-empty { padding: 22px 8px; color: var(--muted); text-align: center; font-size: var(--type-form-body); }.select-all { width: 100%; margin-top: 8px; padding: 9px 10px; border: 1px solid #a9bcf5; border-radius: var(--radius-sm); background: var(--blue-soft); color: var(--management-link); font-size: var(--type-form-label); text-align: left; }.element-options > label { display: flex; align-items: flex-start; gap: 8px; padding: 10px; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; }.element-options > label:hover, .element-options > label.selected { border-color: #a9bcf5; background: var(--blue-soft); }.element-options input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }.element-options span { min-width: 0; }.element-options b, .element-options small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.element-options b { font-size: var(--type-form-body); }.binding-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 14px 16px; border: 1px solid #a9bcf5; border-radius: var(--radius-md); background: var(--blue-soft); }.binding-summary b, .binding-summary small { display: block; }.binding-summary b { font-size: var(--type-form-body); }.binding-summary small { margin-top: 3px; color: var(--text); font-size: var(--type-form-label); }.binding-summary strong { flex: 0 0 auto; color: var(--management-link); font-size: var(--type-form-body); }.selected-element-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }.selected-element-chips span { padding: 4px 8px; border: 1px solid #a9bcf5; border-radius: 7px; background: #fff; color: var(--management-link); font-size: var(--type-form-label); }
.target-form { display: grid; gap: 18px; }.target-instance-field { min-width: 0; margin: 0; padding: 0; border: 0; }.target-instance-field legend { margin-bottom: 9px; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.instance-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.instance-option { display: flex; align-items: center; min-width: 0; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; cursor: pointer; transition: border-color .2s, background .2s; }.instance-option:hover { border-color: #a9bcf5; }.instance-option.selected { border-color: var(--blue); background: var(--blue-soft); }.instance-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--blue); }.instance-option span { min-width: 0; }.instance-option b, .instance-option small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.instance-option b { color: var(--ink); font-size: var(--type-form-body); }.instance-option small { margin-top: 3px; color: var(--muted); font-size: var(--type-form-label); }.field-error { margin: 8px 0 0; color: var(--red); font-size: var(--type-form-label); }
.target-tabs-label { margin-bottom: -11px; color: #526078; font-size: var(--type-form-label); font-weight: 650; }
.target-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; border-bottom: 1px solid var(--line); }.target-tabs button { min-width: 210px; padding: 10px 13px; border: 1px solid var(--line); border-bottom: 2px solid transparent; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: #f7f9fc; color: var(--text); text-align: left; }.target-tabs button:hover { border-color: #a9bcf5; }.target-tabs button.active { border-color: #a9bcf5; border-bottom-color: var(--blue); background: var(--blue-soft); color: var(--ink); }.target-tabs span, .target-tabs small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.target-tabs span { font-size: var(--type-form-body); font-weight: 650; }.target-tabs small { margin-top: 4px; color: var(--muted); font-size: var(--type-form-label); }.target-editor { padding: 16px; border: 1px solid #a9bcf5; border-radius: var(--radius-md); background: #f8faff; }.target-editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }.target-editor-heading b, .target-editor-heading small { display: block; }.target-editor-heading b { color: var(--ink); font-size: 15px; }.target-editor-heading small { margin-top: 3px; color: var(--muted); font-size: var(--type-form-label); }.target-editor-heading > span { padding: 4px 8px; border-radius: 7px; background: var(--blue-soft); color: var(--management-link); font-size: var(--type-form-label); }
.time-binding-guide { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; align-items: center; gap: 12px; margin-bottom: 14px; padding: 14px 16px; border: 1px solid #a9bcf5; border-radius: var(--radius-md); background: var(--blue-soft); }.time-binding-guide span, .time-binding-guide b { display: block; }.time-binding-guide span { margin-bottom: 3px; color: var(--text); font-size: var(--type-form-label); }.time-binding-guide b { color: var(--ink); font-size: var(--type-form-body); }.time-binding-guide strong { color: var(--management-link); font-size: var(--type-form-body); white-space: nowrap; }.time-binding-table { min-width: 960px; table-layout: fixed; }.time-binding-table th:nth-child(1) { width: 62px; }.time-binding-table th:nth-child(2) { width: 145px; }.time-binding-table th:nth-child(3) { width: 320px; }.time-binding-table th:nth-child(4) { width: 190px; }.time-binding-table th:nth-child(5) { width: 220px; }.time-binding-table td { height: 62px; }.time-binding-table tbody tr.active td { background: #f5f8ff; }.time-binding-table input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--blue); }.time-binding-table code { color: var(--management-link); font-size: var(--type-form-body); }
.time-strategy-control { position: relative; display: flex; width: 100%; min-width: 190px; height: var(--control-height); align-items: center; padding: 0 34px 0 11px; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); background: #fff; transition: border-color .18s, box-shadow .18s, background .18s; }.time-strategy-control:hover { border-color: #bdc9dc; }.time-strategy-control:focus-within { border-color: #6887e9; box-shadow: 0 0 0 3px #356cff13; }.time-strategy-control::after { position: absolute; top: 50%; right: 13px; width: 6px; height: 6px; border-right: 1.5px solid #606266; border-bottom: 1.5px solid #606266; content: ''; pointer-events: none; transform: translateY(-70%) rotate(45deg); }.time-strategy-control > b { display: block; min-width: 0; overflow: hidden; color: var(--text); font-size: var(--type-form-body); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }.time-strategy-control.disabled { background: #f5f7fa; }.time-strategy-control.disabled > b { color: var(--quiet); }.time-strategy-control.disabled::after { border-color: var(--quiet); }.time-strategy-select { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; cursor: pointer; opacity: 0; }.time-strategy-select:disabled { cursor: not-allowed; }.binding-help { margin: 12px 0 0; color: var(--text); font-size: var(--type-form-label); }.binding-help code { color: var(--management-link); }
.binding-section-heading { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }.binding-section-heading h2 { margin: 0; color: var(--ink); font-size: 17px; }.binding-section-heading p { margin: 5px 0 0; color: var(--muted); font-size: var(--type-form-label); }.value-binding-editor { display: grid; grid-template-columns: minmax(260px, 1.7fr) minmax(170px, 1fr) minmax(130px, .7fr) minmax(170px, 1fr) auto; align-items: end; gap: 10px; margin: 14px 0; padding: 15px; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fafbfd; }.value-binding-editor label { min-width: 0; color: #526078; font-size: var(--type-form-label); font-weight: 650; }.value-binding-editor select, .value-binding-editor input { width: 100%; height: var(--control-height); margin-top: 7px; padding: 0 11px; border: 1px solid #d9e0ea; border-radius: var(--radius-sm); background: #fff; color: var(--text); font-size: var(--type-form-body); }.value-binding-editor .button { height: var(--control-height); white-space: nowrap; }.value-binding-table { min-width: 800px; }.value-binding-table code { color: var(--management-link); font-size: var(--type-form-body); }
.file-template-panel .form-grid { margin-top: 18px; }
.file-template-panel label small { display: block; margin-top: 6px; color: var(--muted); font-size: var(--type-form-label); font-weight: 400; }
.file-generation-flow { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 14px; border: 1px solid #a9bcf5; border-radius: var(--radius-md); background: #f5f8ff; color: var(--management-link); font-size: var(--type-form-body); }
.file-generation-flow span { padding: 7px 11px; border-radius: var(--radius-sm); background: #fff; }.file-generation-flow b { color: #7894e9; }
.file-inspection-result { display: flex; align-items: stretch; gap: 10px; margin-top: 16px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-md); background: #fafbfd; }.file-inspection-result > div, .file-inspection-result button { min-width: 150px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: #fff; text-align: left; }.file-inspection-result button { cursor: pointer; }.file-inspection-result button.selected { border-color: var(--blue); background: var(--blue-soft); }.file-inspection-result span, .file-inspection-result b, .file-inspection-result small { display: block; }.file-inspection-result span, .file-inspection-result small { color: var(--muted); font-size: var(--type-form-label); }.file-inspection-result b { margin: 4px 0; color: var(--ink); font-size: var(--type-form-body); }
@media (max-width: 1100px) { .data-linkage-grid { grid-template-columns: 1fr; }.linkage-step > p { min-height: 0; }.file-generation-flow { align-items: stretch; flex-direction: column; }.file-generation-flow b { display: none; }.value-binding-editor { grid-template-columns: 1fr 1fr; } }
@media (max-width: 900px) { .list-toolbar, .filters { align-items: stretch; flex-direction: column; }.filters label { width: 100%; }.binding-overview { grid-template-columns: 1fr; }.binding-overview > div { border-right: 0; border-bottom: 1px solid #e7ecf3; }.linked-elements-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.time-binding-guide { grid-template-columns: 1fr 1fr; } }
</style>
