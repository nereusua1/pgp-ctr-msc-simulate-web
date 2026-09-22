/** 将任务表单转换为有序多报文的 Java 后端契约。 */
export function normalizeTaskForSave(task) {
  const messageIds = taskMessageIds(task)
  const result = {...task, targetType: 'MESSAGE', messageIds}
  for (const field of ['collectionId', 'collectionMemberId', 'messageId', 'messageIds', 'failurePolicy']) delete result[field]
  result.messageIds = messageIds
  result.failurePolicy = task.failurePolicy === 'STOP' ? 'STOP' : 'CONTINUE'
  return result
}

/** 当前页面只接受普通报文任务；历史集合任务由后端启动迁移处理。 */
export function normalizeTaskForView(task) {
  const messageIds = taskMessageIds(task)
  return {...task, targetType: 'MESSAGE', messageIds, messageId: messageIds[0] || task?.messageId || '', failurePolicy: task?.failurePolicy === 'STOP' ? 'STOP' : 'CONTINUE'}
}
import {taskMessageIds} from './message-references.mjs'
