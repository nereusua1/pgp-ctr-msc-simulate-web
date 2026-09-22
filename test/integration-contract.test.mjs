import test from 'node:test'
import assert from 'node:assert/strict'

import {createFileGeneration} from '../src/file-storage.mjs'
import {normalizeDeliveryTarget} from '../src/resource-adapter.mjs'
import {normalizeMessageComponentForSave} from '../src/message-component-form.mjs'
import {normalizeTaskForSave} from '../src/task-contract.mjs'

test('非结构化文件请求使用后端 schemaVersion 3 契约', () => {
  const value = createFileGeneration({
    sourceFilePath: 'weather/source_2026091708.nc',
    sourceFileName: 'source_2026091708.nc',
    fileNamePath: '$.records[0].fileName',
    filePathPath: '$.records[0].filePath',
    fileTypePath: '$.records[0].fileType',
    fileSizePath: '$.records[0].fileSize',
    overwritePolicy: 'FAIL'
  }, 'UNSTRUCTURED_FILE')

  assert.equal(value.schemaVersion, 3)
  assert.equal(value.processingMode, 'BINARY_COPY')
  assert.equal(value.collisionPolicy, 'FAIL_IF_EXISTS')
  assert.deepEqual(value.referenceBindings, {
    fileNamePath: '$.records[0].fileName', filePathPath: '$.records[0].filePath',
    fileTypePath: '$.records[0].fileType', fileSizePath: '$.records[0].fileSize'
  })
  for (const forbidden of ['parserMode', 'encoding', 'delimiter', 'contentBindings']) {
    assert.equal(Object.hasOwn(value, forbidden), false)
  }
})

test('消息组件保存契约固定为 RocketMQ 并移除数据库字段', () => {
  const component = normalizeMessageComponentForSave({
    type: 'MESSAGE_DATABASE', name: '消息数据库', tableName: 'unsafe', host: 'db', password: 'secret'
  })
  assert.deepEqual(component, {type: 'ROCKETMQ', name: '消息数据库', status: 'ENABLED'})
  assert.equal(normalizeDeliveryTarget({type: 'ROCKETMQ', topic: 'weather'}).channel, 'ROCKETMQ')
})

test('多报文任务提交有序去重的报文引用和失败策略', () => {
  const task = normalizeTaskForSave({targetType: 'MESSAGE', messageIds: ['m2', 'm1', 'm2'], failurePolicy: 'STOP'})
  assert.equal(task.targetType, 'MESSAGE')
  assert.equal(Object.hasOwn(task, 'collectionId'), false)
  assert.deepEqual(task.messageIds, ['m2', 'm1'])
  assert.equal(task.failurePolicy, 'STOP')
  assert.equal(Object.hasOwn(task, 'messageId'), false)
})
