export const TIME_STRATEGIES = [
  ['TASK_TRIGGER_TIME', '计划触发时间'],
  ['BUSINESS_BASE_TIME', '业务基准时间'],
  ['DATA_INTERVAL_SEQUENCE', '按数据项间隔生成'],
  ['PERIOD_END_TIME', '预报结束时间']
]

function isStartTimePath(path) {
  return String(path || '').toLowerCase().endsWith('starttime')
}

export function recommendedTimeStrategy(path) {
  const normalized = String(path || '').toLowerCase()
  if (normalized.endsWith('endtime')) return 'PERIOD_END_TIME'
  if (isStartTimePath(path)) return 'BUSINESS_BASE_TIME'
  if (normalized.endsWith('datatime') || normalized.endsWith('forecasttime') || normalized.endsWith('forecast_time')) return 'DATA_INTERVAL_SEQUENCE'
  return 'TASK_TRIGGER_TIME'
}

export function timeStrategiesForPath(path) {
  return isStartTimePath(path)
    ? TIME_STRATEGIES.filter(([strategy]) => strategy !== 'TASK_TRIGGER_TIME')
    : TIME_STRATEGIES
}

export function normalizeTimeBinding(binding) {
  if (!binding || (binding.kind !== 'TIME_RULE' && binding.kind !== 'TIME_OFFSET')) return { ...binding }
  const normalized = {
    ...binding,
    kind: 'TIME_RULE',
    strategy: binding.strategy || recommendedTimeStrategy(binding.path),
    format: binding.format || 'yyyy-MM-dd HH:mm:ss'
  }
  if (normalized.strategy === 'TASK_TRIGGER_TIME' && isStartTimePath(normalized.path)) normalized.strategy = 'BUSINESS_BASE_TIME'
  delete normalized.offset
  return normalized
}
