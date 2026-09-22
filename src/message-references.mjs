/** 返回任务规范化后的有序报文标识，并兼容历史单值 messageId。 */
export function taskMessageIds(task) {
  const source = Array.isArray(task?.messageIds) && task.messageIds.length ? task.messageIds : [task?.messageId]
  return [...new Set(source.map(value => String(value || '').trim()).filter(Boolean))]
}

/** 返回完整有序报文列表中引用指定报文的任务。 */
export function tasksReferencingMessage(tasks, messageId) {
  const expected = String(messageId || '').trim()
  if (!expected) return []
  return (tasks || []).filter(task => taskMessageIds(task).includes(expected))
}

/** 返回引用给定任一报文的任务，用于组件和删除保护的关联统计。 */
export function tasksReferencingAnyMessage(tasks, messageIds) {
  const expected = new Set((messageIds || []).map(value => String(value || '').trim()).filter(Boolean))
  return expected.size ? (tasks || []).filter(task => taskMessageIds(task).some(id => expected.has(id))) : []
}
