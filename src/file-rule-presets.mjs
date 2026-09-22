export const FILE_TIME_GROUPS = [
  {value: 'CURRENT_TIME', label: '当前时间', options: [
    ['PLANNED_TRIGGER_TIME', '本次任务时间'], ['CURRENT_DAY', '当前时间所在日期零点'], ['CURRENT_HOUR', '当前时间所在整点']
  ]},
  {value: 'ISSUE_TIME', label: '起报时间', options: [
    ['BUSINESS_BASE_TIME', '起报时刻'], ['BUSINESS_DAY_START', '起报日期零点']
  ]},
  {value: 'FORECAST_TIME', label: '预报时间', options: [
    ['DATA_INTERVAL_SEQUENCE', '按数据间隔生成'], ['FORECAST_FIRST_TIME', '第一个预报时间'], ['PERIOD_END_TIME', '预报结束时间']
  ]}
]

export const FILE_TIME_SOURCES = FILE_TIME_GROUPS.map(group => [group.value, group.label])

export function fileTimeCategory(source) {
  return FILE_TIME_GROUPS.find(group => group.options.some(option => option[0] === source))?.value || 'ISSUE_TIME'
}

export function fileTimeOptions(category) {
  return FILE_TIME_GROUPS.find(group => group.value === category)?.options || FILE_TIME_GROUPS[1].options
}

export const FILE_TIME_SOURCE_DESCRIPTIONS = {
  CURRENT_TIME: '以本次任务时间为基准，可取原时刻、所在日期零点或所在整点。',
  ISSUE_TIME: '以业务起报时间为基准，可取起报时刻或起报日期零点。',
  FORECAST_TIME: '仅适用于预报业务，可按数据间隔生成、取第一个预报时间或预报结束时间。'
}

export function fileTimeSourceDescription(source) {
  return FILE_TIME_SOURCE_DESCRIPTIONS[source] || '按照所选时间来源生成。'
}

export const FILE_CONTENT_MODES = [
  ['SHIFT', '按时间序列生成'],
  ['SET', '设置为同一时间'],
  ['COMPOSITE', '拆分年月日时分'],
  ['KEY_VALUE', '键值文本替换']
]
