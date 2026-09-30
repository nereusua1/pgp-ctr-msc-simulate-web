export function normalizeSqlDateSchedule(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaultExpression = source.dailyTime
    ? `0 ${Number(String(source.dailyTime).slice(3))} ${Number(String(source.dailyTime).slice(0, 2))} * * ?`
    : '0 0 8 * * ?'
  const type = source.type ?? 'CRON'
  const expression = String(source.expression ?? defaultExpression).trim()
  const year = String(source.year ?? '*')
  const intervalSeconds = Number(source.intervalSeconds ?? 3600)
  const startOffsetDays = Number(source.startOffsetDays ?? -1)
  const endOffsetDays = Number(source.endOffsetDays ?? -1)
  const window = source.autoExecutionWindow || {}
  const autoExecutionWindow = {
    type: window.type === 'DATE_RANGE' ? 'DATE_RANGE' : 'UNBOUNDED',
    startDate: window.startDate || '',
    endDate: window.endDate || ''
  }
  if (!['CRON', 'FIXED_RATE'].includes(type)) throw new Error('调度方式仅支持 Cron 或固定间隔')
  if (type === 'CRON' && expression.split(/\s+/).length !== 6) throw new Error('请输入六段 Spring Cron 表达式')
  if (year !== '*' && !/^(?:19[7-9][0-9]|20[0-9][0-9]|21[0-9][0-9])$/.test(year)) throw new Error('Cron 年份无效')
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 31536000) throw new Error('固定间隔须为 1 至 31536000 秒')
  if (![startOffsetDays, endOffsetDays].every(value => Number.isInteger(value) && value >= -365 && value <= 365)) {
    throw new Error('目标日期相对天数须为 -365 至 365 的整数')
  }
  if (startOffsetDays > endOffsetDays) throw new Error('定时目标开始日不能晚于结束日')
  if (endOffsetDays - startOffsetDays + 1 > 366) throw new Error('单次最多生成 366 个目标日期')
  if (autoExecutionWindow.type === 'DATE_RANGE' &&
      (!autoExecutionWindow.startDate || !autoExecutionWindow.endDate ||
       autoExecutionWindow.startDate > autoExecutionWindow.endDate)) {
    throw new Error('请选择有效的自动执行开始与结束日期')
  }
  return {enabled: source.enabled === true, type, expression, year, intervalSeconds,
    startOffsetDays, endOffsetDays, autoExecutionWindow}
}

export function formatSqlScheduleInstant(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(iso))
}
