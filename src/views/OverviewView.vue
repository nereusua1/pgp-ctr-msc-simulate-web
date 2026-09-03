<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { formatDateTime } from '../date-time.mjs'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  executions: { type: Array, default: () => [] },
  analytics: { type: Object, default: () => ({}) },
  analyticsRange: { type: String, default: '24h' },
  analyticsPending: Boolean
})
const emit = defineEmits(['navigate', 'task-action', 'open-execution', 'refresh-overview', 'filter-logs'])
const hoveredPoint = ref(null)

const rangeLabel = computed(() => props.analyticsRange === '7d' ? '最近 7 天' : '最近 24 小时')
const enabledCount = computed(() => props.tasks.filter(item => item.status === 'ENABLED').length)
const successRate = computed(() => Number(props.analytics?.messages || 0) ? Math.round(Number(props.analytics.success || 0) / Number(props.analytics.messages) * 1000) / 10 : null)
const hasAnalyticsData = computed(() => Number(props.analytics?.executions || 0) > 0 || Number(props.analytics?.messages || 0) > 0)
const hasFailure = computed(() => Number(props.analytics?.failed || 0) > 0)
const changeText = (current, previous, suffix = '%') => {
  if (!Number.isFinite(Number(previous)) || !Number.isFinite(Number(current))) return '较上一周期暂无数据'
  if (Number(previous) === 0) return Number(current) === 0 ? '较上一周期持平' : '较上一周期新增'
  const delta = Math.round((Number(current) - Number(previous)) / Math.abs(Number(previous)) * 1000) / 10
  return `${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} ${Math.abs(delta)}${suffix} 较上一周期`
}
const metricChange = key => {
  const previous = props.analytics?.previous || props.analytics?.comparison || {}
  const current = key === 'successRate' ? successRate.value : Number(props.analytics?.[key] || 0)
  const old = key === 'successRate' ? previous.successRate : previous[key]
  return changeText(current, old)
}
const health = computed(() => {
  if (!Number(props.analytics?.executions || 0)) return { tone: 'idle', label: '等待运行数据', description: `${rangeLabel.value}暂无执行批次，运行任务后将在这里展示链路健康情况。` }
  return hasFailure.value
    ? { tone: 'warning', label: '运行需关注', description: `${rangeLabel.value}发现 ${Number(props.analytics.failed).toLocaleString()} 条失败投递，建议优先处理最近异常。` }
    : { tone: 'healthy', label: '系统运行正常', description: `${rangeLabel.value}没有发现失败投递，任务与消息链路状态稳定。` }
})
const trend = computed(() => {
  const raw = Array.isArray(props.analytics?.trend) ? props.analytics.trend : []
  const expected = props.analyticsRange === '7d' ? 7 : 24
  if (raw.length >= expected) return raw.slice(-expected)
  const latest = raw[raw.length - 1]?.bucket
  const parsed = latest ? new Date(String(latest).replace(' ', 'T')) : new Date()
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const stepHours = props.analyticsRange === '7d' ? 24 : 1
  const values = new Map(raw.map(item => [String(item.bucket), item]))
  return Array.from({ length: expected }, (_, index) => {
    const pointDate = new Date(base)
    pointDate.setHours(pointDate.getHours() - stepHours * (expected - 1 - index))
    const pad = value => String(value).padStart(2, '0')
    const bucket = props.analyticsRange === '7d'
      ? `${pointDate.getFullYear()}-${pad(pointDate.getMonth() + 1)}-${pad(pointDate.getDate())}`
      : `${pointDate.getFullYear()}-${pad(pointDate.getMonth() + 1)}-${pad(pointDate.getDate())} ${pad(pointDate.getHours())}:00`
    return values.get(bucket) || { bucket, executions: 0, messages: 0, success: 0, failed: 0 }
  })
})
const chartPlot = { left: 64, right: 696, top: 28, bottom: 170, width: 632, height: 142 }
const maxMessages = computed(() => Math.max(0, ...trend.value.map(item => Number(item.messages || 0))))
const volumeAxisMax = computed(() => {
  if (!maxMessages.value) return 4
  const rawStep = maxMessages.value / 4
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return Math.max(4, niceStep * magnitude * 4)
})
const axisRatios = [1, .75, .5, .25, 0]
const volumeAxisTicks = computed(() => axisRatios.map(ratio => ({
  label: Math.round(volumeAxisMax.value * ratio).toLocaleString(),
  y: chartPlot.bottom - ratio * chartPlot.height
})))
const rateAxisTicks = axisRatios.map(ratio => ({ label: `${Math.round(ratio * 100)}%`, y: chartPlot.bottom - ratio * chartPlot.height }))
const chartPoints = computed(() => trend.value.map((item, index) => {
  const span = chartPlot.width / Math.max(1, trend.value.length)
  const volumeHeight = Number(item.messages || 0) / volumeAxisMax.value * chartPlot.height
  const rate = Number(item.messages || 0) ? Number(item.success || 0) / Number(item.messages) : null
  const lineX = chartPlot.left + index * span + span / 2
  return { ...item, x: chartPlot.left + index * span + span * .19, width: Math.max(4, span * .62), hitX: lineX - span / 2, hitWidth: span, y: chartPlot.bottom - volumeHeight, height: volumeHeight, lineX, lineY: rate == null ? null : chartPlot.bottom - rate * chartPlot.height, rate: rate == null ? null : Math.round(rate * 1000) / 10 }
}))
const successChartPoints = computed(() => chartPoints.value.filter(item => Number(item.messages || 0) > 0))
const successLine = computed(() => successChartPoints.value.map(item => `${item.lineX},${item.lineY}`).join(' '))
const successArea = computed(() => {
  if (!successChartPoints.value.length) return ''
  const points = successChartPoints.value
  return `${points[0].lineX},${chartPlot.bottom} ${points.map(item => `${item.lineX},${item.lineY}`).join(' ')} ${points[points.length - 1].lineX},${chartPlot.bottom}`
})
const expectedTrendCount = computed(() => props.analyticsRange === '7d' ? 7 : 24)
const bucketLabel = bucket => {
  if (props.analyticsRange === '7d') return String(bucket || '').slice(5)
  const hour = String(bucket || '').slice(11, 13)
  return hour ? `${hour}时` : String(bucket || '')
}
const xAxisTicks = computed(() => {
  const length = trend.value.length
  if (!length) return []
  const span = chartPlot.width / length
  return trend.value.map((item, index) => ({
    bucket: item.bucket,
    label: bucketLabel(item.bucket),
    showLabel: true,
    major: index % (props.analyticsRange === '7d' ? 1 : 4) === 0,
    x: chartPlot.left + index * span + span / 2
  }))
})
function handleRangeKeydown(event, range) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const nextRange = event.key === 'Home' || event.key === 'ArrowLeft' ? '24h' : '7d'
  if (nextRange !== range) emit('refresh-overview', nextRange)
  requestAnimationFrame(() => document.querySelector(`[data-range="${nextRange}"]`)?.focus())
}
function openFailedDeliveries() {
  if (!Number(props.analytics?.failed || 0)) return
  emit('filter-logs', { keyword: '', status: 'FAILED' })
}
function handleFailedMetricKey(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openFailedDeliveries()
}
const setHoveredPoint = item => { hoveredPoint.value = item }
const clearHoveredPoint = () => { hoveredPoint.value = null }
const mqRows = computed(() => (props.analytics?.mqDistribution || []).slice(0, 6).map(item => {
  const total = Number(item.success || 0) + Number(item.failed || 0)
  return { ...item, total, rate: total ? Math.round(Number(item.success || 0) / total * 1000) / 10 : null }
}))
const maxMq = computed(() => Math.max(1, ...mqRows.value.map(item => item.total)))
const mqSummary = computed(() => mqRows.value.reduce((summary, item) => ({ total: summary.total + item.total, success: summary.success + Number(item.success || 0), failed: summary.failed + Number(item.failed || 0) }), { total: 0, success: 0, failed: 0 }))
const recentExecutions = computed(() => props.executions.slice(0, mqRows.value.length <= 1 ? 3 : mqRows.value.length === 2 ? 4 : 5))
const taskTrendMap = computed(() => {
  const grouped = new Map()
  ;(props.analytics?.taskTrends || []).forEach(point => {
    if (!grouped.has(point.taskId)) grouped.set(point.taskId, [])
    grouped.get(point.taskId).push(point)
  })
  return grouped
})
const overviewTasks = computed(() => props.tasks.slice(0, 6).map(task => {
  const points = taskTrendMap.value.get(task.id) || []
  const latest = points[points.length - 1]
  return { ...task, points, latest }
}))
const sparkPoints = points => {
  if (!points.length) return ''
  return points.map((point, index) => {
    const x = 5 + index * (90 / Math.max(1, points.length - 1))
    const y = point.status === 'SUCCESS' ? 9 : (point.status === 'PARTIAL_SUCCESS' ? 17 : 25)
    return `${x},${y}`
  }).join(' ')
}
</script>

<template>
  <main class="page overview-page">
    <div class="page-heading overview-heading">
      <div><h1>运行总览</h1><p>统一查看任务运行、投递质量与异常情况。</p><div class="overview-meta"><span>统计范围：{{ rangeLabel }}</span><span>{{ analytics?.generatedAt ? `数据更新于 ${formatDateTime(analytics.generatedAt)}` : '数据尚未刷新' }}</span></div></div>
      <div class="overview-controls">
        <div class="range-control"><span>统计周期</span><div class="range-switch" role="group" aria-label="统计时间范围">
          <button data-range="24h" :aria-pressed="analyticsRange === '24h'" :class="{ active: analyticsRange === '24h' }" @click="emit('refresh-overview', '24h')" @keydown="handleRangeKeydown($event, '24h')">24 小时</button>
          <button data-range="7d" :aria-pressed="analyticsRange === '7d'" :class="{ active: analyticsRange === '7d' }" @click="emit('refresh-overview', '7d')" @keydown="handleRangeKeydown($event, '7d')">7 天</button>
        </div></div>
        <button class="button secondary refresh-button" :disabled="analyticsPending" @click="emit('refresh-overview', analyticsRange)"><AppIcon name="refresh" :size="16" />{{ analyticsPending ? '刷新中…' : '刷新数据' }}</button>
        <small class="refreshed-at">{{ analytics?.generatedAt ? `更新于 ${formatDateTime(analytics.generatedAt)}` : '尚未刷新' }}</small>
      </div>
    </div>

    <section class="runtime-summary" :class="health.tone" aria-label="运行健康状态">
      <div class="health-message"><span class="health-dot"></span><div><h2>{{ health.label }}</h2><p>{{ health.description }}</p></div><button class="text-link" @click="emit('navigate', 'logs')">查看执行日志 <AppIcon name="arrow" :size="14" /></button></div>
      <dl class="runtime-metrics">
        <div><dt>启用任务</dt><dd>{{ enabledCount }}</dd><small>共 {{ tasks.length }} 个任务</small><small class="metric-change">{{ metricChange('enabledTasks') }}</small></div>
        <div><dt>执行批次</dt><dd>{{ Number(analytics?.executions || 0).toLocaleString() }}</dd><small>{{ rangeLabel }}</small><small class="metric-change">{{ metricChange('executions') }}</small></div>
        <div><dt>投递成功率</dt><dd>{{ successRate == null ? '—' : successRate }}<em v-if="successRate != null">%</em></dd><small>{{ Number(analytics?.messages || 0).toLocaleString() }} 条目标投递</small><small class="metric-change">{{ metricChange('successRate') }}</small></div>
        <div :class="{ alert: hasFailure, 'metric-action': hasFailure }" role="button" :tabindex="hasFailure ? 0 : -1" :aria-label="hasFailure ? `查看 ${analytics.failed} 条失败投递` : '当前无失败投递'" @click="openFailedDeliveries" @keydown="handleFailedMetricKey"><dt>失败投递</dt><dd>{{ Number(analytics?.failed || 0).toLocaleString() }}</dd><small>{{ hasFailure ? '点击查看失败记录' : '当前无异常' }}</small><small class="metric-change">{{ metricChange('failed') }}</small></div>
      </dl>
    </section>

    <section v-if="hasAnalyticsData" class="primary-grid">
      <article class="card trend-card">
        <div class="card-heading"><div><h2>{{ rangeLabel }}执行趋势</h2><p>报文量与投递成功率使用相同统计窗口；悬停查看具体时点。</p></div><span class="chart-period">{{ expectedTrendCount }} 个时间刻度</span></div>
        <div v-if="trend.length" class="trend-chart">
          <svg viewBox="0 0 760 216" role="img" :aria-label="`${rangeLabel}执行量和成功率趋势`">
            <defs><linearGradient id="success-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3970dc" stop-opacity=".16" /><stop offset="100%" stop-color="#3970dc" stop-opacity="0" /></linearGradient></defs>
            <title>{{ rangeLabel }}执行趋势</title>
            <desc>柱形使用左侧投递量坐标轴，折线使用右侧成功率坐标轴。</desc>
            <text class="axis-title volume-title" :x="chartPlot.left" y="14">投递量</text>
            <text class="axis-title rate-title" :x="chartPlot.right" y="14" text-anchor="end">成功率</text>
            <g class="chart-grid"><line v-for="tick in volumeAxisTicks" :key="tick.y" :class="{ zero: tick.label === '0' }" :x1="chartPlot.left" :y1="tick.y" :x2="chartPlot.right" :y2="tick.y" /></g>
            <g class="chart-axis"><line :x1="chartPlot.left" :y1="chartPlot.top" :x2="chartPlot.left" :y2="chartPlot.bottom" /><line :x1="chartPlot.right" :y1="chartPlot.top" :x2="chartPlot.right" :y2="chartPlot.bottom" /><line :x1="chartPlot.left" :y1="chartPlot.bottom" :x2="chartPlot.right" :y2="chartPlot.bottom" /></g>
            <g class="volume-axis-labels"><text v-for="tick in volumeAxisTicks" :key="`volume-${tick.y}`" :x="chartPlot.left - 10" :y="tick.y + 3" text-anchor="end">{{ tick.label }}</text></g>
            <g class="rate-axis-labels"><text v-for="tick in rateAxisTicks" :key="`rate-${tick.y}`" :x="chartPlot.right + 10" :y="tick.y + 3">{{ tick.label }}</text></g>
            <g v-if="hoveredPoint" class="chart-hover"><line :x1="hoveredPoint.lineX" :x2="hoveredPoint.lineX" :y1="chartPlot.top" :y2="chartPlot.bottom" /><rect :x="Math.min(hoveredPoint.lineX + 10, chartPlot.right - 174)" y="30" width="164" height="96" rx="8" /><text :x="Math.min(hoveredPoint.lineX + 20, chartPlot.right - 164)" y="49">{{ hoveredPoint.bucket }}</text><text :x="Math.min(hoveredPoint.lineX + 20, chartPlot.right - 164)" y="67">执行批次：{{ hoveredPoint.executions }}</text><text :x="Math.min(hoveredPoint.lineX + 20, chartPlot.right - 164)" y="84">目标投递：{{ hoveredPoint.messages }}</text><text :x="Math.min(hoveredPoint.lineX + 20, chartPlot.right - 164)" y="101">成功 {{ hoveredPoint.success || 0 }} · 失败 {{ hoveredPoint.failed || 0 }}</text><text :x="Math.min(hoveredPoint.lineX + 20, chartPlot.right - 164)" y="118">成功率：{{ hoveredPoint.rate == null ? '—' : `${hoveredPoint.rate}%` }}</text></g>
            <g class="chart-bars"><g v-for="item in chartPoints" :key="item.bucket"><rect class="chart-hit" :x="item.hitX" :y="chartPlot.top" :width="item.hitWidth" :height="chartPlot.height" @mouseenter="setHoveredPoint(item)" @mouseleave="clearHoveredPoint" @focus="setHoveredPoint(item)" tabindex="0" :aria-label="`${item.bucket}，投递 ${item.messages}，成功率 ${item.rate == null ? '—' : `${item.rate}%`}`" /><rect class="chart-bar" :x="item.x" :y="item.y" :width="item.width" :height="Math.max(1, item.height)" rx="3"><title>{{ item.bucket }}：{{ item.executions }} 个批次，{{ item.messages }} 条投递，成功率 {{ item.rate == null ? '—' : `${item.rate}%` }}</title></rect></g></g>
            <polygon v-if="successArea" class="success-area" :points="successArea" />
            <polyline v-if="successLine" class="success-line" :points="successLine" />
            <g class="success-points"><circle v-for="item in successChartPoints" :key="`point-${item.bucket}`" :cx="item.lineX" :cy="item.lineY" r="3"><title>{{ item.bucket }} 成功率 {{ item.rate }}%</title></circle></g>
            <g class="x-axis-ticks"><g v-for="tick in xAxisTicks" :key="tick.bucket" :class="{ major: tick.major }"><title>{{ tick.bucket }}</title><line :x1="tick.x" :y1="chartPlot.bottom" :x2="tick.x" :y2="chartPlot.bottom + (tick.major ? 7 : 4)" /><text :x="tick.x" y="191" text-anchor="middle">{{ tick.label }}</text></g></g>
          </svg>
          <div class="chart-legend"><span class="bar-key">目标投递量</span><span class="line-key">成功率</span></div>
        </div>
        <div v-else class="chart-empty">{{ rangeLabel }}暂无执行数据。</div>
      </article>

    </section>

    <section v-if="hasAnalyticsData" class="secondary-grid">
      <article class="card mq-card">
        <div class="card-heading"><div><h2>MQ 投递分布</h2><p>比较各实例的真实成功与失败投递量。</p></div><span class="chart-period">{{ mqRows.length }} 个实例</span></div>
        <div v-if="mqRows.length" class="mq-list">
          <div class="mq-summary"><div><span>总投递</span><b>{{ mqSummary.total.toLocaleString() }}</b></div><div><span>成功</span><b class="success-number">{{ mqSummary.success.toLocaleString() }}</b></div><div><span>失败</span><b class="failure-number">{{ mqSummary.failed.toLocaleString() }}</b></div></div>
          <button v-for="item in mqRows" :key="item.instance" @click="emit('filter-logs', { keyword: item.instance, status: 'ALL' })"><span class="mq-name">{{ item.instance }}</span><span class="mq-track"><i class="mq-success" :style="{ width: `${Number(item.success) / maxMq * 100}%` }"></i><i class="mq-failed" :style="{ width: `${Number(item.failed) / maxMq * 100}%` }"></i></span><span class="mq-stats"><b>{{ item.rate == null ? '—' : `${item.rate}%` }}</b><small>{{ item.total.toLocaleString() }} 条 · 失败 {{ item.failed || 0 }}</small></span></button>
          <div class="chart-legend"><span class="success-key">成功</span><span class="failure-key">失败</span></div>
        </div><div v-else class="chart-empty">当前窗口暂无 MQ 投递记录。</div>
      </article>
      <article class="card recent-card">
        <div class="card-heading"><div><h2>最近执行</h2><p>按时间查看最新批次与运行结果。</p></div><button class="text-link" @click="emit('navigate', 'logs')">全部记录 <AppIcon name="arrow" :size="14" /></button></div>
        <div v-if="recentExecutions.length" class="recent-list"><button v-for="item in recentExecutions" :key="item.id" @click="emit('open-execution', item.id)"><time>{{ formatDateTime(item.startedAt) }}</time><span><b>{{ item.taskName || '未关联任务' }}</b><small>{{ item.id }}</small></span><StatusBadge :status="item.status" /></button></div>
        <div v-else class="chart-empty">还没有执行记录。</div>
      </article>
    </section>

    <section v-if="!hasAnalyticsData" class="card first-run-card" aria-label="首次运行引导">
      <div class="first-run-copy">
        <span class="first-run-mark"><AppIcon name="bolt" :size="20" /></span>
        <div><h2>运行一次任务，开始观察执行链路</h2><p>当前有 {{ tasks.length }} 个任务，其中 {{ enabledCount }} 个已启用。首次执行后，这里会展示投递趋势、MQ 分布和异常定位信息。</p></div>
        <div class="first-run-actions"><button class="button primary" @click="emit('navigate', 'tasks')">前往任务管理</button><button class="button secondary" @click="emit('navigate', 'logs')">查看执行日志</button></div>
      </div>
      <ol class="execution-path" aria-label="首次执行步骤">
        <li class="ready"><i>1</i><span><b>检查任务配置</b><small>{{ tasks.length ? `已创建 ${tasks.length} 个任务` : '需要先创建任务' }}</small></span></li>
        <li :class="{ ready: enabledCount }"><i>2</i><span><b>启用并执行</b><small>{{ enabledCount ? `${enabledCount} 个任务可运行` : '等待启用任务' }}</small></span></li>
        <li><i>3</i><span><b>查看执行结果</b><small>等待首次执行数据</small></span></li>
      </ol>
    </section>

    <section class="card task-health-card">
      <div class="card-heading"><div><h2>任务运行状态</h2><p>以最近十次执行趋势替代复杂配置列，快速识别不稳定任务。</p></div><button class="text-link" @click="emit('navigate', 'tasks')">任务管理 <AppIcon name="arrow" :size="14" /></button></div>
      <div class="task-health-head"><span>任务</span><span>任务状态</span><span>最近执行</span><span>执行趋势</span><span></span></div>
      <div v-if="overviewTasks.length" class="task-health-list">
        <div v-for="task in overviewTasks" :key="task.id" class="task-health-row"><button class="task-link" @click="emit('task-action', task)">{{ task.name }}<small>{{ task.code || task.id }}</small></button><StatusBadge :status="task.status" /><span class="latest-run"><StatusBadge v-if="task.latest" :status="task.latest.status" /><small>{{ task.latest ? formatDateTime(task.latest.startedAt) : '暂无执行' }}</small></span><div class="sparkline"><svg v-if="task.points.length" viewBox="0 0 100 34" role="img" :aria-label="`${task.name}最近执行趋势`"><polyline :points="sparkPoints(task.points)" /><circle v-for="(point, index) in task.points" :key="point.executionId" :cx="5 + index * (90 / Math.max(1, task.points.length - 1))" :cy="point.status === 'SUCCESS' ? 9 : (point.status === 'PARTIAL_SUCCESS' ? 17 : 25)" r="3" :class="point.status.toLowerCase()"><title>{{ formatDateTime(point.startedAt) }} · {{ point.status }}</title></circle></svg><span v-else>暂无趋势</span></div><button class="link-button" @click="emit('task-action', task)">查看</button></div>
      </div><div v-else class="chart-empty">后端尚无任务数据。</div>
    </section>
  </main>
</template>

<style scoped>
.overview-page { display: grid; gap: 18px; padding-bottom: 44px; }
.overview-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 2px; padding-top: 2px; }
.overview-controls { display: flex; align-items: center; gap: 10px; }
.range-control { display: flex; align-items: center; gap: 8px; }.range-control > span { color: #65758b; font-size: 13px; font-weight: 650; }
.range-switch { display: flex; padding: 3px; border: 1px solid #dce3ed; border-radius: 9px; background: #f4f6f9; }
.range-switch button { min-width: 70px; padding: 7px 12px; border: 0; border-radius: 6px; color: #6e7d91; background: transparent; font-weight: 650; }
.range-switch button.active { color: #2f5fc6; background: #fff; box-shadow: 0 1px 4px #25385318; }
.refresh-button { display: inline-flex; align-items: center; gap: 7px; }
.refreshed-at { color: #8995a6; font-size: 12px; }
.runtime-summary { overflow: hidden; border: 1px solid #dbe4ef; border-radius: 16px; background: linear-gradient(110deg, #f9fbfe, #f0f5fc); box-shadow: 0 10px 26px #2238580a; }
.health-message { display: flex; align-items: center; gap: 13px; padding: 17px 24px; border-bottom: 1px solid #dfe7f1; }
.health-dot { width: 10px; height: 10px; border-radius: 50%; background: #289475; box-shadow: 0 0 0 5px #28947516; }
.warning .health-dot { background: #c7833d; box-shadow: 0 0 0 5px #c7833d17; }
.idle .health-dot { background: #8795a8; box-shadow: 0 0 0 5px #8795a816; }
.health-message div { min-width: 0; flex: 1; }
.health-message h2 { margin: 0; color: #243850; font-size: 18px; }
.health-message p { margin: 4px 0 0; color: #718096; font-size: 14px; }
.health-message .text-link { display: inline-flex; align-items: center; gap: 5px; }
.runtime-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 19px 8px 20px; }
.runtime-metrics > div { padding: 0 24px; border-left: 1px solid #dce5ef; }
.runtime-metrics > div:first-child { border-left: 0; }
.runtime-metrics dt { color: #6f7e93; font-size: 13px; }
.runtime-metrics dd { margin: 5px 0 2px; color: #233952; font-size: 30px; font-weight: 740; letter-spacing: -.04em; }
.runtime-metrics dd em { margin-left: 2px; font-size: 17px; font-style: normal; }
.runtime-metrics small { color: #8995a6; font-size: 12px; }
.runtime-metrics .alert dd, .runtime-metrics .alert small { color: #bf5b65; }
.runtime-metrics .metric-action { cursor: pointer; border-radius: 10px; transition: background .18s, box-shadow .18s; }
.runtime-metrics .metric-action:hover { background: #fff5f5; }
.runtime-metrics .metric-action:focus-visible { outline: 2px solid #3970dc; outline-offset: 3px; box-shadow: 0 0 0 4px #3970dc1f; }
.runtime-summary.idle .health-message { padding-top: 14px; padding-bottom: 14px; }
.runtime-summary.idle .runtime-metrics { padding-top: 15px; padding-bottom: 16px; }
.primary-grid, .secondary-grid { display: grid; gap: 20px; }
.primary-grid { grid-template-columns: minmax(0, 1fr); }
.secondary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.card { min-width: 0; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 21px 23px 15px; }
.card-heading h2, .card-heading p { margin: 0; }
.card-heading p { margin-top: 5px; }
.chart-period, .attention-count { flex: 0 0 auto; padding: 5px 9px; border-radius: 999px; color: #6c7b90; background: #f1f4f8; font-size: 12px; font-weight: 650; }
.attention-count { color: #b55460; background: #fff0f1; }
.trend-chart { padding: 0 20px 15px; }
.trend-chart svg { display: block; width: 100%; height: 286px; }
.chart-grid line { stroke: #e3e9f2; stroke-width: 1; stroke-dasharray: 3 5; }
.chart-grid line.zero { stroke: #9cabbc; stroke-width: 1.4; stroke-dasharray: none; }
.chart-axis line { stroke: #aebccc; stroke-width: 1.3; }
.chart-grid + .chart-bars rect, .chart-bars rect { fill: #cbd9f5; opacity: .78; }
.chart-bars .chart-hit { fill: transparent; opacity: 0; cursor: crosshair; }.chart-bars .chart-bar { pointer-events: none; }
.success-area { fill: url(#success-area-gradient); }
.chart-hover { pointer-events: none; }.chart-hover line { stroke: #7d92b1; stroke-width: 1; stroke-dasharray: 3 3; }.chart-hover rect { fill: #1f3150; opacity: .96; }.chart-hover text { fill: #fff; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 10px; }
.success-line { fill: none; stroke: #2f67d4; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
.success-points circle { fill: #fff; stroke: #2f67d4; stroke-width: 2.4; }
.trend-chart text { fill: #65758b; font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace; }
.trend-chart .axis-title { font-family: inherit; font-size: 12px; font-weight: 750; }.trend-chart .volume-title { fill: #52647a; }.trend-chart .rate-title { fill: #2d5fcf; }
.volume-axis-labels text { fill: #52647a; }.rate-axis-labels text { fill: #2d5fcf; }
.x-axis-ticks line { stroke: #cbd4df; stroke-width: 1; }
.x-axis-ticks .major line { stroke: #7186a0; stroke-width: 1.6; }.x-axis-ticks .major text { fill: #314967; font-size: 10.5px; font-weight: 800; }
.x-axis-ticks text { fill: #667991; font-size: 9.5px; font-weight: 650; }
.overview-meta { display: flex; gap: 14px; margin-top: 8px; color: #8190a4; font-size: 12px; }.overview-meta span + span { padding-left: 14px; border-left: 1px solid #d9e1ec; }.metric-change { display: block; margin-top: 3px; color: #7c8ca1 !important; font-size: 11px !important; }
.chart-legend { display: flex; justify-content: center; gap: 20px; color: #77859a; font-size: 12px; }
.chart-legend span::before { display: inline-block; width: 9px; height: 9px; margin-right: 6px; border-radius: 3px; content: ''; }
.bar-key::before { background: #dbe5fb; }.line-key::before { height: 2px !important; background: #3970dc; vertical-align: 3px; }
.chart-empty, .calm-state { display: grid; min-height: 150px; place-items: center; color: #8793a5; font-size: 14px; }
.action-card { display: flex; flex-direction: column; }
.failure-timeline { padding: 0 20px; }
.failure-timeline button { position: relative; display: grid; width: 100%; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 10px; padding: 11px 0; border: 0; border-bottom: 1px solid #edf1f5; text-align: left; background: transparent; }
.failure-timeline i { width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #d2636d; box-shadow: 0 0 0 4px #d2636d12; }
.failure-timeline span b, .failure-timeline span small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.failure-timeline span b { color: #33465e; font-size: 14px; }.failure-timeline span small { margin-top: 4px; color: #8995a6; font-size: 12px; }
.calm-state { min-height: 180px; align-content: center; gap: 7px; }.calm-state svg { color: #319174; }.calm-state b { color: #40536b; }.calm-state span { font-size: 12px; }
.stage-summary { margin-top: auto; padding: 14px 20px 18px; border-top: 1px solid #edf1f5; }
.stage-summary h3 { margin: 0 0 8px; color: #53647a; font-size: 13px; }
.stage-summary button { display: grid; width: 100%; grid-template-columns: minmax(100px, 1fr) 1.25fr 28px; align-items: center; gap: 10px; padding: 5px 0; border: 0; color: #65758b; text-align: left; background: transparent; font-size: 12px; }
.stage-summary button > i { height: 5px; overflow: hidden; border-radius: 5px; background: #f1f3f6; }.stage-summary em { display: block; height: 100%; border-radius: inherit; background: #dd8b91; }
.mq-list { padding: 3px 22px 18px; }.mq-list > button { display: grid; width: 100%; grid-template-columns: 135px minmax(0, 1fr) 150px; align-items: center; gap: 12px; padding: 10px 0; border: 0; color: #506178; text-align: left; background: transparent; }.mq-stats { display: grid; justify-items: end; gap: 2px; }.mq-stats b { color: #2f67d4; font-size: 14px; }.mq-stats small { color: #8995a6; font-size: 11px; }
.mq-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 4px 0 8px; padding: 12px 14px; border: 1px solid #e2e8f1; border-radius: 10px; background: #f8faff; }.mq-summary div { display: grid; gap: 3px; }.mq-summary div + div { padding-left: 12px; border-left: 1px solid #e1e7f0; }.mq-summary span { color: #8492a6; font-size: 11px; }.mq-summary b { color: #2f4765; font-size: 18px; }.mq-summary .success-number { color: #3a947b; }.mq-summary .failure-number { color: #c15f69; }
.mq-name { overflow: hidden; font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }.mq-track { display: flex; height: 9px; overflow: hidden; border-radius: 6px; background: #edf1f5; }.mq-track i { height: 100%; }.mq-success { background: #5aa98f; }.mq-failed { background: #d8757c; }.mq-list b { text-align: right; }
.success-key::before { background: #5aa98f; }.failure-key::before { background: #d8757c; }
.recent-list { padding: 0 22px 16px; }.recent-list button { display: grid; width: 100%; grid-template-columns: 132px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 12px 0; border: 0; border-bottom: 1px solid #edf1f5; text-align: left; background: transparent; }
.recent-list time { color: #77869b; font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; }.recent-list span b, .recent-list span small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.recent-list span b { color: #33475f; font-size: 14px; }.recent-list span small { margin-top: 4px; color: #929dac; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.task-health-card { overflow: hidden; }.task-health-head, .task-health-row { display: grid; grid-template-columns: minmax(220px, 1.5fr) 125px 200px 160px 52px; align-items: center; gap: 16px; padding-right: 23px; padding-left: 23px; }
.task-health-head { min-height: 42px; color: #78869a; background: #f7f9fb; font-size: 13px; font-weight: 650; }.task-health-row { min-height: 76px; border-top: 1px solid #edf1f5; }
.task-link { border: 0; color: #293e58; text-align: left; background: transparent; font-size: 17px; font-weight: 700; }.task-link small { display: block; margin-top: 5px; color: #8b97a8; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.latest-run { display: flex; align-items: center; gap: 8px; }.latest-run small { color: #8491a3; font-size: 12px; }.sparkline svg { display: block; width: 110px; height: 35px; }.sparkline polyline { fill: none; stroke: #aab8c9; stroke-width: 1.5; }.sparkline circle { fill: #37a17d; }.sparkline circle.failed { fill: #d35e68; }.sparkline circle.partial_success { fill: #c68a42; }.sparkline > span { color: #9aa4b3; font-size: 12px; }
.first-run-card { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(420px, .85fr); min-height: 232px; overflow: hidden; }
.first-run-copy { display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: center; gap: 0 16px; padding: 31px 34px; }
.first-run-mark { display: grid; width: 44px; height: 44px; grid-row: 1 / span 2; place-items: center; border-radius: 13px; color: #3567d0; background: #edf2ff; }
.first-run-copy h2 { margin: 1px 0 7px; color: #263b55; font-size: 21px; letter-spacing: -.025em; }
.first-run-copy p { max-width: 650px; margin: 0; color: #718096; font-size: 14px; line-height: 1.75; }
.first-run-actions { display: flex; grid-column: 2; gap: 10px; margin-top: 19px; }
.execution-path { position: relative; display: grid; align-content: center; gap: 0; margin: 0; padding: 24px 34px 24px 43px; border-left: 1px solid #e3e9f1; background: #f8fafc; list-style: none; }
.execution-path li { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 12px; min-height: 54px; color: #8995a5; }
.execution-path li:not(:last-child)::after { position: absolute; top: 39px; bottom: -15px; left: 14px; width: 1px; background: #dce4ee; content: ''; }
.execution-path i { position: relative; z-index: 1; display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid #d6dee9; border-radius: 50%; background: #fff; font-size: 12px; font-style: normal; font-weight: 750; }
.execution-path b, .execution-path small { display: block; }.execution-path b { color: #53647a; font-size: 14px; }.execution-path small { margin-top: 3px; font-size: 12px; }
.execution-path li.ready i { border-color: #a9c0ef; color: #315fc2; background: #eef3ff; }.execution-path li.ready b { color: #30465f; }
button { cursor: pointer; }button:disabled { cursor: wait; opacity: .65; }
@media (max-width: 1180px) { .overview-heading { align-items: flex-start; flex-direction: column; }.primary-grid, .secondary-grid { grid-template-columns: 1fr; }.first-run-card { grid-template-columns: 1fr; }.execution-path { grid-template-columns: repeat(3, 1fr); gap: 16px; border-top: 1px solid #e3e9f1; border-left: 0; }.execution-path li { grid-template-columns: 30px 1fr; }.execution-path li::after { display: none; }.task-health-head { display: none; }.task-health-row { grid-template-columns: minmax(200px, 1fr) 120px 180px 140px 48px; } }
@media (max-width: 760px) { .overview-controls { flex-wrap: wrap; }.runtime-metrics { grid-template-columns: repeat(2, 1fr); row-gap: 20px; }.runtime-metrics > div:nth-child(3) { border-left: 0; }.health-message { align-items: flex-start; flex-wrap: wrap; }.first-run-copy { padding: 24px 20px; }.first-run-actions { grid-column: 1 / -1; }.execution-path { grid-template-columns: 1fr; padding: 20px; }.task-health-row { grid-template-columns: 1fr auto; padding: 16px 18px; }.latest-run, .sparkline { grid-column: 1 / -1; }.recent-list button { grid-template-columns: 1fr auto; }.recent-list time { grid-column: 1 / -1; } }
</style>
