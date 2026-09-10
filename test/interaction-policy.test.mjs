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
  assert.equal(parseRoute('/tasks/%').id, '')
})
