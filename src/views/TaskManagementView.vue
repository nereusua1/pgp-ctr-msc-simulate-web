<script setup>
import {useFormLeaveGuard} from '../form-leave-guard.mjs'
import ListFilters from '../components/ListFilters.vue'
import ListPagination from '../components/ListPagination.vue'
import {computed, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue'
import AppModal from '../components/AppModal.vue'
import AppDetailPage from '../components/AppDetailPage.vue'
import {setRoute} from '../page-route.mjs'
import {useListState} from '../list-state.mjs'
import {taskFormError, latestRequest} from '../interaction-policy.mjs'
import AppIcon from '../components/AppIcon.vue'
import SearchInput from '../components/SearchInput.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailSection from '../components/DetailSection.vue'
import {formatDateTime} from '../date-time.mjs'

const props = defineProps({
  tasks: {type: Array, default: () => []},
  templates: {type: Array, default: () => []},
  sources: {type: Array, default: () => []},
  executionMessages: {type: Array, default: () => []},
  selectedTaskId: {type: String, default: ''},
  pendingActions: {type: Object, default: () => new Set()},
  canManage: {type: Boolean, default: false}
  ,routeId: {type: String, default: ''}
  ,components: {type: Array, default: () => []}
})
const emit = defineEmits(['editing-state', 'create', 'run', 'preview-time', 'update', 'remove', 'load-messages', 'load-task-execution-overview', 'batch-update'])
const selectedId = ref('')
const dialog = ref('')
const formError = ref('')
const runError = ref('')
const batchIds = ref([])
const batchResults = ref([])
const {keyword, status: statusFilter, page, pageSize} = useListState('tasks')
const messageFilter = ref('ALL')
const dataItemFilter = ref('')
const dataSourceFilter = ref('')
const form = reactive({name: '', messageId: '', scheduleType: 'FIXED_RATE', schedule: '10', scheduleYear: '*'})
const runForm = reactive({mode: 'MANUAL_CURRENT', plannedTriggerTime: ''})
const timePreview = ref(null)
const executionOverview = ref(null)
const executionOverviewLoading = ref(false)
const executionOverviewError = ref('')
const cron = reactive({year: '*', month: '*', day: '*', hour: '*', minute: '*/5', second: '0'})
const currentYear = new Date().getFullYear()
const yearOptions = Array.from({length: 11}, (_, index) => String(currentYear + index))
const numericOptions = (max, unit, intervals = []) => [
  {value: '*', label: `每${unit}`},
  ...intervals.map(value => ({value: `*/${value}`, label: `每 ${value} ${unit}`})),
  ...Array.from({length: max + 1}, (_, value) => ({value: String(value), label: `${value}`}))
]
const monthOptions = numericOptions(11, '月').map((item, index) => index === 0 ? item : (item.value.startsWith('*/') ? item : {
  value: String(Number(item.value) + 1),
  label: `${Number(item.label) + 1} 月`
}))
const dayOptions = [{value: '*', label: '每日'}, ...Array.from({length: 31}, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} 日`
}))]
const hourOptions = numericOptions(23, '小时', [2, 3, 4, 6, 12])
const minuteOptions = numericOptions(59, '分钟', [5, 10, 15, 20, 30])
const secondOptions = numericOptions(59, '秒', [5, 10, 15, 30])
const optionLabel = (options, value, suffix = '') => options.find(item => item.value === value)?.label || `${value}${suffix}`
const cronDescription = computed(() => [
  cron.year === '*' ? '每年' : `${cron.year} 年`,
  optionLabel(monthOptions, cron.month, ' 月'),
  optionLabel(dayOptions, cron.day, ' 日'),
  cron.hour === '*' ? '每小时' : (cron.hour.startsWith('*/') ? optionLabel(hourOptions, cron.hour) : `${cron.hour} 时`),
  cron.minute === '*' ? '每分钟' : (cron.minute.startsWith('*/') ? optionLabel(minuteOptions, cron.minute) : `${cron.minute} 分`),
  cron.second === '*' ? '每秒' : (cron.second.startsWith('*/') ? optionLabel(secondOptions, cron.second) : `${cron.second} 秒`)
].join(' · '))
const selected = computed(() => props.tasks.find(item => item.id === selectedId.value))
const filteredTasks = computed(() => props.tasks.filter(task => (statusFilter.value === 'ALL' || task.status === statusFilter.value) &&
  [task.name, props.templates.find(item => item.id === task.messageId)?.name].some(value => String(value || '').toLowerCase().includes(keyword.value.trim().toLowerCase()))))
const totalPages = computed(() => Math.max(1, Math.ceil(filteredTasks.value.length / pageSize.value)))
const visibleTasks = computed(() => filteredTasks.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const selectedTemplate = computed(() => props.templates.find(item => item.id === selected.value?.messageId))
const currentTargets = computed(() => selectedTemplate.value?.deliveryTargets || [])
const manualUnavailable = computed(() => !selectedTemplate.value ? '未找到关联报文模板' :
  !currentTargets.value.length ? '报文模板尚未配置消息云投递目标' :
  currentTargets.value.some(target => !props.components.some(item => item.id === target.componentId && item.status !== 'DISABLED')) ? '投递目标不存在或已停用' : '')
function toggleBatch(id) {
  batchIds.value = batchIds.value.includes(id) ? batchIds.value.filter(value => value !== id) : [...batchIds.value, id]
}
function batchEnabled(enabled) {
  const items = visibleTasks.value.filter(item => batchIds.value.includes(item.id))
  if (!items.length) return
  emit('batch-update', {items, enabled, onCompleted: results => {
    batchResults.value = results
    batchIds.value = results.filter(item => !item.success).map(item => item.id)
  }})
}
watch([page, keyword, statusFilter, pageSize], () => { batchIds.value = []; batchResults.value = [] })
const selectedExecutions = computed(() => executionOverview.value?.recentExecutions || [])
const latestExecution = computed(() => selectedExecutions.value[0])
const messages = computed(() => props.executionMessages.filter(item => (
    item.executionId === latestExecution.value?.id && (messageFilter.value === 'ALL' || item.status === messageFilter.value)
)))
const bindingOf = template => {
  if (template?.dataBinding) return template.dataBinding
  const legacySource = props.sources.find(item => item.id === template?.sourceId)
  return legacySource ? {
    dataItemCode: legacySource.dataItemCode || legacySource.code || '',
    dataItemName: legacySource.dataItemName || legacySource.name || '',
    sourceCode: legacySource.sourceCode || '',
    sourceName: legacySource.sourceCodeName || ''
  } : {}
}
const normalizedSearch = value => String(value || '').trim().toLowerCase()
const matchesBinding = (template, dataItemSearch, dataSourceSearch) => {
  const binding = bindingOf(template)
  const itemText = `${binding.dataItemCode || ''} ${binding.dataItemName || ''}`.toLowerCase()
  const sourceText = `${binding.sourceCode || ''} ${binding.sourceName || ''}`.toLowerCase()
  return (!dataItemSearch || itemText.includes(dataItemSearch)) && (!dataSourceSearch || sourceText.includes(dataSourceSearch))
}
const filteredTemplates = computed(() => {
  const itemSearch = normalizedSearch(dataItemFilter.value)
  const sourceSearch = normalizedSearch(dataSourceFilter.value)
  return props.templates.filter(item => matchesBinding(item, itemSearch, sourceSearch))
})
const messageOptions = computed(() => filteredTemplates.value.slice(0, 50))
const scheduleText = task => {
  if (task.scheduleType === 'MANUAL') return '手工执行'
  if (task.scheduleType === 'CRON') return task.scheduleYear && task.scheduleYear !== '*' ? `${task.scheduleYear} 年 · ${task.schedule}` : task.schedule
  return `每 ${task.schedule} 秒`
}
const isPending = key => props.pendingActions.has(key)
const isTaskPending = task => task && ['run', 'update', 'remove'].some(action => isPending(`${action}:tasks:${task.id}`) || isPending(`${action}:${task.id}`))

function syncCronExpression() {
  form.schedule = `${cron.second} ${cron.minute} ${cron.hour} ${cron.day} ${cron.month} ?`
  form.scheduleYear = cron.year
}

function loadCronExpression(expression, year = '*') {
  const parts = String(expression || '').trim().split(/\s+/)
  Object.assign(cron, {
    second: parts.length >= 6 ? parts[0] : '0',
    minute: parts.length >= 6 ? parts[1] : '*/5',
    hour: parts.length >= 6 ? parts[2] : '*',
    day: parts.length >= 6 ? parts[3] : '*',
    month: parts.length >= 6 ? parts[4] : '*',
    year: year || '*'
  })
  syncCronExpression()
}

function onScheduleTypeChange() {
  if (form.scheduleType === 'CRON') loadCronExpression(form.schedule, form.scheduleYear)
  if (form.scheduleType === 'FIXED_RATE' && /\s/.test(String(form.schedule || ''))) form.schedule = '10'
}

function openCreate() {
  const template = null
  formError.value = ''
  dataItemFilter.value = ''
  dataSourceFilter.value = ''
  Object.assign(form, {
    name: '',
    messageId: template?.id || '',
    scheduleType: 'FIXED_RATE',
    schedule: '10',
    scheduleYear: '*'
  })
  dialog.value = 'create'
}
function handleGlobalCreate(event) { if (event.detail?.page === 'tasks') openCreate() }
onMounted(() => window.addEventListener('global-create', handleGlobalCreate))
onBeforeUnmount(() => window.removeEventListener('global-create', handleGlobalCreate))

function openEdit(task) {
  formError.value = ''
  selectedId.value = task.id
  const template = props.templates.find(item => item.id === task.messageId)
  const binding = bindingOf(template)
  dataItemFilter.value = binding.dataItemCode || binding.dataItemName || ''
  dataSourceFilter.value = binding.sourceCode || binding.sourceName || ''
  Object.assign(form, {
    name: task.name || '',
    messageId: task.messageId || '',
    scheduleType: task.scheduleType || 'FIXED_RATE',
    schedule: task.schedule || '',
    scheduleYear: task.scheduleYear || '*'
  })
  if (form.scheduleType === 'CRON') loadCronExpression(form.schedule, form.scheduleYear)
  dialog.value = 'edit'
}

function submit() {
  formError.value = taskFormError(form)
  if (formError.value) return
  if (dialog.value === 'edit' && selected.value) {
    const updated = {...selected.value, ...form}
    delete updated.componentId
    delete updated.producerGroup
    delete updated.topic
    emit('update', updated, result => {
      if (result?.success) dialog.value = props.routeId ? 'detail' : ''
      else formError.value = result?.error || '保存失败，输入已保留'
    })
  } else {
    emit('create', {...form, status: 'DRAFT'}, () => { dialog.value = '' }, error => { formError.value = error })
  }
}

function openDetail(task) {
  selectedId.value = task.id
  dialog.value = 'detail'
  setRoute('tasks', task.id)
  executionOverview.value = null
  loadExecutionOverview(task.id)
}

function loadExecutionOverview(taskId = selected.value?.id) {
  if (!taskId || isPending(`load-task-execution-overview:${taskId}`)) return
  executionOverviewLoading.value = true
  executionOverviewError.value = ''
  emit('load-task-execution-overview', taskId, result => {
    executionOverview.value = result?.data || null
    executionOverviewError.value = result?.error || ''
    executionOverviewLoading.value = false
  })
}

function toLocalDateTimeInput(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function openRun(task) {
  runError.value = ''
  selectedId.value = task.id
  Object.assign(runForm, {mode: props.canManage ? 'MANUAL_CURRENT' : 'MANUAL_SPECIFIED', plannedTriggerTime: ''})
  timePreview.value = null
  dialog.value = 'run'
  previewRunTime()
}

function openHistorical(task) {
  openRun(task)
  runForm.mode = 'MANUAL_SPECIFIED'
  timePreview.value = null
}

function useYesterday() {
  const value = new Date()
  value.setDate(value.getDate() - 1)
  value.setMilliseconds(0)
  runForm.mode = 'MANUAL_SPECIFIED'
  runForm.plannedTriggerTime = toLocalDateTimeInput(value)
  timePreview.value = null
}

function executionRequest() {
  return {
    mode: runForm.mode,
    plannedTriggerTime: runForm.mode === 'MANUAL_SPECIFIED' ? runForm.plannedTriggerTime : null
  }
}

const beginTimePreview = latestRequest()
watch(() => [runForm.mode, runForm.plannedTriggerTime], () => { beginTimePreview(); timePreview.value = null }, {flush: 'sync'})
function previewRunTime() {
  if (!selected.value || (runForm.mode === 'MANUAL_SPECIFIED' && !runForm.plannedTriggerTime)) return
  const isLatest = beginTimePreview()
  emit('preview-time', {task: selected.value, request: executionRequest(), onLoaded: result => { if (isLatest()) timePreview.value = result }})
}

function confirmRun() {
  if (!selected.value || !timePreview.value || (!props.canManage && runForm.mode !== 'MANUAL_SPECIFIED') ||
      (runForm.mode === 'MANUAL_SPECIFIED' && !runForm.plannedTriggerTime)) return
  if (manualUnavailable.value) { runError.value = manualUnavailable.value; return }
  emit('run', {task: selected.value, request: executionRequest(), onCompleted: () => { dialog.value = 'detail'; loadExecutionOverview(selected.value?.id) }, onFailed: error => { runError.value = error }})
}

function openDelete(task) {
  selectedId.value = task.id
  dialog.value = 'delete'
}

function confirmDelete() {
  if (!selected.value) return
  emit('remove', selected.value.id, () => {
    selectedId.value = ''
    dialog.value = ''
    setRoute('tasks')
  })
}

function openMessages() {
  if (!latestExecution.value) return
  if (isPending(`load-messages:${latestExecution.value.id}`)) return
  messageFilter.value = 'ALL'
  emit('load-messages', latestExecution.value.id)
  dialog.value = 'messages'
}

function setTaskEnabled(task, enabled, closeDialog = false) {
  if (!task) return
  emit('update', {...task, status: enabled ? 'ENABLED' : 'DISABLED'}, result => {
    if (result?.success && closeDialog) dialog.value = ''
  })
}

watch(() => props.selectedTaskId, id => {
  if (id && props.tasks.some(item => item.id === id)) openDetail(props.tasks.find(item => item.id === id))
}, {immediate: true})
watch(() => props.routeId, id => {
  if (!id && dialog.value === 'detail') dialog.value = ''
})
watch([dataItemFilter, dataSourceFilter], () => {
  if (!filteredTemplates.value.some(item => item.id === form.messageId)) form.messageId = ''
})
watch(totalPages, value => { if (page.value > value) page.value = value })
watch(cron, syncCronExpression, {deep: true})

const {dirty: formDirty, confirmClose: confirmFormClose} = useFormLeaveGuard(
  () => ['create', 'edit'].includes(dialog.value),
  () => JSON.stringify({form, cron}),
  value => emit('editing-state', value)
)
</script>

<template>
  <main class="page">
    <div v-show="!routeId" class="page-heading">
      <div><h1>任务管理</h1>
        <p>任务配置报文、RocketMQ 投递目标与调度方式；执行结果来自后端实际投递记录。</p></div>
      <button v-if="canManage" class="button primary" @click="openCreate"><AppIcon name="plus" :size="16" />新建任务</button>
    </div>
    <section v-show="!routeId" class="card task-list-card">
      <div v-if="canManage && batchIds.length" class="task-batch-actions">
        <span>已选当前页 {{ batchIds.length }} 个任务</span><button class="link-button" @click="batchIds = []">取消选择</button>
        <button class="link-button" :disabled="isPending('batch:tasks')" @click="batchIds = visibleTasks.map(item => item.id)">选择当前页</button>
        <button class="button secondary small" :disabled="!batchIds.length || isPending('batch:tasks')" @click="batchEnabled(true)">批量启用</button>
        <button class="button secondary small" :disabled="!batchIds.length || isPending('batch:tasks')" @click="batchEnabled(false)">批量停用</button>
      </div>
      <div v-if="batchResults.length" class="notice" role="status"><p v-for="result in batchResults" :key="result.id">{{ result.name }}：{{ result.success ? '已完成' : result.error }}</p></div>
      <ListFilters>
        <label>搜索任务<SearchInput v-model="keyword" aria-label="搜索任务" placeholder="任务或报文模板名称" /></label>
        <label>自动调度状态<select v-model="statusFilter"><option value="ALL">全部</option><option value="ENABLED">已启用</option><option value="DISABLED">已停用</option><option value="DRAFT">草稿</option></select></label>
        <button v-if="keyword || statusFilter !== 'ALL'" class="link-button" @click="keyword = ''; statusFilter = 'ALL'">清除筛选</button>
      </ListFilters>
      <div class="table-scroll" :class="{'is-loading': isPending('batch:tasks')}">
        <table class="data-table management-table task-table">
          <thead>
          <tr>
            <th><input v-if="canManage" class="task-selection" type="checkbox" aria-label="选择当前页全部任务" :checked="visibleTasks.length > 0 && batchIds.length === visibleTasks.length" :indeterminate="batchIds.length > 0 && batchIds.length < visibleTasks.length" :disabled="!visibleTasks.length || isPending('batch:tasks')" @change="batchIds = $event.target.checked ? visibleTasks.map(item => item.id) : []">任务</th>
            <th>关联报文</th>
            <th class="responsive-low">调度</th>
            <th>状态</th>
            <th class="align-right">操作</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="task in visibleTasks" :key="task.id" :class="{ selected: selected?.id === task.id }">
            <td>
              <input v-if="canManage" class="task-selection" type="checkbox" :aria-label="'选择任务 ' + task.name" :checked="batchIds.includes(task.id)" :disabled="isPending('batch:tasks')" @change="toggleBatch(task.id)">
              <button class="management-primary task-name-button" @click="openDetail(task)">{{ task.name }}</button>
            </td>
            <td class="related-message">{{ templates.find(item => item.id === task.messageId)?.name || '未关联报文' }}</td>
            <td class="responsive-low"><code class="schedule-value">{{ scheduleText(task) }}</code></td>
            <td>
              <StatusBadge :status="task.status"/>
            </td>
            <td class="align-right">
              <div class="table-actions">
                <button class="link-button" @click="openDetail(task)">详情</button>
                <button v-if="canManage" class="link-button" @click="openEdit(task)">修改</button>
                <button v-if="canManage && task.status === 'ENABLED'" class="link-button danger-text"
                        :disabled="isTaskPending(task)" @click="setTaskEnabled(task, false)">停用
                </button>
                <button v-else-if="canManage" class="link-button" :disabled="isTaskPending(task)" @click="setTaskEnabled(task, true)">启用</button>
                <button v-if="canManage" class="link-button danger-text" :disabled="isTaskPending(task)" @click="openDelete(task)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!visibleTasks.length">
            <td colspan="5" class="empty-state"><template v-if="tasks.length">没有匹配的任务。<br><button class="link-button empty-state-action" @click="keyword = ''; statusFilter = 'ALL'">清除筛选</button></template><template v-else>{{ canManage ? '还没有任务。' : '当前暂无可执行任务。' }}<br><button v-if="canManage" class="link-button empty-state-action" @click="openCreate">新建第一个任务</button></template></td>
          </tr>
          </tbody>
        </table>
      </div>
      <ListPagination v-model:page="page" v-model:page-size="pageSize" :total="filteredTasks.length" :total-pages="totalPages" />
    </section>

    <p v-if="routeId && !selected" class="notice negative">任务不存在或暂时无法读取。<button class="link-button" @click="setRoute('tasks')">返回任务列表</button></p>
    <AppModal v-if="canManage && (dialog === 'create' || dialog === 'edit')"
              :title="dialog === 'edit' ? `修改任务 · ${selected?.name}` : '新建任务'" @close="dialog = ''" :before-close="confirmFormClose">
      <p v-if="formDirty" class="muted" role="status">有未保存修改</p><p v-if="formError" role="alert" class="notice">{{ formError }}</p>
      <section class="message-query">
        <div class="query-heading">
          <div><h3>筛选报文</h3>
            <p>通过数据项与数据源快速缩小报文范围</p></div>
          <strong>{{ filteredTemplates.length }} 条结果</strong></div>
        <div class="query-fields"><label><span>数据项</span>
          <SearchInput v-model="dataItemFilter" aria-label="按数据项查询报文" placeholder="输入编码或中文名称" />
        </label><label><span>数据源</span>
          <SearchInput v-model="dataSourceFilter" aria-label="按数据源查询报文" placeholder="输入编码或中文名称" />
        </label></div>
      </section>
      <div class="form-grid"><label>任务名称<input v-model="form.name"
                                                   placeholder="输入任务名称"></label><label>报文<select
          v-model="form.messageId" :disabled="!messageOptions.length">
        <option value="" disabled>请选择报文模板</option>
        <option v-for="item in messageOptions" :key="item.id" :value="item.id">{{ item.name }} ·
          {{ bindingOf(item).dataItemName || bindingOf(item).dataItemCode || '未关联数据项' }} ·
          {{ bindingOf(item).sourceName || bindingOf(item).sourceCode || '未关联数据源' }}
        </option>
      </select><small class="field-help">匹配 {{ filteredTemplates.length }} 份报文，单次最多展示 50
        份</small></label><label>调度方式<select v-model="form.scheduleType" @change="onScheduleTypeChange">
        <option value="FIXED_RATE">固定间隔</option>
        <option value="CRON">Cron</option>
        <option value="MANUAL">手工执行</option>
      </select></label><label v-if="form.scheduleType === 'FIXED_RATE'">执行间隔（秒）<input
          v-model="form.schedule"></label></div>
      <section v-if="form.scheduleType === 'CRON'" class="cron-builder">
        <div class="cron-heading">
          <div class="cron-title"><span class="cron-icon">◷</span>
            <div><h3>Cron 执行时间</h3>
              <p>依次选择年月日时分秒，系统自动生成调度规则。</p></div>
          </div>
          <div class="cron-expression"><span>生成表达式</span><code>{{ form.schedule }}</code></div>
        </div>
        <div class="cron-grid"><label class="cron-unit"><span>年</span>
          <div class="cron-select"><b>{{ cron.year === '*' ? '每年' : `${cron.year} 年` }}</b><select
              v-model="cron.year" aria-label="年">
            <option value="*">每年</option>
            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }} 年</option>
          </select></div>
        </label><label class="cron-unit"><span>月</span>
          <div class="cron-select"><b>{{ optionLabel(monthOptions, cron.month) }}</b><select v-model="cron.month"
                                                                                             aria-label="月">
            <option v-for="item in monthOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select></div>
        </label><label class="cron-unit"><span>日</span>
          <div class="cron-select"><b>{{ optionLabel(dayOptions, cron.day) }}</b><select v-model="cron.day"
                                                                                         aria-label="日">
            <option v-for="item in dayOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select></div>
        </label><label class="cron-unit"><span>时</span>
          <div class="cron-select"><b>{{ optionLabel(hourOptions, cron.hour) }}</b><select v-model="cron.hour"
                                                                                           aria-label="时">
            <option v-for="item in hourOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select></div>
        </label><label class="cron-unit"><span>分</span>
          <div class="cron-select"><b>{{ optionLabel(minuteOptions, cron.minute) }}</b><select v-model="cron.minute"
                                                                                               aria-label="分">
            <option v-for="item in minuteOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select></div>
        </label><label class="cron-unit"><span>秒</span>
          <div class="cron-select"><b>{{ optionLabel(secondOptions, cron.second) }}</b><select v-model="cron.second"
                                                                                               aria-label="秒">
            <option v-for="item in secondOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select></div>
        </label></div>
        <div class="cron-summary"><span>执行规则</span><b>{{
            cronDescription
          }}</b><small>年份独立保存，六段表达式与当前调度引擎兼容</small></div>
      </section>
      <div class="notice subtle">MQ 实例、Producer Group 和 Topic 统一继承所选报文的默认投递目标，任务中不再重复配置。</div>
      <template #footer>
        <button class="button secondary" @click="confirmFormClose() && (dialog = '')">取消</button>
        <button class="button primary" :disabled="dialog === 'edit' ? isPending(`update:tasks:${selected?.id}`) : isPending('create:tasks')" @click="submit">{{ (dialog === 'edit' ? isPending(`update:tasks:${selected?.id}`) : isPending('create:tasks')) ? '正在提交…' : (dialog === 'edit' ? '保存修改' : '创建草稿') }}</button>
      </template>
    </AppModal>

    <AppDetailPage v-if="dialog === 'detail' && selected" title="任务详情" @close="dialog = ''; setRoute('tasks')">
      <p class="notice">自动调度：{{ selected.status === 'ENABLED' ? '已启用' : '未启用' }}。手工执行：{{ manualUnavailable || '可进入预检' }}。停用自动调度不影响历史补跑。</p>
      <div class="unified-detail task-detail">
        <DetailHeader eyebrow="模拟任务" :title="selected.name" :code="selected.id" description="任务继承关联报文的全部投递目标，并按当前调度规则触发执行。">
          <template #aside><StatusBadge :status="selected.status"/><button class="button secondary small" :disabled="isTaskPending(selected)" @click="setTaskEnabled(selected, selected.status !== 'ENABLED')">{{ selected.status === 'ENABLED' ? '停用' : '启用' }}</button></template>
        </DetailHeader>
        <DetailGrid :columns="3">
          <div><dt>关联报文</dt><dd>{{ selectedTemplate?.name || '未关联' }}</dd></div>
          <div><dt>调度方式</dt><dd>{{ selected.scheduleType === 'CRON' ? 'Cron 调度' : (selected.scheduleType === 'MANUAL' ? '手工执行' : '固定频率') }}</dd></div>
          <div><dt>调度规则</dt><dd><code class="detail-code">{{ scheduleText(selected) }}</code></dd></div>
          <div><dt>投递策略</dt><dd>继承关联报文配置</dd></div>
          <div><dt>累计执行</dt><dd>{{ executionOverviewLoading ? '读取中…' : `${executionOverview?.total || 0} 次` }}</dd></div>
          <div><dt>最近执行</dt><dd>{{ latestExecution ? formatDateTime(latestExecution.startedAt) : '尚未执行' }}</dd></div>
        </DetailGrid>
        <div v-if="executionOverviewLoading" class="detail-loading"><i></i><span>正在读取任务执行概览…</span></div>
        <div v-else-if="executionOverviewError" class="detail-error"><div><b>执行概览加载失败</b><p>{{ executionOverviewError }}</p></div><button class="button secondary small" @click="loadExecutionOverview()">重新加载</button></div>
        <template v-else>
          <div class="task-stat-strip">
            <div><span>成功</span><b>{{ executionOverview?.success || 0 }}</b></div>
            <div><span>部分成功</span><b>{{ executionOverview?.partialSuccess || 0 }}</b></div>
            <div><span>失败</span><b>{{ executionOverview?.failed || 0 }}</b></div>
          </div>
          <DetailSection title="最近执行" description="展示该任务最近五次真实执行结果" :count="selectedExecutions.length">
            <div v-if="selectedExecutions.length" class="recent-execution-list">
              <div v-for="item in selectedExecutions" :key="item.id"><code>{{ item.id }}</code><span>{{ formatDateTime(item.startedAt) }}</span><span>{{ item.actual }} 条投递</span><StatusBadge :status="item.status"/></div>
            </div>
            <div v-else class="detail-empty"><b>尚无执行记录</b><span>立即执行任务后，这里会显示最近的执行证据。</span></div>
          </DetailSection>
        </template>
      </div>
      <template #footer>
        <button v-if="canManage" class="button danger detail-danger-action" :disabled="isTaskPending(selected)" @click="openDelete(selected)">删除任务</button>
        <button class="button secondary" :disabled="!latestExecution || isPending(`load-messages:${latestExecution?.id}`)" @click="openMessages">{{ isPending(`load-messages:${latestExecution?.id}`) ? '正在加载…' : '查看最近执行报文' }}</button>
        <button v-if="canManage" class="button secondary" :disabled="isTaskPending(selected)" @click="openEdit(selected)">修改配置</button>
        <button :class="['button', canManage ? 'secondary' : 'primary']" :disabled="isPending(`run:${selected.id}`)" @click="openHistorical(selected)">历史补跑</button>
        <button v-if="canManage" class="button primary" :disabled="isPending(`run:${selected.id}`)" @click="openRun(selected)"><AppIcon name="play" :size="15" />立即执行</button>
      </template>
    </AppDetailPage>

    <AppModal v-if="dialog === 'run' && selected" :title="`${runForm.mode === 'MANUAL_SPECIFIED' ? '历史补跑' : '立即执行'} · ${selected.name}`" @close="dialog = 'detail'">
      <p v-if="runError" class="notice negative" role="alert">{{ runError }}</p>
      <div class="run-summary"><span>报文模板</span><b>{{ selectedTemplate?.name || '未关联' }}</b><span>执行范围</span><b>整个任务 · {{ currentTargets.length }} 个消息云目标</b></div>
      <p v-if="manualUnavailable" class="notice risk" role="alert">{{ manualUnavailable }}，本次不可执行。{{ canManage ? '请先检查关联模板和消息云组件。' : '请联系管理员检查配置。' }}</p>
      <details class="run-targets"><summary>查看消息云投递目标</summary><p v-for="target in currentTargets" :key="target.componentId + ':' + target.topic">{{ components.find(item => item.id === target.componentId)?.name || target.componentId }} · Group：{{ target.producerGroup }} · Topic：{{ target.topic }}</p></details>
      <p class="muted">使用当前报文配置执行，不修改原调度规则。{{ timePreview?.timeZone ? '业务时区：' + timePreview.timeZone : '服务端未提供业务时区，请核对部署配置。' }}</p>
      <section class="manual-run-panel">
        <h3 class="run-step-title">1 · 选择执行时间</h3><div v-if="canManage" class="run-mode-grid">
          <label v-if="canManage" class="run-mode-card" :class="{ active: runForm.mode === 'MANUAL_CURRENT' }">
            <input v-model="runForm.mode" class="run-mode-input" type="radio" value="MANUAL_CURRENT" @change="timePreview = null; previewRunTime()">
            <i class="run-mode-radio" aria-hidden="true"></i>
            <span class="run-mode-copy"><b>按当前时间执行</b><small>使用当前计划触发时间，并按数据项配置自动对齐业务时间。</small></span>
          </label>
          <label class="run-mode-card" :class="{ active: runForm.mode === 'MANUAL_SPECIFIED' }">
            <input v-model="runForm.mode" class="run-mode-input" type="radio" value="MANUAL_SPECIFIED" @change="useYesterday()">
            <i class="run-mode-radio" aria-hidden="true"></i>
            <span class="run-mode-copy"><b>指定时间执行</b><small>用于补发昨天或历史时刻的报文，不改变任务原调度配置。</small></span>
          </label>
        </div>
        <section v-if="runForm.mode === 'MANUAL_SPECIFIED'" class="specified-time-panel">
          <div class="specified-time-heading">
            <div><b>计划触发时间</b><small>本次执行将以该时刻作为调度输入，不修改任务原有调度规则。</small></div>
            <button class="button secondary small" type="button" @click="useYesterday">填入昨天同一时刻</button>
          </div>
          <label class="specified-time-control">
            <span class="sr-only">计划触发时间</span>
            <input v-model="runForm.plannedTriggerTime" type="datetime-local" step="1" @change="timePreview = null">
          </label>
        </section>
        <div class="preview-heading"><div><h3>2 · 核对业务时间</h3><p>预览结果与实际执行使用同一套后端规划逻辑。</p></div>
          <button class="button secondary small" :disabled="isPending(`preview-time:${selected.id}`)" @click="previewRunTime">{{ isPending(`preview-time:${selected.id}`) ? '正在计算…' : (timePreview ? '重新计算' : '计算时间') }}</button></div>
        <div v-if="timePreview" class="time-preview-grid">
          <div><span>数据类型</span><b>{{ timePreview.dataType === 'REALTIME' ? '实况' : (timePreview.dataType === 'FORECAST' ? '预报' : '未识别') }}</b></div>
          <div><span>计划触发时间</span><b>{{ formatDateTime(timePreview.plannedTriggerAt) }}</b></div>
          <div><span>业务基准时间</span><b>{{ formatDateTime(timePreview.businessBaseAt) }}</b></div>
          <div><span>预报结束时间</span><b>{{ timePreview.periodEndAt ? formatDateTime(timePreview.periodEndAt) : '不适用' }}</b></div>
          <div><span>数据间隔</span><b>{{ timePreview.periodIntervalMinutes ? `${timePreview.periodIntervalMinutes} 分钟` : '未配置' }}</b></div>
          <div><span>预报时长</span><b>{{ timePreview.periodHours ? `${timePreview.periodHours} 小时` : '不适用' }}</b></div>
        </div>
        <div v-else class="preview-empty">选择执行时间后点击“计算时间”，确认报文最终使用的时间范围。</div>
      </section>
      <template #footer>
        <span class="run-footer-hint">3 · 确认后将向上述目标发送报文</span><button class="button secondary" :disabled="isPending(`run:${selected.id}`)" @click="dialog = 'detail'">取消</button>
        <button class="button primary" :disabled="isPending(`run:${selected.id}`) || Boolean(manualUnavailable) || !timePreview || (runForm.mode === 'MANUAL_SPECIFIED' && !runForm.plannedTriggerTime)" :aria-busy="isPending(`run:${selected.id}`)" @click="confirmRun">{{ isPending(`run:${selected.id}`) ? '正在执行…' : (runForm.mode === 'MANUAL_SPECIFIED' ? '确认补跑' : '确认执行') }}</button>
      </template>
    </AppModal>

    <AppModal v-if="canManage && dialog === 'delete' && selected" title="删除任务" @close="dialog = ''">
      <div class="delete-confirm"><strong>{{ selected.name }}</strong>
        <p>删除后任务配置无法恢复，系统不会再按照该任务的调度规则执行。</p>
        <div class="notice">历史 Execution 和执行报文仍会保留，可继续在执行记录中查询。</div>
      </div>
      <template #footer>
        <button class="button secondary" @click="dialog = ''">取消</button>
        <button class="button danger" :disabled="isPending(`remove:tasks:${selected.id}`)" @click="confirmDelete">{{ isPending(`remove:tasks:${selected.id}`) ? '正在删除…' : '确认删除' }}</button>
      </template>
    </AppModal>

    <AppModal v-if="dialog === 'messages' && selected" :title="`执行报文 · ${latestExecution?.id}`" wide
              @close="dialog = ''">
      <div v-if="selectedTemplate?.type === 'FILE'" class="notice">文件类报文只发送文件地址及元数据；文件本体保存在
        报文配置所选的 OSS 或 OBS 对象存储。
      </div>
      <div class="filter-row">
        <button v-for="item in [['ALL','全部'],['SUCCESS','成功'],['FAILED','失败']]" :key="item[0]"
                class="button secondary small" :class="{ active: messageFilter === item[0] }"
                @click="messageFilter = item[0]">{{ item[1] }}
        </button>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
          <tr>
            <th>Simulation Message ID</th>
            <th>生成时间</th>
            <th>投递状态</th>
            <th>投递目标</th>
            <th>报文</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="item in messages" :key="item.recordId">
            <td><b>{{ item.id }}</b></td>
            <td>{{ formatDateTime(item.generatedAt) }}</td>
            <td>
              <StatusBadge :status="item.status"/>
            </td>
            <td>{{ item.target }}</td>
            <td>
              <details>
                <summary>查看</summary>
                <pre class="code-block">{{ item.payload }}</pre>
              </details>
            </td>
          </tr>
          <tr v-if="!messages.length">
            <td colspan="5" class="empty-state">该 Execution 暂无报文记录。</td>
          </tr>
          </tbody>
        </table>
      </div>
    </AppModal>
  </main>
</template>

<style scoped>
.run-summary { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; padding: 16px; background: #fafafa; border-radius: 6px; font-size: 14px; }.run-summary span, .run-footer-hint { color: #595959; }.run-targets { margin: 14px 0; font-size: 14px; overflow-wrap: anywhere; }.run-targets summary { cursor: pointer; color: #1677ff; }.run-step-title { font-size: 16px; }.run-footer-hint { font-size: 13px; margin-right: auto; }

.task-batch-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #f0f0f0; color: #595959; font-size: 14px; }

.task-list-card { padding: 0; overflow: hidden; }
.task-list-card > .card-heading { margin: 0; padding: 18px 20px; border-bottom: 1px solid #ebeef5; }
.task-list-card .data-table th:first-child, .task-list-card .data-table td:first-child { padding-left: 20px; }
.task-list-card .data-table th:last-child, .task-list-card .data-table td:last-child { padding-right: 20px; }
.task-table .task-name-button { max-width: 100%; padding: 2px 0; overflow: hidden; border: 0; background: transparent; color: var(--management-link); font-size: 16px; font-weight: 650; line-height: 1.5; text-align: left; text-overflow: ellipsis; white-space: nowrap; transition: color .16s; }
.task-table .task-name-button:hover { color: #173f9e; }
.task-table .related-message { color: #4f6178; font-size: 15px; font-weight: 450; }
body .page .task-table code.schedule-value { color: #52647c; font-size: 14px; font-weight: 550; letter-spacing: 0; }
.unified-detail { display: grid; gap: 16px; }
.detail-code { color: #38516e; font: 600 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
.detail-loading, .detail-error { display: flex; min-height: 78px; align-items: center; justify-content: center; gap: 12px; padding: 16px 18px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; color: #595959; font-size: 15px; }
.detail-loading i { width: 17px; height: 17px; border: 2px solid #d9d9d9; border-top-color: #1677ff; border-radius: 50%; animation: detail-spin .8s linear infinite; }
.detail-error { justify-content: space-between; border-color: #f0ccd0; background: #fff8f8; }.detail-error b { color: #a8414c; font-size: 15px; }.detail-error p { margin: 3px 0 0; color: #8d5a61; font-size: 13px; }
.task-stat-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; border: 1px solid #f0f0f0; border-radius: 8px; background: #fafafa; }
.task-stat-strip > div { padding: 14px 18px; border-right: 1px solid #e3eaf4; }.task-stat-strip > div:last-child { border-right: 0; }.task-stat-strip span { color: #718198; font-size: 13px; }.task-stat-strip b { display: block; margin-top: 4px; color: #263d59; font-size: 22px; }
.recent-execution-list { display: grid; }.recent-execution-list > div { display: grid; grid-template-columns: minmax(150px, 1.3fr) minmax(145px, 1fr) 100px auto; align-items: center; gap: 16px; padding: 12px 2px; border-bottom: 1px solid #edf1f5; }.recent-execution-list > div:last-child { border-bottom: 0; }.recent-execution-list code { color: #334c69; font: 600 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }.recent-execution-list span { color: #60728a; font-size: 14px; }
.detail-empty { display: grid; justify-items: center; gap: 4px; padding: 22px; color: #7e8ca0; text-align: center; }.detail-empty b { color: #42566f; font-size: 15px; }.detail-empty span { font-size: 13px; }
.detail-danger-action { margin-right: auto; }
@keyframes detail-spin { to { transform: rotate(360deg); } }

.delete-confirm > strong {
  display: block;
  color: #303133;
  font-size: 16px;
}

.delete-confirm > p {
  margin: 10px 0 16px;
  color: #606266;
  line-height: 1.7;
}

.manual-run-panel { display: grid; gap: 16px; }
.run-mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.run-mode-card { position: relative; display: flex; min-width: 0; min-height: 104px; align-items: flex-start; gap: 12px; padding: 16px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer; transition: border-color .18s, background .18s, box-shadow .18s; }
.run-mode-card:hover { border-color: #a0cfff; }
.run-mode-card.active { border-color: #1677ff; background: #e6f4ff; box-shadow: 0 0 0 3px rgba(22, 119, 255, .08); }
.run-mode-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.run-mode-radio { position: relative; flex: 0 0 16px; width: 16px; height: 16px; margin-top: 2px; border: 1px solid #c0c4cc; border-radius: 50%; background: #fff; transition: border-color .18s; }
.run-mode-card.active .run-mode-radio { border: 5px solid #1677ff; }
.run-mode-card:focus-within { box-shadow: 0 0 0 3px rgba(64, 158, 255, .12); }
.run-mode-copy { display: grid; min-width: 0; gap: 6px; }
.run-mode-copy b { color: #303133; font-size: 14px; font-weight: 600; }
.run-mode-copy small { color: #7f8a9c; font-size: 12px; font-weight: 400; line-height: 1.6; }
.specified-time-panel { display: grid; gap: 13px; padding: 15px 16px 16px; border: 1px solid #dfe5ee; border-radius: 4px; background: #fafcff; }
.specified-time-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.specified-time-heading > div { display: grid; gap: 3px; }
.specified-time-heading b { color: #303133; font-size: 13px; font-weight: 600; }
.specified-time-heading small { color: #909399; font-size: 11px; font-weight: 400; line-height: 1.5; }
.specified-time-control { display: block; }
.specified-time-control input { display: block; width: 100%; height: 40px; padding: 0 11px; border: 1px solid #dcdfe6; border-radius: 4px; outline: none; background: #fff; color: #303133; font-size: 13px; transition: border-color .18s, box-shadow .18s; }
.specified-time-control input:hover { border-color: #c0c4cc; }
.specified-time-control input:focus { border-color: #1677ff; box-shadow: 0 0 0 3px rgba(22, 119, 255, .1); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 4px; border-top: 1px solid #edf0f5; }
.preview-heading h3, .preview-heading p { margin: 0; }
.preview-heading h3 { font-size: 15px; }
.preview-heading p { margin-top: 4px; color: #909399; font-size: 12px; }
.time-preview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; border: 1px solid #e1e7ef; border-radius: 4px; background: #fafcff; }
.time-preview-grid > div { min-height: 68px; padding: 13px 15px; border-right: 1px solid #e8edf4; border-bottom: 1px solid #e8edf4; }
.time-preview-grid > div:nth-child(3n) { border-right: 0; }
.time-preview-grid > div:nth-last-child(-n+3) { border-bottom: 0; }
.time-preview-grid span, .time-preview-grid b { display: block; }
.time-preview-grid span { margin-bottom: 7px; color: #8792a5; font-size: 12px; }
.time-preview-grid b { color: #303847; font-size: 13px; overflow-wrap: anywhere; }
.preview-empty { padding: 24px; border: 1px dashed #d8dee8; border-radius: 4px; color: #9099a8; text-align: center; background: #fafbfc; }

.message-query {
  margin-bottom: 20px;
  overflow: hidden;
  border: 1px solid #d9e2ef;
  border-radius: 4px;
  background: #fff;
}

.query-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 15px;
  border-bottom: 1px solid #e8edf4;
  background: #fafafa;
}

.query-heading h3, .query-heading p {
  margin: 0;
}

.query-heading h3 {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.query-heading p {
  margin-top: 3px;
  color: #909399;
  font-size: 11px;
}

.query-heading strong {
  padding: 4px 8px;
  border-radius: 4px;
  background: #ecf5ff;
  color: #337ecc;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.query-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 14px 15px 16px;
}

.query-fields label {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.query-fields label > span {
  color: #606266;
  font-size: 12px;
  font-weight: 500;
}

.field-help {
  display: block;
  margin-top: 6px;
  color: #909399;
  font-weight: 400;
}

.cron-builder {
  margin-top: 20px;
  padding: 0;
  overflow: hidden;
  border: 1px solid #d9e2ef;
  border-radius: 4px;
  background: #fff;
}

.cron-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 20px;
  border-bottom: 1px solid #e8edf4;
  background: #fafafa;
}

.cron-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cron-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 4px;
  background: #ecf5ff;
  color: #1677ff;
  font-size: 22px;
}

.cron-heading h3, .cron-heading p {
  margin: 0;
}

.cron-heading h3 {
  color: #303133;
  font-size: 16px;
}

.cron-heading p {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}

.cron-expression {
  display: grid;
  justify-items: end;
  gap: 4px;
}

.cron-expression span {
  color: #909399;
  font-size: 11px;
}

.cron-expression code {
  padding: 7px 11px;
  border: 1px solid #d9ecff;
  border-radius: 4px;
  background: #ecf5ff;
  color: #337ecc;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.cron-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 18px 20px 14px;
}

.cron-unit {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #fafbfc;
  color: #606266;
  font-size: 13px;
  font-weight: 500;
  transition: border-color .2s, box-shadow .2s, background .2s;
}

.cron-unit:hover, .cron-unit:focus-within {
  border-color: #a0cfff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, .08);
}

.cron-unit > span {
  display: flex;
  align-items: center;
  min-height: 18px;
}

.cron-select {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 38px;
  align-items: center;
  padding: 0 34px 0 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
}

.cron-select::after {
  position: absolute;
  top: 50%;
  right: 13px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid #606266;
  border-bottom: 1.5px solid #606266;
  content: '';
  pointer-events: none;
  transform: translateY(-70%) rotate(45deg);
}

.cron-select b {
  display: block;
  overflow: hidden;
  color: #303133;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cron-select select {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  opacity: 0;
}

.cron-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
  row-gap: 6px;
  margin: 0 20px 18px;
  padding: 11px 12px;
  border-radius: 4px;
  background: #f5f7fa;
}

.cron-summary span {
  padding: 3px 7px;
  border-radius: 4px;
  background: #e6f4ff;
  color: #337ecc;
  font-size: 11px;
}

.cron-summary b {
  color: #606266;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.cron-summary small {
  grid-column: 2;
  color: #a8abb2;
  font-size: 11px;
  line-height: 1.5;
}

@media (max-width: 760px) {
  .task-stat-strip { grid-template-columns: 1fr; }.task-stat-strip > div { border-right: 0; border-bottom: 1px solid #e3eaf4; }.recent-execution-list > div { grid-template-columns: 1fr; gap: 5px; }
  .query-fields {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .run-mode-grid { grid-template-columns: 1fr; }
  .time-preview-grid { grid-template-columns: 1fr; }
  .time-preview-grid > div { border-right: 0; border-bottom: 1px solid #e8edf4; }
  .time-preview-grid > div:nth-last-child(-n+3) { border-bottom: 1px solid #e8edf4; }
  .time-preview-grid > div:last-child { border-bottom: 0; }
  .specified-time-heading { align-items: stretch; flex-direction: column; }
  .specified-time-heading .button { width: 100%; }

  .cron-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .cron-expression {
    justify-items: start;
  }

  .cron-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cron-summary {
    grid-template-columns: 1fr;
  }

  .cron-summary small {
    grid-column: 1;
  }
}
</style>
