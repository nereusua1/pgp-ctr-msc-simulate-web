import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const style = await readFile(new URL('../src/style.css', import.meta.url), 'utf8')
const overview = await readFile(new URL('../src/views/OverviewView.vue', import.meta.url), 'utf8')
const modal = await readFile(new URL('../src/components/AppModal.vue', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/api.js', import.meta.url), 'utf8')
const messageView = await readFile(new URL('../src/views/MessageManagementView.vue', import.meta.url), 'utf8')
const appView = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const taskView = await readFile(new URL('../src/views/TaskManagementView.vue', import.meta.url), 'utf8')
const dataItemView = await readFile(new URL('../src/views/DataItemManagementView.vue', import.meta.url), 'utf8')
const componentView = await readFile(new URL('../src/views/MessageComponentManagementView.vue', import.meta.url), 'utf8')
const icon = await readFile(new URL('../src/components/AppIcon.vue', import.meta.url), 'utf8')

test('数据列表采用可读的正文与辅助字号', () => {
  assert.match(style, /--type-body: 16px;/)
  assert.match(style, /--type-meta: 14px;/)
  assert.match(style, /body \.page \.data-table th \{[^}]*font-size: 14px;/s)
  assert.match(style, /body \.page \.data-table td \{[^}]*font-size: var\(--type-body\);/s)
  assert.match(style, /\.data-table td small \{[^}]*font-size: var\(--type-meta\);/s)
  assert.match(style, /\.data-table code \{[^}]*14px\/1\.6/s)
})

test('区块标题、列表主项与正文建立清晰字号层级', () => {
  assert.match(style, /--type-section-title: 19px;/)
  assert.match(style, /--type-list-title: 17px;/)
  assert.match(style, /\.card h2, \.card-heading h2 \{[^}]*font-size: var\(--type-section-title\);/s)
  assert.match(style, /\.card-heading p \{[^}]*font-size: 14px;/s)
  assert.match(overview, /\.task-link \{[^}]*font-size: 17px;[^}]*font-weight: 700;/s)
  assert.match(overview, /\.task-health-head, \.task-health-row \{/)
})

test('运行总览使用与页面一致的浅色状态面板', () => {
  const runtimeSummary = overview.match(/\.runtime-summary \{([^}]*)\}/s)?.[1] || ''
  assert.match(runtimeSummary, /background: linear-gradient\([^;]*#f9fbfe[^;]*#f0f5fc\)/)
  assert.doesNotMatch(runtimeSummary, /#15223d|#172b4d|#1b3550/)
})

test('可视化读取真实聚合接口并提供趋势与失败阶段', () => {
  assert.match(api, /getExecutionAnalytics.*\/executions\/analytics/)
  assert.match(overview, /\{\{ rangeLabel \}\}执行趋势/)
  assert.doesNotMatch(overview, /待处理异常/)
  assert.match(overview, /<svg[^>]*role="img"/)
})

test('总览第二阶段与第三阶段能力完整可见', () => {
  assert.match(overview, /MQ 投递分布/)
  assert.match(overview, /任务运行状态/)
  assert.match(overview, /failure-timeline/)
  assert.match(overview, /refresh-overview/)
  assert.match(overview, /filter-logs/)
  assert.match(overview, /24 小时/)
  assert.match(overview, /7 天/)
})

test('无执行数据时使用首次运行引导而不是空图表矩阵', () => {
  assert.match(overview, /const hasAnalyticsData = computed/)
  assert.match(overview, /v-if="hasAnalyticsData" class="primary-grid"/)
  assert.match(overview, /v-if="!hasAnalyticsData" class="card first-run-card"/)
  assert.match(overview, /运行一次任务，开始观察执行链路/)
  assert.match(overview, /\.overview-heading \{[^}]*padding-top: 2px;/s)
})

test('执行趋势图提供清晰的双轴与时间刻度', () => {
  assert.match(overview, /class="chart-axis"/)
  assert.match(overview, /class="volume-axis-labels"/)
  assert.match(overview, /class="rate-axis-labels"/)
  assert.match(overview, /class="x-axis-ticks"/)
  assert.match(overview, />投递量<\/text>/)
  assert.match(overview, />成功率<\/text>/)
  assert.match(overview, /const expectedTrendCount = computed\(\(\) => props\.analyticsRange === '7d' \? 7 : 24\)/)
  assert.match(overview, /return trend\.value\.map\(\(item, index\) =>/)
  assert.match(overview, /<text :x="tick\.x" y="191"/)
  assert.match(overview, /major: index % \(props\.analyticsRange === '7d' \? 1 : 4\) === 0/)
  assert.match(overview, /成功 \{\{ hoveredPoint\.success/)
  assert.match(overview, /失败 \{\{ hoveredPoint\.failed/)
})

test('顶栏和任务列表使用协调且清晰的字体层级', () => {
  assert.match(style, /\.breadcrumb \{[^}]*font-size: 14px;[^}]*font-weight: 500;/s)
  assert.match(style, /\.service-tag \{[^}]*font-size: 13px;[^}]*font-weight: 650;/s)
  assert.match(appView, /\.account-name \{[^}]*font-size: 14px;[^}]*font-weight: 650;/s)
  assert.match(appView, /\.logout-button \{[^}]*font-size: 13px;/s)
  assert.match(taskView, /class="[^"]*task-name-button[^"]*"/)
  assert.match(taskView, /\.task-table \.task-name-button \{[^}]*font-size: 16px;[^}]*font-weight: 650;/s)
  assert.match(taskView, /\.task-table \.related-message \{[^}]*font-size: 15px;/s)
  assert.match(taskView, /code\.schedule-value \{[^}]*font-size: 14px;/s)
})

test('所有管理列表统一字号层级并保留高亮蓝色主项', () => {
  assert.match(style, /--type-management-primary: 16px;/)
  assert.match(style, /--type-management-body: 15px;/)
  assert.match(style, /--type-management-technical: 14px;/)
  assert.match(style, /--management-link: #2d5fcf;/)
  assert.match(style, /\.management-primary \{[^}]*color: var\(--management-link\);/s)
  for (const view of [taskView, dataItemView, messageView, componentView]) {
    assert.match(view, /management-table/)
    assert.match(view, /management-primary/)
  }
  assert.match(taskView, /\.task-table \.task-name-button \{[^}]*color: var\(--management-link\);[^}]*font-size: 16px;/s)
  assert.match(dataItemView, /\.data-table td \{[^}]*font-size: 15px;/s)
  assert.match(messageView, /\.message-table td \{[^}]*font-size: 15px;/s)
  assert.match(componentView, /\.instance-name \{[^}]*color: var\(--management-link\);[^}]*font-size: 16px;/s)
  assert.match(style, /td\.management-body \{[^}]*font-size: var\(--type-management-body\);/s)
  assert.match(messageView, /class="management-body" :title="dataItemName\(item\)"/)
  assert.match(messageView, /class="management-body target-cell"/)
  assert.equal((dataItemView.match(/class="management-body"/g) || []).length, 2)
})

test('数据项详情使用扁平业务属性并移除低价值数据库字段', () => {
  assert.match(dataItemView, /<DetailHeader eyebrow="数据项"/)
  assert.match(dataItemView, /<DetailGrid v-if="elements\.length"/)
  assert.match(dataItemView, /<DetailSection title="要素项"/)
  assert.match(dataItemView, /class="element-directory"/)
  assert.match(dataItemView, /<span>要素项<\/span><span>要素项中文名称<\/span>/)
  assert.doesNotMatch(dataItemView, /class="element-card"|class="element-meta"/)
  assert.doesNotMatch(dataItemView, /element-count/)
  assert.doesNotMatch(dataItemView, /element-switcher|selectedElementIndex|element-identity|elementNames|elementCodes/)
  assert.doesNotMatch(dataItemView, /fieldGroups|身份与来源|时空与预报|投递与排序|分类与治理/)
  for (const removedField of ['dataClass', 'unit', 'spaceRatio', 'pushTime', 'timeType', 'topic', 'orderNum', 'elementItemOrderNum', 'defaultSourceFlag', 'validate', 'category', 'dataPronClass', 'effectiveFlag', 'manualAddFlag', 'assessFlag', 'showType', 'remark', 'elementBizDescription', 'elementBizEnum', 'updateTime']) {
    assert.doesNotMatch(dataItemView, new RegExp(`\\['${removedField}'`))
  }
})

test('抽屉进入和退出均使用克制动画', () => {
  assert.match(style, /drawer-in 240ms cubic-bezier/)
  assert.match(style, /drawer-out 160ms ease-in/)
  assert.match(style, /@keyframes backdrop-in/)
  assert.match(modal, /function requestClose\(\)/)
})

test('报文详情区分章节、正文与技术数据的字体角色', () => {
  assert.match(messageView, /class="message-detail unified-detail"/)
  assert.match(messageView, /class="detail-path"/)
  assert.match(messageView, /class="detail-format"/)
  assert.match(messageView, /<DetailSection title="数据关联"/)
  assert.match(messageView, /class="linked-elements-card"/)
  assert.match(messageView, /class="linked-elements-heading"><b>要素项<\/b>/)
  assert.doesNotMatch(messageView, /class="detail-chip-list"/)
  assert.match(messageView, /\.linked-elements-list \{[^}]*background: #fff;/s)
  assert.doesNotMatch(messageView, /\.linked-elements-list \{[^}]*gap: 1px;[^}]*background: #e8edf4;/s)
  assert.match(messageView, /<DetailSection title="报文原文"[^>]*collapsible/)
  assert.match(messageView, /\.message-detail \.detail-path[^}]*font: 600 14px/s)
  assert.match(messageView, /\.message-detail \.code-block \{[^}]*max-height: 320px;/s)
})

test('报文配置统一表单字号并支持未保存保护', () => {
  assert.match(style, /--type-form-label: 13px;/)
  assert.match(style, /--type-form-body: 14px;/)
  assert.match(style, /--control-height: 42px;/)
  assert.match(messageView, /const isEditorDirty = computed/)
  assert.match(messageView, /beforeunload/)
  assert.match(messageView, /confirmEditorClose/)
  assert.match(messageView, /:before-close="confirmEditorClose"/)
  assert.match(messageView, /@keydown="handleConfigurationTabKey/)
  assert.match(messageView, /@keydown="handleTargetTabKey/)
  assert.match(messageView, /role="tablist" aria-label="报文配置步骤"/)
  assert.match(messageView, /:aria-selected="activeTab === tab\[0\]"/)
})

test('总览趋势图强化坐标刻度并提供键盘可操作周期切换', () => {
  assert.match(overview, /<line v-for="tick in volumeAxisTicks"[^>]*:class="\{ zero: tick\.label === '0' \}"/)
  assert.match(overview, /\.chart-grid line\.zero \{[^}]*stroke-width: 1\.4;/s)
  assert.match(overview, /\.trend-chart text \{[^}]*font: 11\.5px/s)
  assert.match(overview, /handleRangeKeydown/)
  assert.match(overview, /:aria-pressed="analyticsRange === '24h'"/)
})

test('失败投递指标可进入失败执行日志', () => {
  assert.match(overview, /function openFailedDeliveries\(\)/)
  assert.match(overview, /emit\('filter-logs', \{ keyword: '', status: 'FAILED' \}\)/)
  assert.match(overview, /class="\{ alert: hasFailure, 'metric-action': hasFailure \}" role="button"/)
  assert.match(overview, /handleFailedMetricKey/)
})

test('状态反馈与线性图标语义完整', () => {
  assert.match(appView, /toast\.tone === 'error' \? 'alert' : 'status'/)
  assert.match(appView, /toast\.tone === 'error' \? 'assertive' : 'polite'/)
  assert.match(appView, /<strong>\{\{ toast\.title \}\}<\/strong>/)
  assert.match(icon, /back: \[/)
  assert.match(icon, /play: \[/)
  assert.doesNotMatch(taskView, /[＋▶←]/)
  assert.doesNotMatch(messageView, /[＋▶←]/)
  assert.doesNotMatch(componentView, /[＋▶←]/)
})
