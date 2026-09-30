/** 校验本次手工补数的闭区间；实际逐日展开由后端完成。 */
export function validateTargetRange(start, end) {
  if (!start || !end) throw new Error('请选择目标开始日期和结束日期')
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (!iso.test(start) || !iso.test(end)) throw new Error('目标日期必须是 yyyy-MM-dd')
  const startTime = Date.parse(`${start}T00:00:00Z`)
  const endTime = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) ||
      new Date(startTime).toISOString().slice(0, 10) !== start ||
      new Date(endTime).toISOString().slice(0, 10) !== end) throw new Error('目标日期无效')
  const days = Math.round((endTime - startTime) / 86400000) + 1
  if (days < 1) throw new Error('目标开始日期不能晚于结束日期')
  if (days > 366) throw new Error('单次最多生成 366 个目标日期')
  return days
}
