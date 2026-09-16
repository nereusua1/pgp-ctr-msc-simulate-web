export const FILE_TIME_SOURCES = [
  ['BUSINESS_BASE_TIME', '业务基准时间'],
  ['BUSINESS_DAY_START', '业务基准日期零点'],
  ['PLANNED_TRIGGER_TIME', '计划触发时间'],
  ['PERIOD_END_TIME', '预报结束时间'],
  ['PRESERVE_OFFSET', '保持与第一个时间的原始间隔']
]

export const FILE_TIME_SOURCE_DESCRIPTIONS = {
  BUSINESS_BASE_TIME: '直接模式下等于计划触发时间；按数据项策略时，实况按数据间隔对齐，预报按起报点或数据间隔对齐。',
  BUSINESS_DAY_START: '取业务基准时间所在日期的 00:00:00。',
  PLANNED_TRIGGER_TIME: '直接使用本次任务的计划触发时间，不做数据项时间对齐。',
  PERIOD_END_TIME: '使用业务基准时间加数据项 period 小时，仅适用于预报数据。',
  PRESERVE_OFFSET: '以指定的文件名时间片段为基准，保留样例中两个时间片段的原始间隔。'
}

export function fileTimeSourceDescription(source) {
  return FILE_TIME_SOURCE_DESCRIPTIONS[source] || '按照所选时间来源生成。'
}

export const FILE_CONTENT_MODES = [
  ['SHIFT', '整体平移'],
  ['SHIFT_BY_FILENAME_DELTA', '按文件名时间差平移'],
  ['SET', '设置为同一时间'],
  ['DERIVED', '基准时间加固定时长'],
  ['RELATIVE', '保持字段间原始时差'],
  ['COMPOSITE', '拆分年月日时分'],
  ['KEY_VALUE', '键值文本替换']
]
