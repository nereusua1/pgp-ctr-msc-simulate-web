import test from 'node:test'
import assert from 'node:assert/strict'
import { flattenResource, isOriginalMessage, isStructuredFile, isUnstructuredFile, normalizeDataItem, normalizeDeliveryTarget, normalizeExecutionMessage, normalizeFileGeneration, normalizeMessageType, normalizeTemplate, serializeResource } from '../src/resource-adapter.mjs'

test('统一三类报文、两类 FILE 和投递目标语义', () => {
  assert.equal(normalizeMessageType('FILE_REFERENCE'), 'FILE')
  assert.equal(normalizeMessageType('UNSTRUCTURED_FILE'), 'UNSTRUCTURED_FILE')
  assert.equal(isStructuredFile({type:'FILE'}), true)
  assert.equal(isUnstructuredFile({type:'UNSTRUCTURED_FILE'}), true)
  const file = normalizeFileGeneration({encoding:'GB18030', delimiter:',', contentBindings:[{fields:['time']}]}, 'UNSTRUCTURED_FILE')
  assert.equal(file.processingMode, 'BINARY_COPY')
  assert.equal(file.schemaVersion, 3)
  assert.equal(file.parserMode, undefined)
  assert.equal(file.encoding, undefined)
  assert.equal(file.contentBindings, undefined)
  const original = normalizeFileGeneration({processingMode:'ORIGINAL_MESSAGE', ruleTemplateId:'old', parserMode:'PASSTHROUGH', fileNameBindings:[]}, 'FILE')
  assert.equal(original.processingMode, 'ORIGINAL_MESSAGE')
  assert.equal(original.schemaVersion, 3)
  assert.equal(original.ruleTemplateId, undefined)
  assert.equal(original.parserMode, undefined)
  assert.equal(isOriginalMessage({type:'FILE', fileGeneration: original}), true)
  const rocketTarget = normalizeDeliveryTarget({type:'ROCKETMQ', tableName:'unsafe'})
  assert.equal(rocketTarget.type, 'ROCKETMQ')
  assert.equal(rocketTarget.tableName, undefined)
})

test('通用资源包装应被页面业务字段展开', () => {
  assert.deepEqual(flattenResource({ id: '1', name: '报文', status: 'DRAFT', data: { type: 'JSON' } }), {
    id: '1', name: '报文', code: undefined, status: 'DRAFT', createdAt: undefined, updatedAt: undefined, type: 'JSON'
  })
})

test('保存请求不得回写执行统计和只读传输字段', () => {
  assert.deepEqual(serializeResource({ id: '1', name: '任务', code: '', status: 'ENABLED', schedule: '10', success: 8 }), {
    name: '任务', code: null, status: 'ENABLED', data: { schedule: '10' }
  })
})

test('历史 FILE_REFERENCE 应统一为 FILE', () => {
  const template = normalizeTemplate({ id: '1', data: { type: 'FILE_REFERENCE' } })
  assert.equal(template.type, 'FILE')
  assert.equal(template.businessType, 'UNKNOWN')
  assert.equal(template.timeGenerationMode, 'DATA_POLICY')
  assert.equal(template.fileGeneration.processingMode, 'RULE_DRIVEN')
})

test('数据项和执行报文应转换为稳定的页面标识', () => {
  assert.equal(normalizeDataItem({ id: 'g1', dataItemCode: 'SURFACE_OBS', dataItemName: '地面观测' }).code, 'SURFACE_OBS')
  assert.deepEqual(normalizeExecutionMessage({ id: 'row-1', messageId: 'msg-1', deliveryStatus: 'SUCCESS' }), {
    id: 'msg-1', recordId: 'row-1', messageId: 'msg-1', deliveryStatus: 'SUCCESS', status: 'SUCCESS', retries: 0
  })
})
