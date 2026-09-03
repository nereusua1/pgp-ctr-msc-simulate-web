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
