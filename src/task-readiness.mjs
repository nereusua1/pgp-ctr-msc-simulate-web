/** 报文拥有可供任务执行的发布版本；已发布资源兼容升级前没有版本摘要的数据。 */
export function hasPublishedMessageVersion(message) {
  return Boolean(message) && (message.status === 'PUBLISHED' || message.hasPublishedVersion === true || Number(message.publishedVersion) > 0)
}

/** 检查普通报文任务在总览页可确认的配置阻断项。 */
export function taskReadinessIssue(task, messages = [], components = []) {
  const ids = taskMessageIds(task)
  if (!ids.length) return '任务未配置报文'
  for (const id of ids) {
    const message = messages.find(item => item.id === id)
    if (!message) return '关联模板不存在'
    if (!hasPublishedMessageVersion(message)) return '关联模板尚未发布'
    const targets = message.deliveryTargets || []
    if (!targets.length) return '模板未配置投递目标'
    if (targets.some(target => !components.some(component => component.id === target.componentId && component.status !== 'DISABLED'))) {
      return '投递目标不存在或已停用'
    }
  }
  return ''
}
import {taskMessageIds} from './message-references.mjs'
