/** 中国区业务界面统一使用的时区，避免浏览器所在时区不同导致时间展示漂移。 */
const BUSINESS_TIME_ZONE = 'Asia/Shanghai'

/**
 * 将接口返回的 ISO-8601 时间统一格式化为 yyyy-MM-dd HH:mm:ss。
 *
 * @param {string | number | Date | null | undefined} value 接口时间、时间戳或 Date
 * @param {string} emptyValue 空值时展示的占位符
 * @returns {string} 中国标准时间的秒级展示值；无法解析时保留原始文本，避免隐藏异常数据
 */
export function formatDateTime(value, emptyValue = '—') {
  if (value === null || value === undefined || value === '') return emptyValue
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
}
