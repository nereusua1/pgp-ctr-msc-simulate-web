/** 最新请求独占结果写入权；旧响应仍可结束，但不得覆盖新查询。 */
export function latestRequest() {
  let generation = 0
  return () => {
    const current = ++generation
    return () => current === generation
  }
}

export function executionModeError(canManage, request = {}) {
  if (!['MANUAL_CURRENT', 'MANUAL_SPECIFIED'].includes(request.mode)) return '请选择执行方式'
  if (!canManage && request.mode !== 'MANUAL_SPECIFIED') return '当前角色只能历史补跑'
  if (request.mode === 'MANUAL_SPECIFIED' && !request.plannedTriggerTime) return '请选择计划触发时间'
  return ''
}

export function taskFormError(form) {
  if (!form.name?.trim()) return '请输入任务名称'
  if (!form.messageId) return '请选择报文模板'
  if (form.scheduleType === 'FIXED_RATE' && (!Number.isFinite(Number(form.schedule)) || Number(form.schedule) <= 0)) return '执行间隔必须大于 0 秒'
  return ''
}

/** 不推测已完成阶段；仅成功终态或明确失败阶段可形成证据。 */
export function evidenceState(status, failedIndex, index) {
  if (status === 'SUCCESS') return 'done'
  if (failedIndex === index) return 'failed'
  return 'pending'
}
