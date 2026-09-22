import test from 'node:test'
import assert from 'node:assert/strict'
import {taskMessageIds, tasksReferencingAnyMessage, tasksReferencingMessage} from '../src/message-references.mjs'

test('任务报文引用兼容历史单值并对有序多值去重', () => {
  assert.deepEqual(taskMessageIds({messageId: 'legacy'}), ['legacy'])
  assert.deepEqual(taskMessageIds({messageId: 'first', messageIds: ['first', 'second', 'second']}), ['first', 'second'])
})

test('报文位于多报文任务第二项时仍计入关联和删除保护', () => {
  const tasks = [{id: 'task-1', messageId: 'first', messageIds: ['first', 'second']}]
  assert.deepEqual(tasksReferencingMessage(tasks, 'second').map(item => item.id), ['task-1'])
  assert.deepEqual(tasksReferencingAnyMessage(tasks, ['second']).map(item => item.id), ['task-1'])
})
