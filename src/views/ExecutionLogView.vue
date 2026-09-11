<script setup>
import ListFilters from '../components/ListFilters.vue'
import ListPagination from '../components/ListPagination.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppDetailPage from '../components/AppDetailPage.vue'
import {setRoute} from '../page-route.mjs'
import {evidenceState} from '../interaction-policy.mjs'
import AppIcon from '../components/AppIcon.vue'
import SearchInput from '../components/SearchInput.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailSection from '../components/DetailSection.vue'
import { formatDateTime } from '../date-time.mjs'

const props = defineProps({
  executions: { type: Array, default: () => [] },
  executionPage: { type: Object, default: () => ({ page: 1, size: 10, total: 0, totalPages: 1 }) },
  messages: { type: Array, default: () => [] },
  pendingActions: { type: Object, default: () => new Set() },
  selectedExecutionId: { type: String, default: '' }
})
const emit = defineEmits(['load-messages', 'query-executions'])

const keyword = ref(props.executionPage.keyword || '')
const executionStatus = ref(props.executionPage.status || 'ALL')
const selectedExecutionId = ref('')
const messageStatus = ref('ALL')
const detailMessage = ref(null)
const messagesError = ref('')
const isPending = key => props.pendingActions.has(key)

const selectedExecution = computed(() => props.executions.find(item => item.id === selectedExecutionId.value))
const executionCounts = computed(() => ({
  total: props.executions.length,
  success: props.executions.filter(item => item.status === 'SUCCESS').length,
  failed: props.executions.filter(item => item.status === 'FAILED' || item.failed > 0).length
}))
const filteredExecutions = computed(() => props.executions)
const filteredMessages = computed(() => props.messages.filter(item =>
  item.executionId === selectedExecutionId.value && (messageStatus.value === 'ALL' || item.status === messageStatus.value)
))
const evidenceSteps = computed(() => {
  if (!selectedExecution.value) return []
  const stages = [
    { key: 'trigger', label: '任务触发', hint: selectedExecution.value.triggerMode === 'SCHEDULED' ? '定时任务' : '手工执行' },
    { key: 'message', label: '报文生成', hint: selectedExecution.value.messageName || '关联报文' },
    { key: 'binding', label: '数据与时间绑定', hint: selectedExecution.value.businessBaseAt ? '已形成业务时间上下文' : '等待执行证据' },
    ...(selectedExecution.value.messageType === 'FILE' ? [{ key: 'file', label: '文件处理', hint: '改写并发布文件引用' }] : []),
    { key: 'delivery', label: 'MQ 投递', hint: selectedExecution.value.target || '未进入投递' }
  ]
  const failure = props.messages.find(item => item.executionId === selectedExecutionId.value && item.status === 'FAILED')?.failureStage || (selectedExecution.value.status === 'FAILED' ? selectedExecution.value.errorSummary : '')
  const failedKey = /解析任务|解析投递目标/.test(failure) ? 'trigger' : (/生成文件/.test(failure) ? 'file' : (/投递/.test(failure) ? 'delivery' : (/生成报文|时间/.test(failure) ? 'binding' : '')))
  const failedIndex = stages.findIndex(item => item.key === failedKey)
  return stages.map((item, index) => ({ ...item, state: evidenceState(selectedExecution.value.status, failedIndex, index) }))
})

function openExecution(item) {
  if (isPending(`load-messages:${item.id}`)) return
  selectedExecutionId.value = item.id
  setRoute('logs', item.id)
  messageStatus.value = 'ALL'
  messagesError.value = ''
  emit('load-messages', item.id, result => { messagesError.value = result?.error || '' })
}

function reloadMessages() {
  if (selectedExecution.value) openExecution(selectedExecution.value)
}

function closeExecution() {
  selectedExecutionId.value = ''
  detailMessage.value = null
  setRoute('logs')
}

function readableError(item) {
  return item.errorMessage || item.errorSummary || '未记录具体异常，请结合后端日志定位。'
}

/** 将后端聚合目标拆成可扫描的实例、Group、Topic，不让技术长串挤压任务和操作列。 */
function deliveryRoutes(target) {
  const routes = String(target || '').split('；').map(value => value.trim()).filter(Boolean)
  if (!routes.length) return [{ instance: '未进入 MQ 投递', group: '', topic: '' }]
  return routes.map(route => {
    const [instance = '', group = '', ...topicParts] = route.split('/').map(value => value.trim())
    return { instance, group, topic: topicParts.join(' / ') }
  })
}

let searchTimer
let syncingQuery = false
watch(keyword, () => {
  if (syncingQuery) return
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => emit('query-executions', { page: 1, size: props.executionPage.size, keyword: keyword.value.trim(), status: executionStatus.value }), 300)
})
watch(executionStatus, () => {
  if (!syncingQuery) emit('query-executions', { page: 1, size: props.executionPage.size, keyword: keyword.value.trim(), status: executionStatus.value })
})
/** 接收总览图表带入的筛选条件，同时避免字段同步再次发起重复请求。 */
watch(() => [props.executionPage.keyword, props.executionPage.status], ([nextKeyword, nextStatus]) => {
  if (keyword.value === nextKeyword && executionStatus.value === nextStatus) return
  syncingQuery = true
  keyword.value = nextKeyword || ''
  executionStatus.value = nextStatus || 'ALL'
  queueMicrotask(() => { syncingQuery = false })
}, { immediate: true })
/** 总览传入 Execution ID 时自动打开同一条执行证据，保留异常定位上下文。 */
watch(() => [props.selectedExecutionId, props.executions], ([executionId]) => {
  if (!executionId) { selectedExecutionId.value = ''; return }
  const execution = props.executions.find(item => item.id === executionId)
  if (execution && executionId !== selectedExecutionId.value) openExecution(execution)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(searchTimer))

function changePage(page) {
  if (page < 1 || page > props.executionPage.totalPages || isPending('query:executions')) return
  emit('query-executions', { page, size: props.executionPage.size, keyword: keyword.value.trim(), status: executionStatus.value })
}
function clearExecutionFilters() {
  syncingQuery = true
  keyword.value = ''
  executionStatus.value = 'ALL'
  queueMicrotask(() => { syncingQuery = false })
  emit('query-executions', {page: 1, size: props.executionPage.size, keyword: '', status: 'ALL'})
}
function selectMessageStatus(status) { messageStatus.value = status }
function handleMessageStatusKey(event, status) {
  const statuses = ['ALL', 'SUCCESS', 'FAILED']
  const index = statuses.indexOf(status)
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? statuses.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + statuses.length) % statuses.length
  selectMessageStatus(statuses[nextIndex])
  requestAnimationFrame(() => document.querySelector(`[data-message-status="${statuses[nextIndex]}"]`)?.focus())
}
</script>

<template>
  <main class="page execution-log-page">
    <p v-if="props.selectedExecutionId && !selectedExecution && !isPending('query:executions')" class="notice negative">未找到该执行记录，可能已不可访问。<button class="link-button" @click="closeExecution">返回执行列表</button></p>
    <div v-show="!selectedExecution">
    <div class="page-heading">
      <div>
        <h1>执行记录</h1>
        <p>按执行批次查看任务结果，并追踪每个 MQ 投递目标的报文、Broker 消息 ID 与失败原因。</p>
      </div>
    </div>

    <section class="summary-grid">
      <article class="summary-card">
        <span>符合筛选的执行批次</span><strong>{{ executionPage.total }}</strong><small>全部查询结果</small>
      </article>
      <article class="summary-card success">
        <span>当前页成功</span><strong>{{ executionCounts.success }}</strong><small>仅统计当前页 · 全部目标成功</small>
      </article>
      <article class="summary-card danger">
        <span>当前页异常</span><strong>{{ executionCounts.failed }}</strong><small>仅统计当前页 · 可进入详情定位</small>
      </article>
    </section>

    <section class="card execution-card">
        <ListFilters>
          <label class="toolbar-field"><span>搜索记录</span><SearchInput v-model="keyword" class="execution-search" aria-label="搜索执行记录" placeholder="搜索任务、报文、Execution 或目标" /></label>
          <label class="toolbar-field"><span>执行状态</span><select v-model="executionStatus" class="status-select" aria-label="筛选执行状态">
            <option value="ALL">全部状态</option>
            <option value="SUCCESS">成功</option>
            <option value="PARTIAL_SUCCESS">部分成功</option>
            <option value="FAILED">失败</option>
          </select></label>
          <button class="button secondary small" @click="clearExecutionFilters">清除筛选</button></ListFilters>

      <div class="table-scroll" :class="{'is-loading': isPending('query:executions')}">
        <table class="data-table execution-table">
          <colgroup><col class="batch-col"><col class="resource-col"><col class="target-col"><col class="result-col"><col class="error-col"><col class="action-col"></colgroup>
          <thead><tr><th>执行批次</th><th>任务 / 报文</th><th>投递目标</th><th>执行结果</th><th class="exception-column">异常摘要</th><th class="action-column">操作</th></tr></thead>
          <tbody>
            <tr v-for="item in filteredExecutions" :key="item.id" :class="{ 'failed-row': item.failed > 0 || item.status === 'FAILED' }">
              <td class="batch-cell"><button class="text-link execution-id" :disabled="isPending(`load-messages:${item.id}`)" @click="openExecution(item)">{{ item.id }}</button><time :datetime="item.startedAt">{{ formatDateTime(item.startedAt) }}</time></td>
              <td class="resource-cell"><b :title="item.taskName || '未知任务'">{{ item.taskName || '未知任务' }}</b><small :title="item.messageName || '未关联报文'">{{ item.messageName || '未关联报文' }}</small></td>
              <td class="delivery-cell" :title="item.target || '未进入 MQ 投递'">
                <div v-for="(route, index) in deliveryRoutes(item.target).slice(0, 2)" :key="`${item.id}-${index}`" class="delivery-route">
                  <div class="route-line"><span>实例</span><code class="route-instance">{{ route.instance || '—' }}</code></div>
                  <div class="route-line"><span>Group</span><code class="route-group">{{ route.group || '—' }}</code></div>
                  <div class="route-line"><span>Topic</span><code class="route-topic">{{ route.topic || '—' }}</code></div>
                </div>
                <small v-if="deliveryRoutes(item.target).length > 2" class="route-more">另有 {{ deliveryRoutes(item.target).length - 2 }} 个目标</small>
              </td>
              <td class="result-cell"><StatusBadge :status="item.status" /><small><b>{{ item.success }}</b> 成功 <i></i><b :class="{'has-failure': item.failed}">{{ item.failed }}</b> 失败</small></td>
              <td class="exception-cell exception-column"><span v-if="item.errorSummary" :title="item.errorSummary">{{ item.errorSummary }}</span><span v-else class="muted">无异常</span></td>
              <td class="action-cell"><button class="link-button" :disabled="isPending(`load-messages:${item.id}`)" @click="openExecution(item)">{{ isPending(`load-messages:${item.id}`) ? '加载中…' : '查看详情' }}</button></td>
            </tr>
            <tr v-if="!filteredExecutions.length"><td colspan="6" class="empty-state">没有符合条件的执行记录。<br><button v-if="keyword || executionStatus !== 'ALL'" class="link-button empty-state-action" @click="clearExecutionFilters">清除筛选</button></td></tr>
          </tbody>
        </table>
      </div>
      <ListPagination :page="executionPage.page" :page-size="executionPage.size" :total="executionPage.total" :total-pages="executionPage.totalPages" :disabled="isPending('query:executions')" @update:page="changePage" @update:page-size="emit('query-executions', {page: 1, size: $event, keyword, status: executionStatus})" />
    </section>

    </div>
    <AppDetailPage v-if="selectedExecution" :title="detailMessage ? `实际投递报文 · ${detailMessage.id}` : '执行详情'" @close="closeExecution">
      <template v-if="detailMessage" #header-actions><button class="button secondary small" @click="detailMessage = null"><AppIcon name="back" :size="15" />返回执行详情</button></template>
      <div v-if="detailMessage" class="message-detail-page unified-detail">
        <DetailHeader eyebrow="目标投递报文" :title="detailMessage.id" :code="detailMessage.brokerMessageId || '未生成 Broker 消息 ID'" :description="detailMessage.target || '未记录投递目标'">
          <template #aside><StatusBadge :status="detailMessage.status"/></template>
        </DetailHeader>
        <DetailGrid :columns="3"><div><dt>生成时间</dt><dd>{{ formatDateTime(detailMessage.generatedAt) }}</dd></div><div><dt>报文发布版本</dt><dd>{{ detailMessage.templateVersion ? `V${detailMessage.templateVersion}` : '历史记录未记录' }}</dd></div><div><dt>失败阶段</dt><dd>{{ detailMessage.failureStage || '无' }}</dd></div></DetailGrid>
        <div v-if="detailMessage.status === 'FAILED'" class="execution-error"><b>{{ detailMessage.failureStage || '执行失败' }}</b><p>{{ readableError(detailMessage) }}</p></div>
        <DetailSection title="最终报文内容" description="展示投递前最终生成的真实内容" collapsible open>
          <pre v-if="detailMessage.payload" class="code-block">{{ detailMessage.payload }}</pre><div v-else class="payload-empty">失败发生在报文生成或 MQ 投递之前，没有可展示的最终报文内容。</div>
        </DetailSection>
      </div>
      <div v-else class="execution-detail unified-detail">
        <DetailHeader eyebrow="执行批次" :title="selectedExecution.taskName || '未知任务'" :code="selectedExecution.id" :description="selectedExecution.messageName || '未关联报文'">
          <template #aside><StatusBadge :status="selectedExecution.status"/></template>
        </DetailHeader>
        <DetailGrid :columns="4" tone="blue">
          <div><dt>触发方式</dt><dd>{{ selectedExecution.triggerMode === 'SCHEDULED' ? '定时任务' : (selectedExecution.triggerMode === 'MANUAL_SPECIFIED' ? '指定时间执行' : '当前时间执行') }}</dd></div>
          <div><dt>计划触发时间</dt><dd>{{ formatDateTime(selectedExecution.plannedTriggerAt) }}</dd></div>
          <div><dt>业务基准时间</dt><dd>{{ formatDateTime(selectedExecution.businessBaseAt) }}</dd></div>
          <div><dt>预报结束时间</dt><dd>{{ selectedExecution.periodEndAt ? formatDateTime(selectedExecution.periodEndAt) : '不适用' }}</dd></div>
        </DetailGrid>
        <DetailSection title="执行证据链" description="按真实执行结果标记完成节点和首个失败阶段">
          <section class="evidence-chain" aria-label="Execution 执行证据链"><div class="evidence-heading"><span>{{ selectedExecution.status === 'SUCCESS' ? '投递成功' : selectedExecution.status === 'FAILED' ? '执行失败' : selectedExecution.status === 'PARTIAL_SUCCESS' ? '部分投递成功' : '执行状态待确认' }}</span><small>仅展示已有执行证据，未记录的阶段不代表已完成。</small></div><ol><li v-for="step in evidenceSteps" :key="step.key" :class="step.state"><i></i><div><b>{{ step.label }}</b><small>{{ step.hint }}</small></div></li></ol></section>
        </DetailSection>
        <div v-if="selectedExecution.errorSummary" class="execution-error"><b>执行失败原因</b><p>{{ selectedExecution.errorSummary }}</p></div>
        <div v-if="selectedExecution.messageType === 'FILE'" class="notice">文件类报文展示最终 MQ 报文内容和生成后的文件地址，文件本体保存在报文配置所选的 OSS 或 OBS。</div>
        <DetailSection title="逐目标投递明细" description="查看每个 MQ 目标的独立投递结果" :count="filteredMessages.length">
          <template #actions><div class="message-status-filter"><span>投递状态</span><div class="segmented" role="tablist" aria-label="筛选逐目标投递状态"><button v-for="item in [['ALL','全部'],['SUCCESS','成功'],['FAILED','失败']]" :key="item[0]" type="button" role="tab" :data-message-status="item[0]" :aria-selected="messageStatus === item[0]" :tabindex="messageStatus === item[0] ? 0 : -1" :class="{ active: messageStatus === item[0] }" @click="selectMessageStatus(item[0])" @keydown="handleMessageStatusKey($event, item[0])">{{ item[1] }}</button></div></div></template>
          <div v-if="isPending(`load-messages:${selectedExecution.id}`)" class="detail-loading"><i></i><span>正在读取逐目标投递结果…</span></div>
          <div v-else-if="messagesError" class="detail-error"><div><b>执行明细加载失败</b><p>{{ messagesError }}</p></div><button class="button secondary small" @click="reloadMessages">重新加载</button></div>
          <div v-else class="table-scroll"><table class="data-table message-table"><thead><tr><th>Simulation Message ID</th><th>生成时间</th><th>MQ 投递目标</th><th>Broker 消息 ID</th><th>状态 / 错误</th><th>操作</th></tr></thead><tbody><tr v-for="item in filteredMessages" :key="item.recordId" :class="{ 'failed-row': item.status === 'FAILED' }"><td><b>{{ item.id }}</b></td><td>{{ formatDateTime(item.generatedAt) }}</td><td><span class="target-text" :title="item.target">{{ item.target }}</span></td><td><code v-if="item.brokerMessageId">{{ item.brokerMessageId }}</code><span v-else class="muted">未生成</span></td><td><StatusBadge :status="item.status"/><small v-if="item.status === 'FAILED'" class="inline-error"><b>{{ item.failureStage || '执行失败' }}</b>：{{ readableError(item) }}</small></td><td><button class="link-button" @click="detailMessage = item">报文详情</button></td></tr><tr v-if="!filteredMessages.length"><td colspan="6" class="empty-state">该执行批次暂无符合条件的投递明细。</td></tr></tbody></table></div>
        </DetailSection>
      </div>
    </AppDetailPage>
  </main>
</template>

<style scoped>
.execution-log-page { display: grid; gap: 20px; }
.unified-detail { display: grid; gap: 16px; }
.detail-loading, .detail-error { display: flex; min-height: 84px; align-items: center; justify-content: center; gap: 12px; padding: 16px; border: 1px solid #f0f0f0; border-radius: 8px; color: #595959; background: #fafafa; font-size: 15px; }.detail-loading i { width: 17px; height: 17px; border: 2px solid #d9d9d9; border-top-color: #1677ff; border-radius: 50%; animation: detail-spin .8s linear infinite; }.detail-error { justify-content: space-between; border-color: #ffccc7; background: #fff2f0; }.detail-error b { color: #cf1322; font-size: 15px; }.detail-error p { margin: 3px 0 0; color: #a8071a; font-size: 13px; }
@keyframes detail-spin { to { transform: rotate(360deg); } }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.summary-card { padding: 20px 22px; border: 1px solid var(--line); border-top: 3px solid var(--blue); border-radius: 8px; background: #fff; }
.summary-card span, .summary-card small { display: block; color: var(--muted); }
.summary-card strong { display: block; margin: 8px 0 2px; color: var(--ink); font-size: 30px; line-height: 1.2; }
.summary-card.success { border-top-color: var(--green); }
.summary-card.success strong { color: #36a269; }
.summary-card.danger { border-top-color: var(--amber); }
.summary-card.danger strong { color: #e45d5d; }
.execution-card { overflow: hidden; }
.execution-pagination { border-top: 1px solid #edf0f5; }
.execution-heading { align-items: flex-end; gap: 20px; }
.toolbar { display: flex; align-items: center; gap: 10px; }
.toolbar-field { display: grid; gap: 6px; color: #5f7087; font-size: 13px; font-weight: 650; }
.execution-search { width: 320px; }
.status-select { width: 130px; height: 38px; padding: 0 10px; border: 1px solid #dcdfe6; border-radius: 4px; color: #606266; background: #fff; }
.execution-table { width: 100%; min-width: 1060px; table-layout: fixed; }
.execution-table .batch-col { width: 170px; }.execution-table .resource-col { width: 230px; }.execution-table .target-col { width: auto; }.execution-table .result-col { width: 150px; }.execution-table .error-col { width: 190px; }.execution-table .action-col { width: 96px; }
.execution-table th, .execution-table td { padding: 15px 18px; vertical-align: middle; }
.execution-table th { white-space: nowrap; }
.execution-id { display: block; max-width: 100%; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; font-weight: 700; letter-spacing: .01em; text-overflow: ellipsis; white-space: nowrap; }
.batch-cell time { display: block; margin-top: 5px; color: #8994a6; font-size: 12px; white-space: nowrap; }
.resource-cell b, .resource-cell small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resource-cell b { color: #24364f; font-size: 14px; font-weight: 650; }.resource-cell small { margin-top: 6px; color: #7c899b; font-size: 13px; }
.delivery-cell { padding-top: 12px !important; padding-bottom: 12px !important; }
.delivery-route { min-width: 0; overflow: hidden; border: 1px solid #e6edf7; border-radius: 5px; background: #f8faff; }
.delivery-route + .delivery-route { margin-top: 5px; }
.route-line { display: grid; grid-template-columns: 52px minmax(0, 1fr); align-items: center; min-width: 0; min-height: 27px; }
.route-line + .route-line { border-top: 1px solid #e6edf7; }
.route-line > span { align-self: stretch; display: flex; align-items: center; padding: 4px 8px; border-right: 1px solid #e6edf7; color: #8996a8; background: #f2f6fc; font-size: 11px; font-weight: 650; }
.route-line > code { min-width: 0; padding: 4px 9px; overflow: hidden; color: #53657d; background: transparent; font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.route-instance { color: #365b86 !important; font-weight: 650; }
.route-topic { color: #1769c2 !important; }.route-more { display: block; margin-top: 5px; color: #718096; font-size: 12px; }
.result-cell > small { display: flex; align-items: center; gap: 5px; margin-top: 7px; color: #7c899b; font-size: 12px; white-space: nowrap; }.result-cell > small b { color: #52647b; }.result-cell > small b.has-failure { color: #cf4d59; }.result-cell > small i { width: 1px; height: 11px; background: #d9e0e9; }
.exception-cell span { display: -webkit-box; overflow: hidden; color: #c84d57; font-size: 12px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.exception-cell .muted { color: #a4adbb; }
.action-column, .action-cell { text-align: center !important; }.action-cell .link-button { white-space: nowrap; }
.target-text { display: block; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.error-summary { display: -webkit-box; max-width: 300px; overflow: hidden; color: #d94848; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.muted { color: #a4adbb; }
.failed-row { background: #fffafa; }
.execution-overview, .message-metadata { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; border: 1px solid #ebeef5; border-radius: 4px; background: #fafafa; }
.execution-overview > div, .message-metadata > div { min-height: 74px; padding: 14px 16px; border-right: 1px solid #e8edf4; }
.execution-overview > div:last-child, .message-metadata > div:last-child { border-right: 0; }
.execution-overview span, .message-metadata span { display: block; margin-bottom: 8px; color: #8792a5; font-size: 13px; }
.execution-time-audit { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 12px; overflow: hidden; border: 1px solid #b3d8ff; border-radius: 4px; background: #f5faff; }
.execution-time-audit > div { min-height: 64px; padding: 13px 16px; border-right: 1px solid #e2ecf8; }
.execution-time-audit > div:last-child { border-right: 0; }
.execution-time-audit span, .execution-time-audit b { display: block; }
.execution-time-audit span { margin-bottom: 7px; color: #7d8ba0; font-size: 12px; }
.execution-time-audit b { color: #365f8e; font-size: 13px; overflow-wrap: anywhere; }
.evidence-chain { margin-top: 16px; padding: 17px 18px 18px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fafafa; }
.evidence-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.evidence-heading h3, .evidence-heading p { margin: 0; }
.evidence-heading h3 { color: #24364f; font-size: 16px; }
.evidence-heading p { margin-top: 4px; color: #8290a3; font-size: 12px; }
.evidence-heading > span { color: #65758d; font-size: 12px; font-weight: 650; }
.evidence-chain ol { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 20px 0 0; padding: 0; list-style: none; }
.evidence-chain li { position: relative; min-width: 0; padding-right: 12px; }
.evidence-chain li::before { position: absolute; top: 7px; right: 0; left: 15px; height: 1px; background: #cfd9e7; content: ''; }
.evidence-chain li:last-child::before { display: none; }
.evidence-chain i { position: relative; z-index: 1; display: block; width: 15px; height: 15px; border: 4px solid #fff; border-radius: 50%; background: #269073; box-shadow: 0 0 0 1px #8bc8b8; }
.evidence-chain li.failed i { background: #d85b67; box-shadow: 0 0 0 1px #e5a0a7; }
.evidence-chain li.pending i { background: #c8d0dc; box-shadow: 0 0 0 1px #d5dce6; }
.evidence-chain li > div { margin-top: 10px; padding-right: 8px; }
.evidence-chain b, .evidence-chain small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evidence-chain b { color: #31445f; font-size: 13px; }
.evidence-chain small { margin-top: 4px; color: #748399; font-size: 13px; }
.evidence-chain li.failed b { color: #bd4f5a; }
.execution-error { margin-top: 16px; padding: 14px 16px; border: 1px solid #fab6b6; border-radius: 4px; background: #fef0f0; color: #c45656; }
.execution-error p { margin: 6px 0 0; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.detail-toolbar { display: flex; align-items: center; justify-content: space-between; margin: 22px 0 12px; }
.detail-toolbar h3 { margin: 0; }
.detail-toolbar h3 small { color: #929cad; font-weight: 400; }
.segmented { display: flex; padding: 3px; border-radius: 4px; background: #f5f7fa; }
.segmented button { padding: 6px 14px; border: 0; border-radius: 3px; color: #606266; background: transparent; cursor: pointer; }
.segmented button.active { color: #2678d8; background: #fff; box-shadow: 0 1px 4px rgba(31, 55, 90, .12); }
.message-status-filter { display: flex; align-items: center; gap: 9px; }.message-status-filter > span { color: #65758b; font-size: 13px; font-weight: 650; white-space: nowrap; }
.message-table code { color: #536175; font-size: 14px; }
.inline-error { max-width: 320px; color: #d94848 !important; line-height: 1.5; }
.payload-title { margin: 20px 0 10px; }
.payload-empty { padding: 32px; border: 1px dashed #dcdfe6; border-radius: 4px; color: #909399; text-align: center; background: #fafafa; }
.execution-detail .evidence-chain { margin: 0; padding: 0; border: 0; background: transparent; }.execution-detail .evidence-heading { justify-content: flex-end; }.execution-detail .evidence-chain b { font-size: 14px; }.message-detail-page .code-block { max-height: 56vh; margin: 0; border-radius: 6px; font-size: 14px; line-height: 1.65; }
@media (max-width: 1100px) {
  .summary-grid { grid-template-columns: 1fr; }
  .execution-heading, .toolbar { align-items: stretch; flex-direction: column; }
  .execution-search { width: 100%; }
  .execution-overview, .message-metadata { grid-template-columns: 1fr 1fr; }
  .execution-table { min-width: 880px; }.execution-table .resource-col { width: 210px; }.execution-table .error-col, .execution-table .exception-column { display: none; }
}
@media (max-width: 600px) {
  .execution-overview, .message-metadata, .execution-time-audit { grid-template-columns: 1fr; }
  .execution-overview > div, .message-metadata > div, .execution-time-audit > div { border-right: 0; border-bottom: 1px solid #ebeef5; }
  .execution-overview > div:last-child, .message-metadata > div:last-child, .execution-time-audit > div:last-child { border-bottom: 0; }
  .detail-toolbar { align-items: stretch; flex-direction: column; gap: 10px; }
  .evidence-chain ol { grid-template-columns: 1fr; gap: 14px; }
  .evidence-chain li { display: grid; grid-template-columns: 18px 1fr; gap: 10px; }
  .evidence-chain li::before { top: 15px; bottom: -15px; left: 7px; width: 1px; height: auto; }
  .evidence-chain li > div { margin-top: 0; }
}
</style>
