import test from 'node:test'
import assert from 'node:assert/strict'
import { flattenResource, normalizeDataItem, normalizeExecutionMessage, normalizeTemplate, serializeResource } from '../src/resource-adapter.mjs'

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
})

test('数据项和执行报文应转换为稳定的页面标识', () => {
  assert.equal(normalizeDataItem({ id: 'g1', dataItemCode: 'SURFACE_OBS', dataItemName: '地面观测' }).code, 'SURFACE_OBS')
  assert.deepEqual(normalizeExecutionMessage({ id: 'row-1', messageId: 'msg-1', deliveryStatus: 'SUCCESS' }), {
    id: 'msg-1', recordId: 'row-1', messageId: 'msg-1', deliveryStatus: 'SUCCESS', status: 'SUCCESS', retries: 0
  })
})
