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
  const window = form.autoExecutionWindow || {type: 'UNBOUNDED'}
  if (form.scheduleType !== 'MANUAL' && window.type === 'DATE_RANGE') {
    if (!validDate(window.startDate) || !validDate(window.endDate)) return '请选择完整且有效的自动执行开始日期和结束日期'
    if (window.startDate > window.endDate) return '自动执行开始日期不能晚于结束日期'
  }
  return ''
}

/** 日期输入必须是实际存在的 yyyy-MM-dd，避免浏览器外部调用提交归一化后的无效日期。 */
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** 不推测已完成阶段；仅成功终态或明确失败阶段可形成证据。 */
export function evidenceState(status, failedIndex, index) {
  if (status === 'SUCCESS') return 'done'
  if (failedIndex === index) return 'failed'
  return 'pending'
}
