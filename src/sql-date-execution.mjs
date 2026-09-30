/** 将历史数据库异常转成可读摘要，完整原文只在用户展开时展示。 */
export function describeSqlDateFailure(error, startDate = '', endDate = '') {
  const raw = String(error || '').trim()
  if (!raw) return null
  const technical = /PreparedStatementCallback|PSQLException|SQLException|bad SQL grammar|nested exception|\bINSERT\s+INTO\b|\bERROR:/i.test(raw)
  if (!technical && raw.length <= 220) return {summary: raw, detail: ''}
  let summary = '数据生成失败，请检查目标表结构、样例数据及数据库权限；需要时联系管理员查看技术详情。'
  if (/no partition of relation|缺少.*分区/i.test(raw)) {
    const range = startDate && endDate ? (startDate === endDate ? `目标日期 ${startDate}` : `目标范围 ${startDate} 至 ${endDate}`) : '目标日期'
    summary = `${range} 对应的表分区不存在，请先建立分区后重试。`
  } else if (/permission denied|权限不足/i.test(raw)) {
    summary = '数据库账号缺少读取或写入权限，请联系管理员检查授权。'
  }
  return {summary, detail: raw}
}
