import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
const app = await read('App.vue')
const api = await read('api.js')
const modal = await read('components/AppModal.vue')
const task = await read('views/TaskManagementView.vue')
const message = await read('views/MessageManagementView.vue')
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
