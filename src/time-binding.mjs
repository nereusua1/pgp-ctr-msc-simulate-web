export const TIME_STRATEGIES = [
  ['TASK_TRIGGER_TIME', '当前时间'],
  ['BUSINESS_BASE_TIME', '起报时间'],
  ['DATA_INTERVAL_SEQUENCE', '预报时间（序列）'],
  ['PERIOD_END_TIME', '预报时间（结束）']
]

export const TIME_STRATEGY_DESCRIPTIONS = {
  TASK_TRIGGER_TIME: '当前时间取本次任务时间；实况在 period_interval 不为空时向下对齐到最近间隔点，为空时直接使用任务时间。',
  BUSINESS_BASE_TIME: '起报时间仅用于预报，按数据项 pre_time_point 确定。',
  DATA_INTERVAL_SEQUENCE: '预报时间将原始值去重排序，从起报时间开始按数据项 period_interval 分钟依次生成。',
  PERIOD_END_TIME: '预报结束时间使用起报时间加数据项 period 小时，仅适用于预报数据。'
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

export function recommendedTimeStrategy(path, businessType = 'FORECAST') {
  if (businessType === 'REALTIME') return 'TASK_TRIGGER_TIME'
  const normalized = String(path || '').toLowerCase()
  if (normalized.endsWith('endtime')) return businessType === 'REALTIME' ? 'BUSINESS_BASE_TIME' : 'PERIOD_END_TIME'
  if (isStartTimePath(path)) return 'BUSINESS_BASE_TIME'
  if (normalized.endsWith('datatime') || normalized.endsWith('forecasttime') || normalized.endsWith('forecast_time')) return 'DATA_INTERVAL_SEQUENCE'
  return 'TASK_TRIGGER_TIME'
}

export function timeStrategiesForPath(path, businessType = 'FORECAST') {
  if (businessType === 'REALTIME') return TIME_STRATEGIES.filter(([strategy]) => strategy === 'TASK_TRIGGER_TIME')
  const strategies = isStartTimePath(path)
    ? TIME_STRATEGIES.filter(([strategy]) => strategy !== 'TASK_TRIGGER_TIME')
    : TIME_STRATEGIES
  return strategies
}

export function normalizeTimeBinding(binding, businessType = 'FORECAST') {
  if (!binding) return { ...binding }
  if (binding.kind === 'VALUE_RULE') {
    return businessType === 'REALTIME' && ['BUSINESS_BASE_TIME', 'PERIOD_END_TIME'].includes(binding.provider)
      ? { ...binding, provider: 'PLANNED_TRIGGER_TIME' }
      : { ...binding }
  }
  if (binding.kind !== 'TIME_RULE' && binding.kind !== 'TIME_OFFSET') return { ...binding }
  const normalized = {
    ...binding,
    kind: 'TIME_RULE',
    strategy: binding.strategy || recommendedTimeStrategy(binding.path, businessType),
    format: binding.format || 'yyyy-MM-dd HH:mm:ss'
  }
  if (businessType === 'REALTIME') normalized.strategy = 'TASK_TRIGGER_TIME'
  else if (normalized.strategy === 'TASK_TRIGGER_TIME' && isStartTimePath(normalized.path)) normalized.strategy = 'BUSINESS_BASE_TIME'
  delete normalized.offset
  return normalized
}
