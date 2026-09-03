const transportFields = new Set([
  'id', 'name', 'code', 'status', 'createdAt', 'updatedAt', 'messages',
  'planned', 'actual', 'success', 'failed', 'outputMode'
])

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
  return template.type === 'FILE_REFERENCE' ? { ...template, type: 'FILE' } : template
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
