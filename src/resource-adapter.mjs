import {normalizeFileGeneration} from './file-storage.mjs'

// 保留历史导出路径，调用方统一使用 file-storage.mjs 的实现。
export {normalizeFileGeneration} from './file-storage.mjs'

const transportFields = new Set([
  'id', 'name', 'code', 'status', 'createdAt', 'updatedAt', 'messages',
  'planned', 'actual', 'success', 'failed', 'outputMode', 'nextExecutionAt'
])

const messageTypeAliases = new Map([
  ['FILE_REFERENCE', 'FILE'],
  ['STRUCTURED_FILE', 'FILE'],
  ['BINARY_FILE', 'UNSTRUCTURED_FILE']
])

/** 统一历史与当前报文类型；页面只使用 JSON、FILE、UNSTRUCTURED_FILE。 */
export function normalizeMessageType(value) {
  const type = String(value || 'JSON').trim().toUpperCase()
  return messageTypeAliases.get(type) || (['JSON', 'FILE', 'UNSTRUCTURED_FILE'].includes(type) ? type : 'JSON')
}

export function isStructuredFile(value) {
  return normalizeMessageType(typeof value === 'object' ? value?.type : value) === 'FILE'
}

export function isUnstructuredFile(value) {
  return normalizeMessageType(typeof value === 'object' ? value?.type : value) === 'UNSTRUCTURED_FILE'
}

/** 结构化 FILE 缺少处理方式时按历史 RULE_DRIVEN 解释。 */
export function normalizeFileProcessingMode(value) {
  const mode = String(value || 'RULE_DRIVEN').trim().toUpperCase()
  return mode === 'ORIGINAL_MESSAGE' ? mode : 'RULE_DRIVEN'
}

export function isOriginalMessage(value) {
  return isStructuredFile(value) && normalizeFileProcessingMode(value?.fileGeneration?.processingMode) === 'ORIGINAL_MESSAGE'
}

/** 规范投递目标类型；新配置只会生成 ROCKETMQ，历史类型保留以便页面排除。 */
export function normalizeDeliveryTarget(value = {}) {
  const type = String(value.type || value.channel || 'ROCKETMQ').toUpperCase()
  return Object.fromEntries(Object.entries({...value, type, channel: type}).filter(([key]) => key !== 'tableName'))
}

/** 将通用资源响应转换为页面可直接消费的业务对象。 */
export function flattenResource(resource = {}) {
  return {
    id: resource.id,
    name: resource.name,
    code: resource.code,
    status: resource.status,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    ...(resource.data || {})
  }
}

/** 将页面业务对象还原为后端 ResourceRequest，避免把只读统计字段写回数据库。 */
export function serializeResource(item = {}) {
  return {
    name: item.name,
    code: item.code || null,
    status: item.status,
    data: Object.fromEntries(Object.entries(item).filter(([key]) => !transportFields.has(key)))
  }
}

/** 兼容历史 FILE_REFERENCE 类型，页面只暴露当前 FILE 业务术语。 */
export function normalizeTemplate(resource) {
  const template = flattenResource(resource)
  const normalized = {...template, type: normalizeMessageType(template.type)}
  return {
    ...normalized,
    ...(normalized.type === 'FILE' || normalized.type === 'UNSTRUCTURED_FILE'
      ? {fileGeneration: normalizeFileGeneration(normalized.fileGeneration, normalized.type)}
      : {}),
    // 历史报文不再根据数据项 is_rt 猜测类型；由用户下次配置时明确确认。
    businessType: normalized.businessType || 'UNKNOWN',
    timeGenerationMode: normalized.timeGenerationMode || 'DATA_POLICY'
  }
}

/** 数据项接口不是通用资源包装，保持其只读聚合标识与中文名称。 */
export function normalizeDataItem(resource = {}) {
  return resource.data
    ? flattenResource(resource)
    : { ...resource, code: resource.dataItemCode, name: resource.dataItemName }
}

/** 将数据库明细字段统一为页面使用的消息标识和投递状态。 */
export function normalizeExecutionMessage(message = {}) {
  return {
    ...message,
    id: message.messageId,
    recordId: message.id,
    status: message.deliveryStatus,
    retries: 0
  }
}
