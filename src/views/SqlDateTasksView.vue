<script setup>
import {computed, nextTick, onMounted, onUnmounted, reactive, ref, watch} from 'vue'
import * as api from '../api'
import {createRequestId} from '../request-id.mjs'
import {formatDateTime} from '../date-time.mjs'
import {describeSqlDateFailure} from '../sql-date-execution.mjs'
import {validateTargetRange} from '../sql-date-targets.mjs'
import {formatSqlScheduleInstant, normalizeSqlDateSchedule} from '../sql-date-schedule.mjs'
import {setRoute} from '../page-route.mjs'
import AppModal from '../components/AppModal.vue'

const props = defineProps({
  canManage: {type: Boolean, default: false},
  routeId: {type: String, default: ''},
  routeEdit: {type: Boolean, default: false}
})
const emit = defineEmits(['editing-state'])
const tasks = ref([])
const selectedId = ref('')
const columns = ref([])
const primaryKey = ref([])
const executions = ref([])
const displayExecutions = computed(() => executions.value.map(run => ({
  ...run, failure: describeSqlDateFailure(run.error_message, run.target_start_date, run.target_end_date)
})))
const preview = ref(null)
const manualDialog = ref(false)
const loading = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref('')
const messageScope = ref('page')
const errorScope = ref('page')
const targetStartDate = ref('')
const targetEndDate = ref('')
const suppressDirty = ref(false)
const formDirty = ref(false)
const pendingScheduleEnableId = ref('')
let schedulePreviewTimer = null
let schedulePreviewVersion = 0
const schedulePlans = ref([])
const scheduleError = ref('')
const cron = reactive({year: '*', month: '*', day: '*', hour: '8', minute: '0', second: '0', weekday: '?'})
const currentYear = new Date().getFullYear()
const yearOptions = Array.from({length: 11}, (_, index) => String(currentYear + index))
const numericOptions = (max, unit, intervals = []) => [
  {value: '*', label: `每${unit}`},
  ...intervals.map(value => ({value: `*/${value}`, label: `每 ${value} ${unit}`})),
  ...Array.from({length: max + 1}, (_, value) => ({value: String(value), label: `${value}`}))
]
const monthOptions = [{value: '*', label: '每月'}, ...Array.from({length: 12}, (_, index) => ({value: String(index + 1), label: `${index + 1} 月`}))]
const dayOptions = [{value: '*', label: '每日'}, ...Array.from({length: 31}, (_, index) => ({value: String(index + 1), label: `${index + 1} 日`}))]
const hourOptions = numericOptions(23, '小时', [2, 3, 4, 6, 12])
const minuteOptions = numericOptions(59, '分钟', [5, 10, 15, 20, 30])
const secondOptions = numericOptions(59, '秒', [5, 10, 15, 30])
const optionLabel = (options, value) => options.find(item => item.value === value)?.label || String(value)
const form = reactive({
  name: '', schemaName: 'msc_base', tableName: '', sampleDate: '', sampleSql: '',
  timeColumns: [], uuidColumns: [], nowColumns: [],
  schedule: normalizeSqlDateSchedule()
})
function taskSchedule(task) {
  try { return normalizeSqlDateSchedule(task?.data?.schedule) } catch { return normalizeSqlDateSchedule() }
}
function taskNextPlan(task) { return task?.nextSchedule || null }
function scheduleText(schedule) {
  if (!schedule.enabled) return '仅手工'
  return schedule.type === 'CRON'
    ? `${schedule.year === '*' ? '' : `${schedule.year} 年 · `}${schedule.expression}`
    : `每 ${schedule.intervalSeconds} 秒`
}
function windowText(schedule) {
  const window = schedule.autoExecutionWindow
  return window.type === 'DATE_RANGE' ? `${window.startDate} 至 ${window.endDate}` : '长期有效'
}
function relativeDayText(offset) {
  if (offset === 0) return '触发当天'
  return offset < 0 ? `触发日前 ${Math.abs(offset)} 天` : `触发日后 ${offset} 天`
}
function offsetDirection(value) { return value < 0 ? 'BEFORE' : value > 0 ? 'AFTER' : 'TODAY' }
function setOffsetDirection(field, direction) {
  if (direction === 'TODAY') form.schedule[field] = 0
  else form.schedule[field] = (direction === 'BEFORE' ? -1 : 1) * Math.max(1, Math.abs(form.schedule[field]) || 1)
}
function setOffsetDistance(field, event) {
  const distance = Number(event.target.value)
  if (!Number.isInteger(distance) || distance < 1 || distance > 365) {
    event.target.value = Math.abs(form.schedule[field])
    return
  }
  form.schedule[field] = offsetDirection(form.schedule[field]) === 'AFTER' ? distance : -distance
}
function loadCronExpression() {
  const parts = String(form.schedule.expression || '').trim().split(/\s+/)
  if (parts.length !== 6) return
  Object.assign(cron, {second: parts[0], minute: parts[1], hour: parts[2], day: parts[3],
    month: parts[4], weekday: parts[5], year: form.schedule.year || '*'})
}
function syncCronExpression() {
  form.schedule.expression = `${cron.second} ${cron.minute} ${cron.hour} ${cron.day} ${cron.month} ${cron.weekday}`
  form.schedule.year = cron.year
}
function onScheduleTypeChange() {
  if (form.schedule.type === 'CRON') loadCronExpression()
}
async function refreshSchedulePreview() {
  const version = ++schedulePreviewVersion
  schedulePlans.value = []
  scheduleError.value = ''
  if (!form.schedule.enabled) return
  try {
    const schedule = normalizeSqlDateSchedule(form.schedule)
    const result = await api.previewSqlDateSchedule({schedule})
    if (version === schedulePreviewVersion) schedulePlans.value = result.plans || []
  } catch (cause) { if (version === schedulePreviewVersion) scheduleError.value = cause.message || String(cause) }
}
const selected = computed(() => tasks.value.find(task => task.id === selectedId.value))
const isList = computed(() => !props.routeId)
const isNew = computed(() => props.routeId === 'new')
const isForm = computed(() => props.canManage && (isNew.value || props.routeEdit))
const isDetail = computed(() => !isList.value && !isNew.value && !isForm.value)
const dateColumns = computed(() => columns.value.filter(column => ['date', 'timestamp without time zone', 'timestamp with time zone'].includes(column.data_type)))

function clearFeedback() { message.value = ''; error.value = ''; messageScope.value = 'page'; errorScope.value = 'page' }
async function showActionError(cause, scope) {
  error.value = cause.message || String(cause)
  errorScope.value = scope
  await nextTick()
  const notice = document.querySelector(`[data-sql-error="${scope}"]`)
  notice?.scrollIntoView({block: 'nearest'})
  notice?.focus({preventScroll: true})
}
function showActionMessage(text, scope) { message.value = text; messageScope.value = scope }
function reset() {
  manualDialog.value = false
  pendingScheduleEnableId.value = ''
  suppressDirty.value = true
  formDirty.value = false
  selectedId.value = ''
  Object.assign(form, {name: '', schemaName: 'msc_base', tableName: '', sampleDate: '', sampleSql: '',
    timeColumns: [], uuidColumns: [], nowColumns: [],
    schedule: normalizeSqlDateSchedule()})
  loadCronExpression()
  schedulePlans.value = []; scheduleError.value = ''
  targetStartDate.value = ''; targetEndDate.value = ''
  columns.value = []; primaryKey.value = []; executions.value = []; preview.value = null
  nextTick(() => { suppressDirty.value = false; emit('editing-state', false) })
  clearFeedback()
}

async function load() {
  loading.value = true
  clearFeedback()
  try {
    tasks.value = await api.listSqlDateTasks()
    if (props.routeId && props.routeId !== 'new') {
      const task = tasks.value.find(item => item.id === props.routeId)
      if (task) await select(task)
      else error.value = '任务不存在或已被删除'
    }
  }
  catch (cause) { error.value = cause.message; errorScope.value = 'page'; return false }
  finally { loading.value = false }
  return true
}

async function select(task) {
  manualDialog.value = false
  suppressDirty.value = true
  formDirty.value = false
  clearFeedback()
  selectedId.value = task.id
  const data = task.data || {}
  Object.assign(form, {
    name: task.name, schemaName: data.schemaName || 'msc_base', tableName: data.tableName || '',
    sampleDate: data.sampleDate || '', sampleSql: data.sampleSql || '', timeColumns: [...(data.timeColumns || [])],
    uuidColumns: [...(data.uuidColumns || [])], nowColumns: [...(data.nowColumns || [])],
    schedule: normalizeSqlDateSchedule(data.schedule)
  })
  loadCronExpression()
  targetStartDate.value = ''; targetEndDate.value = ''
  preview.value = null
  await nextTick()
  suppressDirty.value = false
  emit('editing-state', false)
  await Promise.all([inspect(false), loadExecutions()])
  await refreshSchedulePreview()
  if (pendingScheduleEnableId.value === task.id && isForm.value) {
    pendingScheduleEnableId.value = ''
    form.schedule.enabled = true
    formDirty.value = true
    emit('editing-state', true)
    showActionMessage('请确认自动调度规则和目标日期范围，保存后正式启用。', 'save')
    await nextTick()
    document.querySelector('.sql-schedule')?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }
}

function openList() { pendingScheduleEnableId.value = ''; setRoute('sql-date-tasks') }
function openNew() { pendingScheduleEnableId.value = ''; setRoute('sql-date-tasks', 'new') }
function openDetail(id) { pendingScheduleEnableId.value = ''; setRoute('sql-date-tasks', id) }
function openEdit(id, enableAfterReview = false) {
  pendingScheduleEnableId.value = enableAfterReview ? id : ''
  setRoute('sql-date-tasks', id, true)
}
async function openManual() {
  if (!selectedId.value) return
  clearFeedback()
  preview.value = null
  manualDialog.value = true
}

watch(() => [props.routeId, props.routeEdit], async ([id]) => {
  if (!id || id === 'new') { reset(); return }
  const task = tasks.value.find(item => item.id === id)
  if (task) await select(task)
  else if (!loading.value) error.value = '任务不存在或已被删除'
})

async function inspect(suggest = true) {
  if (!form.schemaName.trim() || !form.tableName.trim()) {
    await showActionError(new Error('请先填写 Schema 和目标表，再读取表结构'), suggest ? 'inspect' : 'page')
    return
  }
  clearFeedback()
  try {
    const result = await api.getSqlDateTableColumns(form.schemaName.trim(), form.tableName.trim())
    columns.value = result.columns || []
    primaryKey.value = result.primaryKey || []
    if (suggest) {
      if (!form.timeColumns.length && dateColumns.value.some(column => column.column_name === 'data_time')) form.timeColumns = ['data_time']
      if (!form.uuidColumns.length && columns.value.some(column => column.column_name === 'id')) form.uuidColumns = ['id']
      if (!form.nowColumns.length) form.nowColumns = ['create_time', 'last_update_time'].filter(name => dateColumns.value.some(column => column.column_name === name))
      if (!form.sampleSql) form.sampleSql = `SELECT * FROM ${form.schemaName}.${form.tableName}\nWHERE data_time >= :sampleStart AND data_time < :sampleEnd`
    }
    if (suggest) showActionMessage(`已读取 ${columns.value.length} 列；主键：${primaryKey.value.join('、')}`, 'inspect')
  } catch (cause) { await showActionError(cause, suggest ? 'inspect' : 'page') }
}

function payload() {
  return {name: form.name.trim(), data: {
    schemaName: form.schemaName.trim(), tableName: form.tableName.trim(), sampleDate: form.sampleDate,
    sampleSql: form.sampleSql.trim(), timeColumns: [...form.timeColumns], uuidColumns: [...form.uuidColumns],
    nowColumns: [...form.nowColumns], schedule: normalizeSqlDateSchedule(form.schedule)
  }}
}

async function save() {
  if (!props.canManage || busy.value) return
  clearFeedback(); busy.value = true
  try {
    const wasNew = !selectedId.value
    const result = selectedId.value
      ? await api.updateSqlDateTask(selectedId.value, payload())
      : await api.createSqlDateTask(payload())
    emit('editing-state', false)
    suppressDirty.value = true
    const refreshed = await load()
    if (!refreshed || !tasks.value.some(task => task.id === result.id)) {
      await showActionError(new Error('任务已保存，但配置暂时无法读取。请返回列表刷新后继续预览，勿重复创建。'), 'save')
      return
    }
    formDirty.value = false
    setRoute('sql-date-tasks', result.id, true, wasNew)
    await nextTick()
    showActionMessage(wasNew ? '任务已创建' : '修改已保存', 'save')
  } catch (cause) { await showActionError(cause, 'save') }
  finally { busy.value = false }
}

function executionRequest() {
  validateTargetRange(targetStartDate.value, targetEndDate.value)
  return {startDate: targetStartDate.value, endDate: targetEndDate.value}
}

async function makePreview() {
  if (!selectedId.value || busy.value) return
  if (isForm.value && formDirty.value) {
    await showActionError(new Error('配置已修改，请先保存任务，再预览本次生成结果'), 'preview')
    return
  }
  clearFeedback(); busy.value = true
  try { preview.value = await api.previewSqlDateTask(selectedId.value, executionRequest()) }
  catch (cause) { await showActionError(cause, 'preview') }
  finally { busy.value = false }
}

async function execute() {
  if (!selectedId.value || busy.value) return
  if (isForm.value && formDirty.value) {
    await showActionError(new Error('配置已修改，请先保存任务，再确认写入'), 'preview')
    return
  }
  clearFeedback(); busy.value = true
  try {
    const request = executionRequest()
    const currentPreview = preview.value || await api.previewSqlDateTask(selectedId.value, request)
    preview.value = currentPreview
    if (!window.confirm(`确认补充 ${request.startDate} 至 ${request.endDate} 的数据？预计新增 ${currentPreview.expectedInserted} 行，已有主键跳过 ${currentPreview.expectedSkipped} 行。`)) return
    const result = await api.executeSqlDateTask(selectedId.value, {...request, requestId: createRequestId()})
    manualDialog.value = false
    showActionMessage(`执行完成：新增 ${result.insertedCount} 行，跳过 ${result.skippedCount} 行。`, 'preview')
    preview.value = null
    await loadExecutions()
  } catch (cause) { await showActionError(cause, 'preview'); await loadExecutions() }
  finally { busy.value = false }
}

async function loadExecutions() {
  if (!selectedId.value) return
  try { executions.value = await api.listSqlDateExecutions(selectedId.value) }
  catch (cause) { await showActionError(cause, 'executions') }
}

async function remove(task) {
  if (!props.canManage || busy.value || !window.confirm(`确认删除任务“${task.name}”？仅未执行过的任务可以删除，业务表数据不会删除。`)) return
  busy.value = true; clearFeedback()
  try { await api.deleteSqlDateTask(task.id); await load(); showActionMessage('任务已删除', 'page') }
  catch (cause) { await showActionError(cause, 'page') }
  finally { busy.value = false }
}

async function toggleSchedule(task) {
  if (!props.canManage || busy.value) return
  if (!task.data?.schedule || typeof task.data.schedule !== 'object') {
    openEdit(task.id, true)
    return
  }
  const current = taskSchedule(task)
  if (!current.enabled && !window.confirm(`确认启用“${task.name}”的自动调度？请先确保目标日期对应的业务表分区已建立。`)) return
  busy.value = true; clearFeedback()
  try {
    await api.updateSqlDateTask(task.id, {
      name: task.name,
      data: {...task.data, schedule: {...current, enabled: !current.enabled}}
    })
    await load()
    showActionMessage(current.enabled ? '已停用定时执行，手工补数仍可使用' : '已启用定时执行', 'page')
  } catch (cause) { await showActionError(cause, 'page') }
  finally { busy.value = false }
}

watch(form, () => { if (!suppressDirty.value && isForm.value) { formDirty.value = true; preview.value = null; emit('editing-state', true) } }, {deep: true})
watch(cron, syncCronExpression, {deep: true})
watch(() => form.schedule, () => {
  if (schedulePreviewTimer !== null) window.clearTimeout(schedulePreviewTimer)
  schedulePreviewTimer = window.setTimeout(refreshSchedulePreview, 300)
}, {deep: true})
watch([targetStartDate, targetEndDate], () => { preview.value = null })
onMounted(() => {
  load()
})
onUnmounted(() => {
  if (schedulePreviewTimer !== null) window.clearTimeout(schedulePreviewTimer)
})
</script>

<template>
  <main class="page sql-page">
    <header class="page-heading sql-heading"><div><h1>{{ isList ? '数据生成' : isNew ? '新建数据生成任务' : isForm ? '编辑数据生成任务' : '数据生成任务详情' }}</h1>
      <p>从固定样例日读取数据，按目标日期生成新记录并写回原表。</p></div>
      <button v-if="isList && canManage" class="button primary" @click="openNew">新建任务</button>
      <button v-else-if="isDetail" class="button secondary" @click="openList">返回列表</button></header>
    <div v-if="error && errorScope === 'page'" class="sql-notice error" role="alert">{{ error }}</div>
    <div v-if="message && messageScope === 'page'" class="sql-notice" role="status">{{ message }}</div>
    <section v-if="isList" class="card sql-card sql-list-page">
      <div class="card-heading sql-section-title"><h2>任务列表</h2><span class="sql-count">共 {{ tasks.length }} 项</span></div>
      <p v-if="loading" class="sql-help">正在读取任务…</p>
      <p v-else-if="!tasks.length" class="sql-empty">暂无数据生成任务。{{ canManage ? '点击右上角新建任务。' : '' }}</p>
      <div v-else class="table-scroll sql-table-wrap"><table class="data-table management-table sql-table"><thead><tr><th>任务名称</th><th>目标表与样例日期</th><th>调度</th><th>状态</th><th class="operation-cell">操作</th></tr></thead>
        <tbody><tr v-for="task in tasks" :key="task.id">
          <td><button class="management-primary" @click="openDetail(task.id)">{{ task.name }}</button></td>
          <td><span class="sql-table-target">{{ task.data?.schemaName }}.{{ task.data?.tableName }}</span><small>样例 {{ task.data?.sampleDate || '未设置' }}</small></td>
          <td><code class="schedule-value">{{ scheduleText(taskSchedule(task)) }}</code><small v-if="taskSchedule(task).enabled">{{ windowText(taskSchedule(task)) }} · 下次 {{ formatSqlScheduleInstant(taskNextPlan(task)?.plannedAt) }}</small><small v-else>执行时指定日期范围</small></td>
          <td><span :class="['sql-schedule-state', taskSchedule(task).enabled ? 'enabled' : 'disabled']">{{ taskSchedule(task).enabled ? '已启用' : '已停用' }}</span></td>
          <td class="operation-cell"><div class="table-actions"><button class="link-button" @click="openDetail(task.id)">详情</button><button v-if="canManage" class="link-button" @click="openEdit(task.id)">修改</button><button v-if="canManage" class="link-button" :disabled="busy" @click="toggleSchedule(task)">{{ taskSchedule(task).enabled ? '停用' : '启用' }}</button><button v-if="canManage" class="link-button sql-delete" :disabled="busy" @click="remove(task)">删除</button></div></td>
        </tr></tbody></table></div>
    </section>
    <div v-else-if="(isNew && canManage) || selected" class="sql-main">
      <section v-if="isDetail" class="card sql-card"><div class="card-heading sql-section-title"><h2>{{ selected?.name }}</h2><button v-if="canManage" class="button secondary small" @click="openEdit(selectedId)">编辑任务</button></div>
        <div class="sql-summary"><div><span>目标表</span><strong>{{ form.schemaName }}.{{ form.tableName }}</strong></div><div><span>样例日期</span><strong>{{ form.sampleDate }}</strong></div>
          <div><span>状态</span><strong>{{ form.schedule.enabled ? '定时已启用' : '定时已停用' }}</strong></div><div><span>调度规则</span><strong>{{ scheduleText(form.schedule) }}</strong></div></div>
        <p v-if="form.schedule.enabled" class="sql-detail-help">自动执行有效期：{{ windowText(form.schedule) }}；目标日期从{{ relativeDayText(form.schedule.startOffsetDays) }}到{{ relativeDayText(form.schedule.endOffsetDays) }}。</p>
        <p v-if="form.schedule.enabled && schedulePlans.length" class="sql-detail-help">下次触发：{{ formatSqlScheduleInstant(schedulePlans[0].plannedAt) }}；生成 {{ schedulePlans[0].startDate }} 至 {{ schedulePlans[0].endDate }}。</p>
        <p class="sql-detail-help">手工补数不受定时状态限制；点击下方“立即执行”，在弹窗中选择目标日期范围。</p>
        <details class="sql-details"><summary>查看 SQL 与列处理规则</summary><pre>{{ form.sampleSql }}</pre><p>业务时间列：{{ form.timeColumns.join('、') || '无' }}</p><p>新 UUID 列：{{ form.uuidColumns.join('、') || '无' }}</p><p>写入时刻列：{{ form.nowColumns.join('、') || '无' }}</p></details>
      </section>
        <section v-if="isForm" class="card sql-card"><h2>任务配置</h2>
          <label class="sql-name-field">任务名称<input v-model="form.name" :disabled="!canManage" maxlength="128" placeholder="例如：气象站日值日期模拟"></label>
          <div class="sql-table-lookup"><label>Schema<input v-model="form.schemaName" :disabled="!canManage" placeholder="msc_base"></label>
            <label>目标表<input v-model="form.tableName" :disabled="!canManage" placeholder="msc_station_aws_data_1d"></label>
            <button class="button secondary sql-inspect-button" :disabled="busy" @click="inspect()">读取表结构</button></div>
          <div v-if="error && errorScope === 'inspect'" data-sql-error="inspect" class="sql-notice error sql-inline-feedback" role="alert" tabindex="-1">{{ error }}</div>
          <div v-if="message && messageScope === 'inspect'" class="sql-notice sql-inline-feedback" role="status">{{ message }}</div>
          <p v-if="columns.length" class="sql-help">已识别 {{ columns.length }} 列；主键：{{ primaryKey.join('、') }}</p>
          <label class="sql-block sql-sample-date">样例日期<input v-model="form.sampleDate" :disabled="!canManage" type="date"></label>
          <label class="sql-block sql-sql-field">只读样例 SQL<textarea v-model="form.sampleSql" :disabled="!canManage" rows="5" spellcheck="false" placeholder="SELECT * FROM msc_base.表名 WHERE data_time >= :sampleStart AND data_time < :sampleEnd"></textarea></label>
          <p class="sql-help">仅允许查询所选目标表；必须用 :sampleStart 和 :sampleEnd 限定固定样例日。</p>
          <div v-if="columns.length" class="sql-columns">
            <fieldset><legend>平移的业务时间列</legend><label v-for="column in dateColumns" :key="column.column_name"><input v-model="form.timeColumns" :disabled="!canManage" type="checkbox" :value="column.column_name">{{ column.column_name }}</label></fieldset>
            <fieldset><legend>生成新 UUID 的列</legend><label v-for="column in columns" :key="column.column_name"><input v-model="form.uuidColumns" :disabled="!canManage" type="checkbox" :value="column.column_name">{{ column.column_name }}</label></fieldset>
            <fieldset><legend>设为写入时刻的列</legend><label v-for="column in dateColumns" :key="column.column_name"><input v-model="form.nowColumns" :disabled="!canManage" type="checkbox" :value="column.column_name">{{ column.column_name }}</label></fieldset>
          </div>
          <div class="sql-schedule">
            <div class="sql-schedule-heading"><div><h3>自动调度</h3><p>与任务管理使用相同的 Cron、固定间隔和自动执行有效期；手工补数请在任务详情中操作。</p></div>
              <label class="sql-schedule-toggle"><input v-model="form.schedule.enabled" type="checkbox">{{ form.schedule.enabled ? '已启用' : '已停用' }}</label></div>
            <label class="sql-schedule-type">调度方式<select v-model="form.schedule.type" @change="onScheduleTypeChange"><option value="CRON">Cron</option><option value="FIXED_RATE">固定间隔</option></select></label>
            <div v-if="form.schedule.type === 'CRON'" class="sql-cron-builder">
              <div class="sql-cron-heading"><div><h3>Cron 执行时间</h3><p>依次选择年月日时分秒，系统自动生成调度规则。</p></div>
                <label>Cron 表达式<input v-model.trim="form.schedule.expression" spellcheck="false" placeholder="例如 0 0 8,20 * * ?" @blur="loadCronExpression"><small>支持逗号列表、范围、步长等 Spring 六段 Cron 语法</small></label></div>
              <div class="sql-cron-grid">
                <label>年<select v-model="cron.year"><option value="*">每年</option><option v-if="cron.year !== '*' && !yearOptions.includes(cron.year)" :value="cron.year">{{ cron.year }} 年</option><option v-for="year in yearOptions" :key="year" :value="year">{{ year }} 年</option></select></label>
                <label>月<select v-model="cron.month"><option v-if="!monthOptions.some(item => item.value === cron.month)" :value="cron.month">{{ cron.month }}</option><option v-for="item in monthOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
                <label>日<select v-model="cron.day"><option v-if="!dayOptions.some(item => item.value === cron.day)" :value="cron.day">{{ cron.day }}</option><option v-for="item in dayOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
                <label>时<select v-model="cron.hour"><option v-if="!hourOptions.some(item => item.value === cron.hour)" :value="cron.hour">{{ cron.hour }}</option><option v-for="item in hourOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
                <label>分<select v-model="cron.minute"><option v-if="!minuteOptions.some(item => item.value === cron.minute)" :value="cron.minute">{{ cron.minute }}</option><option v-for="item in minuteOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
                <label>秒<select v-model="cron.second"><option v-if="!secondOptions.some(item => item.value === cron.second)" :value="cron.second">{{ cron.second }}</option><option v-for="item in secondOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
              </div>
              <div class="sql-cron-summary"><strong>执行规则</strong> {{ cron.year === '*' ? '每年' : `${cron.year} 年` }} · {{ optionLabel(monthOptions, cron.month) }} · {{ optionLabel(dayOptions, cron.day) }} · {{ optionLabel(hourOptions, cron.hour) }} · {{ optionLabel(minuteOptions, cron.minute) }} · {{ optionLabel(secondOptions, cron.second) }}</div>
            </div>
            <label v-else class="sql-schedule-interval">执行间隔（秒）<input v-model.number="form.schedule.intervalSeconds" type="number" min="1" max="31536000"></label>
            <div class="sql-execution-window"><div class="sql-schedule-heading"><div><h3>自动执行有效期</h3><p>仅限制系统定时调度，详情页的手工补数不受此范围限制。</p></div>
              <label>有效期类型<select v-model="form.schedule.autoExecutionWindow.type"><option value="UNBOUNDED">长期有效</option><option value="DATE_RANGE">指定日期范围</option></select></label></div>
              <div v-if="form.schedule.autoExecutionWindow.type === 'DATE_RANGE'" class="sql-window-fields"><label>开始日期<input v-model="form.schedule.autoExecutionWindow.startDate" type="date"></label><label>结束日期<input v-model="form.schedule.autoExecutionWindow.endDate" type="date"></label></div>
              <p class="sql-help">{{ windowText(form.schedule) }}</p>
            </div>
            <div class="sql-schedule-fields"><div class="sql-relative-day"><span>目标开始日</span><div><select :value="offsetDirection(form.schedule.startOffsetDays)" @change="setOffsetDirection('startOffsetDays', $event.target.value)"><option value="BEFORE">触发日前</option><option value="TODAY">触发当天</option><option value="AFTER">触发日后</option></select><label v-if="form.schedule.startOffsetDays !== 0">天数<input :value="Math.abs(form.schedule.startOffsetDays)" type="number" min="1" max="365" @change="setOffsetDistance('startOffsetDays', $event)"></label></div></div>
              <div class="sql-relative-day"><span>目标结束日</span><div><select :value="offsetDirection(form.schedule.endOffsetDays)" @change="setOffsetDirection('endOffsetDays', $event.target.value)"><option value="BEFORE">触发日前</option><option value="TODAY">触发当天</option><option value="AFTER">触发日后</option></select><label v-if="form.schedule.endOffsetDays !== 0">天数<input :value="Math.abs(form.schedule.endOffsetDays)" type="number" min="1" max="365" @change="setOffsetDistance('endOffsetDays', $event)"></label></div></div></div>
            <p class="sql-help">例如选择“触发日前 1 天”可生成前一天数据。已有主键跳过；手工补数日期在任务详情中单独选择。</p>
            <div v-if="form.schedule.enabled && schedulePlans.length" class="sql-schedule-preview"><strong>接下来 3 次（北京时间）</strong><div v-for="plan in schedulePlans" :key="plan.plannedAt">{{ formatSqlScheduleInstant(plan.plannedAt) }} → {{ plan.startDate }} 至 {{ plan.endDate }}</div></div>
            <p v-if="form.schedule.enabled && scheduleError" class="sql-help sql-schedule-invalid" role="alert">{{ scheduleError }}</p>
          </div>
          <div class="sql-form-footer"><p>{{ form.schedule.enabled ? '保存后按上述时间自动执行；手工补数请前往任务详情。' : '保存配置后，可在任务详情中选择日期并手工补数；自动调度保持停用。' }}</p>
            <div class="sql-form-footer-actions"><button class="button secondary" :disabled="busy" @click="openList">返回列表</button>
              <button v-if="canManage" class="button primary" :disabled="busy" @click="save">{{ selectedId ? '保存修改' : '创建任务' }}</button></div></div>
          <div v-if="message && messageScope === 'save'" class="sql-notice sql-inline-feedback" role="status">{{ message }}</div>
          <div v-if="error && errorScope === 'save'" data-sql-error="save" class="sql-notice error sql-inline-feedback" role="alert" tabindex="-1">{{ error }}</div>
        </section>
        <section v-if="isDetail" id="sql-date-preview" class="card sql-card sql-manual-card">
          <div><h2>手工补数</h2><p class="sql-help">点击“立即执行”后选择本次目标日期范围，与自动调度的目标日期互不影响。</p></div>
          <button class="button primary" :disabled="!selectedId || busy" @click="openManual">立即执行</button>
          <div v-if="message && messageScope === 'preview'" class="sql-notice sql-inline-feedback" role="status">{{ message }}</div>
          <div v-if="error && errorScope === 'preview' && !manualDialog" data-sql-error="preview" class="sql-notice error sql-inline-feedback" role="alert" tabindex="-1">{{ error }}</div>
        </section>
        <section v-if="(isDetail || isForm) && selectedId" class="card sql-card"><div class="card-heading sql-section-title"><h2>最近执行</h2><button class="button secondary small" @click="loadExecutions">刷新</button></div>
          <div v-if="error && errorScope === 'executions'" data-sql-error="executions" class="sql-notice error sql-inline-feedback" role="alert" tabindex="-1">{{ error }}</div>
          <p v-if="!displayExecutions.length" class="sql-help">暂无执行记录</p><div v-for="run in displayExecutions" :key="run.id" class="sql-run">
            <div class="sql-run-main"><span class="sql-run-status" :class="run.status === 'FAILED' ? 'failed' : run.status === 'COMPLETED' ? 'completed' : ''">{{ run.status === 'FAILED' ? '失败' : run.status === 'COMPLETED' ? '已完成' : '执行中' }}</span>
              <div class="sql-run-meta"><strong>{{ run.target_start_date && run.target_end_date ? `${run.target_start_date} 至 ${run.target_end_date}` : '历史范围未记录' }}</strong><span>{{ run.trigger_mode === 'SCHEDULED' ? '定时执行' : '人工执行' }} · {{ formatDateTime(run.planned_at) }}</span></div>
              <span class="sql-run-count">新增 {{ run.inserted_count }} · 跳过 {{ run.skipped_count }}</span></div>
            <div v-if="run.failure" class="sql-run-failure"><strong>失败原因</strong><p>{{ run.failure.summary }}</p>
              <details v-if="run.failure.detail" class="sql-run-technical"><summary>查看技术详情</summary><pre>{{ run.failure.detail }}</pre></details></div></div>
        </section>
    </div>
    <section v-else-if="!loading" class="card sql-card sql-empty">{{ isNew ? '当前角色不能新建任务。' : '任务不存在或已被删除。' }}<button class="link-button" @click="openList">返回列表</button></section>
    <AppModal v-if="manualDialog" :title="`立即执行 · ${selected?.name || ''}`" wide @close="manualDialog = false">
      <div class="sql-manual-modal"><p>选择本次补数的绝对日期范围。包含开始与结束日期，相同日期可补单日，最多 366 天；已有主键跳过。</p>
        <div class="sql-grid sql-date-range"><label>目标开始日期<input v-model="targetStartDate" type="date"></label><label>目标结束日期<input v-model="targetEndDate" type="date"></label></div>
        <div v-if="error && errorScope === 'preview'" data-sql-error="preview" class="sql-notice error sql-inline-feedback" role="alert" tabindex="-1">{{ error }}</div>
        <div v-if="preview" class="sql-preview"><strong>样例 {{ preview.sampleRows }} 行 · 目标 {{ preview.targetDates.length }} 日 · 预计新增 {{ preview.expectedInserted }} 行 · 预计跳过 {{ preview.expectedSkipped }} 行</strong>
          <p>目标范围：{{ preview.targetDates[0] }} 至 {{ preview.targetDates[preview.targetDates.length - 1] }}</p><small>{{ preview.note }}</small></div>
      </div>
      <template #footer><button class="button secondary" :disabled="busy" @click="manualDialog = false">取消</button>
        <button class="button secondary" :disabled="busy" @click="makePreview">只读预览</button>
        <button class="button primary" :disabled="busy" @click="execute">{{ busy ? '正在处理…' : '确认执行' }}</button></template>
    </AppModal>
  </main>
</template>

<style scoped>
.sql-page { color: var(--ink); }
.sql-heading { gap: 16px; align-items: center; }
.sql-heading > div { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 18px; row-gap: 4px; }
.sql-heading h1, .sql-heading p { margin: 0; }
.sql-heading .button { flex: 0 0 auto; }
.sql-main { display: grid; width: 100%; gap: 18px; }
.sql-list-page { padding: 0; overflow: hidden; }
.sql-list-page > .sql-section-title { margin: 0; padding: 18px 20px; border-bottom: 1px solid #ebeef5; }
.sql-list-page > .sql-help, .sql-list-page > .sql-empty { margin: 0; padding: 28px 20px; }
.sql-count { color: var(--muted); font-size: 14px; }
.sql-table { min-width: 900px; table-layout: fixed; }
.sql-table th:nth-child(1) { width: 20%; }
.sql-table th:nth-child(2) { width: 30%; }
.sql-table th:nth-child(3) { width: 20%; }
.sql-table th:nth-child(4) { width: 10%; }
.sql-table th:nth-child(5) { width: 20%; }
.sql-table th.operation-cell, .sql-table td.operation-cell { white-space: nowrap; }
.sql-table .table-actions { flex-wrap: nowrap; justify-content: center; gap: 12px; }
.sql-delete { color: #b42318; }
.sql-table th:first-child, .sql-table td:first-child { padding-left: 20px; }
.sql-table th:last-child, .sql-table td:last-child { padding-right: 20px; }
.sql-table td:nth-child(2) { overflow-wrap: anywhere; }
.sql-table-target { display: block; }
.sql-schedule-state { display: inline-flex; padding: 4px 9px; border-radius: 6px; font-size: 13px; font-weight: 650; }
.sql-schedule-state.enabled { color: #167044; background: #e7f5ed; }
.sql-schedule-state.disabled { color: #64748b; background: #edf1f5; }
.sql-table .management-primary { white-space: normal; overflow-wrap: anywhere; }
.sql-card { min-width: 0; padding: 22px; }
.sql-card h2 { margin: 0 0 16px; }
.sql-section-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.sql-section-title h2 { margin-bottom: 0; }
.sql-empty { color: var(--muted); }
.sql-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; padding: 4px 0 12px; }
.sql-summary div { display: grid; min-width: 0; gap: 7px; }
.sql-summary span { color: var(--muted); font-size: 14px; }
.sql-summary strong { overflow-wrap: anywhere; font-size: 15px; }
.sql-next-step { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 12px; padding: 16px 18px; border-radius: 8px; background: #eef5ff; color: #163f73; }
.sql-next-step strong { font-size: 16px; }
.sql-next-step p { margin: 6px 0 0; font-size: 14px; line-height: 1.5; }
.sql-next-step .button { flex: 0 0 auto; }
.sql-pending-change { margin-bottom: 16px; background: #fff5e7; color: #704b13; }
.sql-detail-help { margin: 12px 0 0; color: var(--muted); font-size: 14px; }
.sql-details { margin-top: 12px; padding-top: 15px; border-top: 1px solid var(--line); font-size: 14px; }
.sql-details summary { color: var(--management-link); cursor: pointer; font-weight: 650; }
.sql-details pre { padding: 12px; border-radius: 6px; background: #f8fafd; white-space: pre-wrap; overflow-wrap: anywhere; }
.sql-details p { margin: 8px 0; }
.sql-help { color: var(--muted); font-size: 14px; }
.sql-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.sql-name-field { max-width: 540px; }
.sql-table-lookup { display: grid; grid-template-columns: minmax(180px, 260px) minmax(300px, 540px) 136px; align-items: end; gap: 16px; margin-top: 16px; }
.sql-inspect-button { min-width: 136px; min-height: var(--control-height); white-space: nowrap; font-size: 15px; }
.sql-form-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); }
.sql-form-footer p { margin: 0; color: var(--muted); font-size: 14px; }
.sql-form-footer .button { flex: 0 0 auto; }
.sql-form-footer-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.sql-sample-date { max-width: 300px; }
.sql-sql-field { max-width: 1120px; }
.sql-date-range { max-width: 760px; }
.sql-manual-card { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.sql-manual-card h2 { margin-bottom: 4px; }
.sql-manual-card .sql-help { margin: 0; }
.sql-manual-card .sql-next-step, .sql-manual-card .sql-notice { flex-basis: 100%; }
.sql-manual-modal { display: grid; gap: 16px; }
.sql-manual-modal > p { margin: 0; color: var(--muted); }
.sql-manual-modal label { display: grid; gap: 7px; color: #465973; font-size: 15px; font-weight: 600; }
.sql-manual-modal input { width: 100%; min-height: var(--control-height); padding: 9px 11px; border: 1px solid #d9dfe9; border-radius: 6px; background: #fff; color: var(--ink); font: inherit; }
.sql-card label { display: grid; gap: 7px; color: #465973; font-size: 15px; font-weight: 600; }
.sql-card input:not([type=checkbox]), .sql-card select, .sql-card textarea {
  width: 100%; min-height: var(--control-height); padding: 9px 11px;
  border: 1px solid #d9dfe9; border-radius: 6px; background: #fff; color: var(--ink); font: inherit;
}
.sql-card textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }
.sql-card input:disabled, .sql-card select:disabled, .sql-card textarea:disabled { background: #f5f7fa; }
.sql-block { margin-top: 16px; }
.sql-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.sql-columns fieldset { max-height: 185px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
.sql-columns legend { font-size: 14px; font-weight: 700; }
.sql-columns label { display: flex; align-items: center; padding: 4px 0; font-size: 14px; font-weight: 400; overflow-wrap: anywhere; }
.sql-schedule { margin-top: 22px; padding: 18px 20px; border: 1px solid #dbe5f2; border-radius: 10px; background: #f8fbff; }
.sql-schedule-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.sql-schedule-heading h3 { margin: 0; color: var(--ink); font-size: 17px; }
.sql-schedule-heading p { margin: 5px 0 0; color: var(--muted); font-size: 14px; }
.sql-card .sql-schedule-toggle { display: flex; align-items: center; gap: 9px; white-space: nowrap; color: var(--ink); }
.sql-schedule-toggle input { width: 18px; height: 18px; }
.sql-schedule-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 360px)); gap: 16px; margin-top: 18px; }
.sql-relative-day { display: grid; gap: 7px; color: #465973; font-size: 15px; font-weight: 600; }
.sql-relative-day > div { display: flex; align-items: end; gap: 10px; }
.sql-relative-day select { flex: 1; min-width: 0; }
.sql-relative-day label { width: 96px; flex: 0 0 96px; font-size: 13px; }
.sql-schedule-type { max-width: 300px; margin-top: 18px; }
.sql-schedule-interval { max-width: 280px; margin-top: 18px; }
.sql-cron-builder { margin-top: 18px; border: 1px solid #dbe5f2; border-radius: 9px; background: #fff; overflow: hidden; }
.sql-cron-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 20px; border-bottom: 1px solid #e8edf4; }
.sql-cron-heading h3 { margin: 0; color: var(--ink); font-size: 17px; }
.sql-cron-heading p { margin: 5px 0 0; color: var(--muted); font-size: 14px; }
.sql-cron-heading label { width: min(360px, 42%); }
.sql-cron-heading small { color: var(--muted); font-size: 12px; font-weight: 400; }
.sql-cron-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; padding: 18px 20px; }
.sql-cron-grid label { min-width: 0; padding: 12px; border: 1px solid #e3e9f1; border-radius: 7px; background: #f8fafc; }
.sql-cron-grid select { min-width: 0; }
.sql-cron-summary { margin: 0 20px 18px; padding: 12px; border-radius: 7px; background: #f3f6fa; color: #40526c; }
.sql-cron-summary strong { margin-right: 12px; color: #1677ff; }
.sql-execution-window { margin-top: 18px; padding: 18px 20px; border: 1px solid #dfe5ee; border-radius: 9px; background: #f8fafc; }
.sql-execution-window .sql-schedule-heading label { width: min(260px, 40%); }
.sql-window-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 260px)); gap: 16px; margin-top: 16px; }
.sql-schedule-preview { margin-top: 14px; padding: 12px 14px; border-radius: 8px; background: #eaf3ff; color: #214e84; font-size: 14px; line-height: 1.8; }
.sql-schedule-preview strong { display: block; }
.sql-schedule-invalid { color: #b42318; }
.sql-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.sql-notice { margin: 0 0 16px; padding: 11px 14px; border-radius: 8px; background: #e7f5ed; color: #19633c; }
.sql-notice.error { background: #fff1ef; color: #b42318; }
.sql-inline-feedback { margin: 12px 0 0; }
.sql-preview { margin-top: 16px; padding: 14px; border: 1px solid #d9e8fc; border-radius: 8px; background: #f4f8ff; }
.sql-preview p { margin: 8px 0; overflow-wrap: anywhere; }
.sql-run { min-width: 0; padding: 15px 0; border-top: 1px solid #edf1f5; font-size: 14px; }
.sql-run-main { display: grid; grid-template-columns: 82px minmax(0, 1fr) auto; align-items: center; gap: 16px; min-width: 0; }
.sql-run-status { display: inline-flex; justify-content: center; width: fit-content; min-width: 68px; padding: 5px 9px; border-radius: 6px; color: #596a80; background: #edf1f5; font-weight: 700; }
.sql-run-status.failed { color: #a72e28; background: #fff0ee; }
.sql-run-status.completed { color: #177347; background: #e7f5ed; }
.sql-run-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; min-width: 0; }
.sql-run-meta strong { color: var(--ink); font-weight: 650; overflow-wrap: anywhere; }
.sql-run-meta span { color: var(--muted); }
.sql-run-count { color: var(--muted); white-space: nowrap; }
.sql-run-failure { min-width: 0; margin-top: 12px; padding: 12px 14px; border-radius: 8px; background: #fff4f2; color: #962c25; }
.sql-run-failure > strong { font-size: 13px; }
.sql-run-failure p { margin: 5px 0 0; line-height: 1.55; overflow-wrap: anywhere; }
.sql-run-technical { min-width: 0; margin-top: 10px; color: #74433d; }
.sql-run-technical summary { width: fit-content; cursor: pointer; font-weight: 600; }
.sql-run-technical pre { max-height: 240px; max-width: 100%; overflow: auto; margin: 8px 0 0; padding: 10px; border-radius: 6px; background: #fff; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
@media (max-width: 900px) {
  .sql-columns, .sql-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sql-schedule-fields { grid-template-columns: repeat(2, minmax(0, 220px)); }
  .sql-cron-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .sql-heading { align-items: flex-start; }
  .sql-grid, .sql-columns, .sql-summary { grid-template-columns: 1fr; }
  .sql-schedule-fields { grid-template-columns: 1fr; }
  .sql-cron-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sql-cron-heading { display: block; }
  .sql-cron-heading label { width: 100%; margin-top: 16px; }
  .sql-card { padding: 18px; }
  .sql-list-page { padding: 0; }
}
</style>
