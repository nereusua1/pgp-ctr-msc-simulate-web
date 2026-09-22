import test from 'node:test'
import assert from 'node:assert/strict'
import {latestRequest, executionModeError, taskFormError, evidenceState} from '../src/interaction-policy.mjs'
import {parseRoute, routePath} from '../src/page-route.mjs'

test('操作员只能指定历史时间，管理员可当前时间执行', () => {
  assert.equal(executionModeError(false, {mode:'MANUAL_CURRENT'}), '当前角色只能历史补跑')
  assert.equal(executionModeError(true, {mode:'MANUAL_CURRENT'}), '')
  assert.equal(executionModeError(false, {mode:'MANUAL_SPECIFIED'}), '请选择计划触发时间')
  assert.equal(executionModeError(false, {mode:'MANUAL_SPECIFIED', plannedTriggerTime:'2026-09-01T10:00:00'}), '')
})
test('后来提交的查询使先前响应失效', async () => {
  const begin = latestRequest()
  let resolveOld
  const old = begin()
  const oldResponse = new Promise(resolve => { resolveOld = resolve })
  const latest = begin()
  let value = ''
  if (latest()) value = '最新结果'
  resolveOld('旧结果')
  const result = await oldResponse
  if (old()) value = result
  assert.equal(value, '最新结果')
})
test('任务名称、模板及固定间隔须有效', () => {
  assert.ok(taskFormError({name:' '}))
  assert.ok(taskFormError({name:'任务', messageId:'m', scheduleType:'FIXED_RATE', schedule:'-1'}))
  assert.equal(taskFormError({name:'任务', messageId:'m', scheduleType:'MANUAL'}), '')
  assert.equal(taskFormError({name:'多报文任务', messageIds:['m1', 'm2'], scheduleType:'MANUAL'}), '')
  assert.equal(taskFormError({name:'空任务', messageIds:[], scheduleType:'MANUAL'}), '请至少选择一份报文模板')
})
test('自动执行日期范围必须完整且开始日期不晚于结束日期', () => {
  const base = {name:'任务', messageId:'m', scheduleType:'CRON', schedule:'0 0 8 * * ?'}
  assert.equal(taskFormError({...base, autoExecutionWindow:{type:'DATE_RANGE', startDate:'2026-01-01', endDate:'2026-06-30'}}), '')
  assert.equal(taskFormError({...base, autoExecutionWindow:{type:'DATE_RANGE', startDate:'2026-07-01', endDate:'2026-06-30'}}), '自动执行开始日期不能晚于结束日期')
  assert.equal(taskFormError({...base, autoExecutionWindow:{type:'DATE_RANGE', startDate:'2026-02-30', endDate:'2026-06-30'}}), '请选择完整且有效的自动执行开始日期和结束日期')
  assert.equal(taskFormError({...base, autoExecutionWindow:{type:'UNBOUNDED'}}), '')
})
test('未知阶段和部分成功不能伪装成全链路完成', () => {
  assert.equal(evidenceState('PARTIAL_SUCCESS', -1, 0), 'pending')
  assert.equal(evidenceState('FAILED', 2, 2), 'failed')
  assert.equal(evidenceState('FAILED', 2, 1), 'pending')
  assert.equal(evidenceState('SUCCESS', -1, 0), 'done')
})
test('详情地址可包含中文及转义标识且可恢复', () => {
  const path = routePath('messages', '气象/a', true)
  assert.deepEqual(parseRoute(path), {page:'messages', id:'气象/a', edit:true})
  assert.equal(routePath('logs', 'ex-1'), '/executions/ex-1')
  assert.equal(routePath('tasks', 'new'), '/tasks/new')
  assert.deepEqual(parseRoute('/tasks/new'), {page:'tasks', id:'new', edit:false})
  assert.equal(routePath('file-rules'), '/file-rules')
  assert.equal(routePath('message-collections'), '/overview')
  assert.deepEqual(parseRoute('/file-rules'), {page:'file-rules', id:'', edit:false})
  assert.equal(routePath('file-rules', '规则/a', true), '/file-rules/%E8%A7%84%E5%88%99%2Fa/edit')
  assert.deepEqual(parseRoute('/file-rules/rule-1/edit'), {page:'file-rules', id:'rule-1', edit:true})
  assert.equal(parseRoute('/tasks/%').id, '')
})
