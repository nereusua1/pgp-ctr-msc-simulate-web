import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
const app = await read('App.vue')
const api = await read('api.js')
const modal = await read('components/AppModal.vue')
const task = await read('views/TaskManagementView.vue')
const message = await read('views/MessageManagementView.vue')
const fileRule = await read('views/FileRuleTemplateView.vue')
const dataItem = await read('views/DataItemManagementView.vue')
const component = await read('views/MessageComponentManagementView.vue')
const execution = await read('views/ExecutionLogView.vue')

test('任务详情从独立后端接口读取完整统计口径', () => {
  assert.match(api, /getTaskExecutionOverview/)
  assert.match(app, /load-task-execution-overview/)
  assert.match(task, /load-task-execution-overview/)
  assert.doesNotMatch(task, /props\.executions\.filter\(item => item\.taskId/)
})

test('数据项公共属性不再静默取第一条要素', () => {
  assert.doesNotMatch(dataItem, /elements\.value\[0\]/)
  assert.match(dataItem, /各要素配置不同/)
  assert.match(dataItem, /detailError/)
  assert.match(dataItem, /重新加载/)
})

test('执行与报文明细在独立详情页内切换', () => {
  assert.equal((execution.match(/<AppDetailPage/g) || []).length, 1)
  assert.equal((execution.match(/<AppModal/g) || []).length, 0)
  assert.match(execution, /detailMessage \? `实际投递报文/)
  assert.match(execution, /返回执行详情/)
})

test('详情页复用统一的资源摘要和内容分区', () => {
  for (const view of [task, message, dataItem, component, execution]) {
    assert.match(view, /DetailHeader/)
    assert.match(view, /DetailSection/)
  }
  assert.match(component, /CopyValue/)
  assert.doesNotMatch(component, /\.detail-summary span \{[^}]*font-size: 12px/s)
})

test('抽屉锁定键盘焦点并在关闭后恢复触发位置', () => {
  assert.match(modal, /previousFocus/)
  assert.match(modal, /event\.key === 'Tab'/)
  assert.match(modal, /previousFocus\?\.focus/)
  assert.match(modal, /aria-labelledby/)
})

test('报文按三要素自动带出文件规则且时间说明集中位于映射列表下方', () => {
  assert.match(message, /按数据源、数据项和完整要素集合自动匹配/)
  assert.match(message, /autoApplyMatchedFileRuleTemplate/)
  assert.doesNotMatch(message, /FILE_RULE_PRESETS|selectedFilePresetId|应用所选规则/)
  assert.doesNotMatch(message, /time-source-reference/)
  assert.match(message, /class="binding-help"><b>生成方式说明<\/b>/)
  assert.doesNotMatch(message, /timeBindingOf\(field\.path\) \? timeStrategyDescription/)
  assert.match(fileRule, /class="rule-source-guide"><b>时间来源说明<\/b>/)
  assert.doesNotMatch(fileRule, /fileTimeSourceDescription\(binding\.source\)/)
  const rulesPanel = fileRule.slice(fileRule.indexOf('id="file-rule-step-rules"'), fileRule.indexOf('<template #footer><span class="save-hint">'))
  const guidePosition = rulesPanel.indexOf('class="rule-source-guide"')
  assert.ok(guidePosition > rulesPanel.indexOf('class="rule-list content-rule-list"'))
  assert.equal((rulesPanel.match(/fileTimeSourceDescription\(/g) || []).length, 1)
  assert.equal((rulesPanel.match(/class="rule-source-guide"/g) || []).length, 1)
})

test('文件规则模板支持逐步保存与前后导航', () => {
  assert.doesNotMatch(message, /<h3>文件名时间<\/h3>|<h3>文件内容时间<\/h3>|@click="addFileNameBinding"|@click="addContentBinding"/)
  assert.match(message, /时间替换规则由文件规则模板统一维护/)
  assert.match(fileRule, /function saveAndNext\(\)/)
  assert.match(fileRule, />返回上一步<\/button>/)
  assert.match(fileRule, /保存并下一步/)
  assert.match(fileRule, /submit\('DRAFT', \(\) => moveStep\(1\)\)/)
})

test('无文件规则模板引用时残留内联规则不能通过配置检查', () => {
  const validation = message.slice(message.indexOf('function hasMatchedFileRuleTemplate()'), message.indexOf('const configurationTabs'))
  assert.match(validation, /ruleTemplateId/)
  assert.match(validation, /matchedFileRuleTemplates\.value\.some/)
  assert.match(validation, /if \(!hasMatchedFileRuleTemplate\(\)\) return false/)
})
