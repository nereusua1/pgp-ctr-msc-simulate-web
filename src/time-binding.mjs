export const TIME_STRATEGIES = [
  ['TASK_TRIGGER_TIME', '当前时间'],
  ['BUSINESS_BASE_TIME', '起报时间'],
  ['DATA_INTERVAL_SEQUENCE', '预报时间（序列）'],
  ['PERIOD_END_TIME', '预报时间（结束）']
]

export const TIME_STRATEGY_DESCRIPTIONS = {
  TASK_TRIGGER_TIME: '当前时间取本次任务的计划触发时间；历史补跑取用户指定时间，不读取数据项时间参数。',
  BUSINESS_BASE_TIME: '起报时间在实况中等于本次触发时间；预报按数据项 pre_time_point 确定。',
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
  const normalized = String(path || '').toLowerCase()
  if (normalized.endsWith('endtime')) return businessType === 'REALTIME' ? 'BUSINESS_BASE_TIME' : 'PERIOD_END_TIME'
  if (isStartTimePath(path)) return 'BUSINESS_BASE_TIME'
  if (normalized.endsWith('datatime') || normalized.endsWith('forecasttime') || normalized.endsWith('forecast_time')) return 'DATA_INTERVAL_SEQUENCE'
  return 'TASK_TRIGGER_TIME'
}

export function timeStrategiesForPath(path, businessType = 'FORECAST') {
  const strategies = isStartTimePath(path)
    ? TIME_STRATEGIES.filter(([strategy]) => strategy !== 'TASK_TRIGGER_TIME')
    : TIME_STRATEGIES
  return businessType === 'REALTIME'
    ? strategies.filter(([strategy]) => !['DATA_INTERVAL_SEQUENCE', 'PERIOD_END_TIME'].includes(strategy))
    : strategies
}

export function normalizeTimeBinding(binding, businessType = 'FORECAST') {
  if (!binding) return { ...binding }
  if (binding.kind === 'VALUE_RULE') {
    return businessType === 'REALTIME' && binding.provider === 'PERIOD_END_TIME'
      ? { ...binding, provider: 'BUSINESS_BASE_TIME' }
      : { ...binding }
  }
  if (binding.kind !== 'TIME_RULE' && binding.kind !== 'TIME_OFFSET') return { ...binding }
  const normalized = {
    ...binding,
    kind: 'TIME_RULE',
    strategy: binding.strategy || recommendedTimeStrategy(binding.path, businessType),
    format: binding.format || 'yyyy-MM-dd HH:mm:ss'
  }
  if (normalized.strategy === 'TASK_TRIGGER_TIME' && isStartTimePath(normalized.path)) normalized.strategy = 'BUSINESS_BASE_TIME'
  if (businessType === 'REALTIME' && ['DATA_INTERVAL_SEQUENCE', 'PERIOD_END_TIME'].includes(normalized.strategy)) normalized.strategy = 'BUSINESS_BASE_TIME'
  delete normalized.offset
  return normalized
}
