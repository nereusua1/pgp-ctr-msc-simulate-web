import test from 'node:test'
import assert from 'node:assert/strict'
import { runExclusive } from '../src/action-guard.mjs'

test('同一操作未返回前只能提交一次', async () => {
  const pending = new Set()
  let release
  let calls = 0
  const request = () => new Promise(resolve => { release = resolve })

  const first = runExclusive(pending, 'run:task-1', async () => { calls += 1; await request() })
  const second = await runExclusive(pending, 'run:task-1', async () => { calls += 1 })

  assert.equal(second.executed, false)
  assert.equal(calls, 1)
  release()
  await first
  assert.equal(pending.has('run:task-1'), false)
})

test('请求失败后必须释放操作锁以允许重试', async () => {
  const pending = new Set()
  await assert.rejects(() => runExclusive(pending, 'save:message-1', async () => { throw new Error('保存失败') }))

  const retry = await runExclusive(pending, 'save:message-1', async () => 'ok')

  assert.equal(retry.executed, true)
  assert.equal(retry.value, 'ok')
})
