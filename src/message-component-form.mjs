/**
 * 将消息组件表单切换为新建状态。
 *
 * @param {Record<string, unknown>} target Vue 响应式表单对象
 * @returns {Record<string, unknown>} 已重置的同一个表单对象
 */
export function resetMessageComponentForCreate(target) {
  return Object.assign(target, {
    id: '',
    // 新建资源不复用已编辑资源的受控编码；null 由 PostgreSQL 唯一索引按“未指定”处理。
    code: null,
    type: 'ROCKETMQ',
    name: '',
    namesrvAddr: '',
    instanceId: '',
    accessKey: '',
    secretKey: '',
    secretConfigured: false,
    producerGroups: [],
    topics: [],
    status: 'ENABLED'
  })
}

/** 将消息组件保存契约固定为系统唯一允许的 RocketMQ 类型。 */
export function normalizeMessageComponentForSave(value) {
  const result = {...value, type: 'ROCKETMQ', status: 'ENABLED'}
  for (const field of ['host', 'port', 'database', 'username', 'credentialRef', 'password', 'passwordConfigured', 'tableName']) delete result[field]
  return result
}

const ROUTE_CHARACTERS = /^[A-Za-z0-9_-]+$/

/** 校验云 RocketMQ Producer Group 命名规则。 */
export function producerGroupError(value) {
  const normalized = String(value || '').trim()
  if (normalized.length < 7 || normalized.length > 64) return 'Producer Group 长度必须为 7～64 个字符'
  if (!/^(GID_|GID-)/.test(normalized)) return 'Producer Group 必须以 GID_ 或 GID- 开头'
  if (!ROUTE_CHARACTERS.test(normalized)) return 'Producer Group 只能包含英文字母、数字、短横线和下划线'
  return ''
}

/** 校验云 RocketMQ Topic 命名规则。 */
export function topicError(value) {
  const normalized = String(value || '').trim()
  if (normalized.length < 3 || normalized.length > 64) return 'Topic 长度必须为 3～64 个字符'
  if (!ROUTE_CHARACTERS.test(normalized)) return 'Topic 只能包含英文字母、数字、短横线和下划线'
  if (/^(CID|GID)/i.test(normalized)) return 'Topic 不能以 CID 或 GID 开头'
  return ''
}

/** 返回同一组件内首个重复路由名称。 */
export function duplicateRoute(values = []) {
  const seen = new Set()
  for (const raw of values) {
    const value = String(raw || '').trim()
    if (seen.has(value)) return value
    seen.add(value)
  }
  return ''
}
