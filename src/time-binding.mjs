export const TIME_STRATEGIES = [
  ['TASK_TRIGGER_TIME', '计划触发时间'],
  ['BUSINESS_BASE_TIME', '业务基准时间'],
  ['DATA_INTERVAL_SEQUENCE', '按数据项间隔生成'],
  ['PERIOD_END_TIME', '预报结束时间']
]

export const TIME_STRATEGY_DESCRIPTIONS = {
  TASK_TRIGGER_TIME: '直接使用本次任务的计划触发时间，不读取数据项时间参数。',
  BUSINESS_BASE_TIME: '直接模式下等于计划触发时间；按数据项策略时，实况按 period_interval 对齐，预报按 pre_time_point 起报点或数据间隔对齐。',
  DATA_INTERVAL_SEQUENCE: '将原始时间值去重排序，从业务基准时间开始按数据项 period_interval 分钟依次生成时间槽。',
  PERIOD_END_TIME: '使用业务基准时间加数据项 period 小时，仅适用于预报数据。'
}

export function timeStrategyDescription(strategy, timeGenerationMode = 'DATA_POLICY') {
  if (strategy === 'BUSINESS_BASE_TIME' && timeGenerationMode === 'TRIGGER_TIME') {
    return '与本次任务的计划触发时间相同，不读取数据项时间参数。'
  }
  return TIME_STRATEGY_DESCRIPTIONS[strategy] || '按照所选时间规则生成。'
}

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
