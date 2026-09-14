const shift = (field, format, source = 'BUSINESS_BASE_TIME') => ({mode: 'SHIFT', fields: [field], format, source})
const filename = (index, format, source = 'BUSINESS_BASE_TIME', relativeTo = null) => ({index, format, source, relativeTo})
const composite = fields => ({mode: 'COMPOSITE', fields, source: 'BUSINESS_BASE_TIME'})
const positioned = (locator, format, mode = 'SET', source = 'BUSINESS_BASE_TIME', expectedMatches = 1, referenceFileNameTimeIndex = 0) => ({
  mode, locator, format, source, expectedMatches, referenceFileNameTimeIndex
})

/**
 * 根据用户提供的 1～22 类文件样例整理的首版规则模板。
 * 模板只描述文件结构与时间语义，不保存环境相关的 OSS/OBS/HTTP 地址。
 */
export const FILE_RULE_PRESETS = [
  ['01', '短临空气污染预报', 'POLLUTION_SHORT_20250610.csv', ',', 'UTF-8', [filename(0, 'yyyyMMdd')], [shift('预报时间', 'yyyy-MM-dd_HH:mm:ss')]],
  ['02', '长期空气污染预报', 'POLLUTION_LONG_20250609.csv', ',', 'UTF-8', [filename(0, 'yyyyMMdd')], [shift('预报时间', 'yyyy-MM-dd')]],
  ['03', '城市 72 小时逐 15 分钟预报', 'forecast_hours72multi_2025061008.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('datatime', 'yyyyMMddHHmm')]],
  ['04', '长期逐日预报', 'forecast_days270_2025061008.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('datatime', 'yyyyMMdd')]],
  ['05', '未来 6 天预报', 'forecast_days6_2025061008.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('data_time', 'yyyyMMdd')]],
  ['06', '未来 10 天预报', 'forecast_days10_2025061008.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('data_time', 'yyyyMMdd')]],
  ['07', '未来 40 天预报', 'forecast_days40_2025061008.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('data_time', 'yyyyMMdd')]],
  ['08', '未来 72 小时预报', 'forecast_hours72_2025061008.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('data_time', 'yyyyMMddHH')]],
  ['09', '未来 7 天逐 3 小时预报', 'forecast_days7_2025061008.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('data_time', 'yyyyMMddHH')]],
  ['10-1', '未来 7 天逐 15 分钟预报', 'forecast_7days_15min_2025121608.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('datatime', 'yyyyMMddHHmm')]],
  ['10-2', '未来 7 天逐小时预报', 'forecast_7days_1hour_2025092908.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('datatime', 'yyyyMMddHH')]],
  ['10-3', '未来 30 天预报', 'forecast_30days_2025121608.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH')], [shift('datatime', 'yyyyMMdd')]],
  ['10-4', '逐周预报', 'forecast_week_2025092900_2026062923.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH'), filename(1, 'yyyyMMddHH', 'PRESERVE_OFFSET', 0)], [shift('datetime', 'yyyyMMdd')]],
  ['10-5', '逐月预报', 'forecast_month_2025060100_2026022823.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH'), filename(1, 'yyyyMMddHH', 'PRESERVE_OFFSET', 0)], [shift('month', 'yyyyMM')]],
  ['10-6', '逐季度预报', 'forecast_season_2025040100_2025123123.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH'), filename(1, 'yyyyMMddHH', 'PRESERVE_OFFSET', 0)], [shift('season', 'yyyy年Q季度')]],
  ['11', '日出日落预报', 'sunrise-set_2025061000_2025061623.csv', ',', 'UTF-8', [filename(0, 'yyyyMMddHH'), filename(1, 'yyyyMMddHH', 'PRESERVE_OFFSET', 0)], [shift('datatime', 'yyyyMMdd')]],
  ['12', '极端灾害监测', 'disaster_monitor_202407.csv', ',', 'UTF-8', [filename(0, 'yyyyMM')], [
    {mode: 'SET', fields: ['month'], format: 'yyyyMM', source: 'BUSINESS_BASE_TIME'},
    {mode: 'SET', fields: ['starttime'], format: 'yyyy-MM-dd HH:mm:ss', source: 'BUSINESS_BASE_TIME'},
    {mode: 'DERIVED', fields: ['endtime'], format: 'yyyy-MM-dd HH:mm:ss', source: 'BUSINESS_BASE_TIME', offsetMinutes: 14400}
  ]],
  ['13-A', '三十年历史区域数据', 'A_202601.csv', ',', 'GB18030', [filename(0, 'yyyyMM')], [shift('Time', 'yyyy/MM/dd')]],
  ['13-S', '三十年历史场站数据', 'S_202601.csv', ',', 'GB18030', [filename(0, 'yyyyMM')], [shift('Time', 'yyyy/MM/dd')]],
  ['14', '灾害预警', '20250610063100.csv', ',', 'GB18030', [filename(0, 'yyyyMMddHHmmss')], [shift('d_datetime', 'yyyy-MM-dd HH:mm:ss')]],
  ['15-7D1H', '空气污染 7 天逐小时预报', 'FCST_ENVI_CITY_7D1H_2025061008_2025061623.txt', ',', 'UTF-8', [filename(0, 'yyyyMMddHH'), filename(1, 'yyyyMMddHH', 'PRESERVE_OFFSET', 0)], [{mode: 'RELATIVE', fields: ['s_time', 'f_time'], format: 'yyyyMMddHH', source: 'BUSINESS_BASE_TIME'}]],
  ['15-30D1D', '空气污染 30 天逐日预报', 'FCST_ENVI_CITY_30D1D_20250610_20250709.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMdd'), filename(1, 'yyyyMMdd', 'PRESERVE_OFFSET', 0)], [{mode: 'RELATIVE', fields: ['s_time', 'f_time'], format: 'yyyy-MM-dd', source: 'BUSINESS_BASE_TIME'}]],
  ['15-WEEK', '空气污染逐周预报', 'FCST_ENVI_CITY_WEEK_20250609_20250616.txt', ',', 'UTF-8', [filename(0, 'yyyyMMdd'), filename(1, 'yyyyMMdd', 'PRESERVE_OFFSET', 0)], []],
  ['15-1M1M', '空气污染逐月预报', 'FCST_ENVI_CITY_1M1M_20250601_20250630.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMdd'), filename(1, 'yyyyMMdd', 'PRESERVE_OFFSET', 0)], [{mode: 'SET', fields: ['month'], format: 'yyyyMM', source: 'BUSINESS_BASE_TIME'}]],
  ['16-HOUR', '环境监测小时数据', 'ENVI_CITY_HOUR_2025061001.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMddHH')], [composite(['Year', 'Mon', 'Day', 'Hour'])]],
  ['16-DAY', '环境监测日数据', 'ENVI_CITY_DAY_20250610.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMdd')], [composite(['Year', 'Mon', 'Day'])]],
  ['17', '五分钟站点数据', 'SURF_MIN_202511260005.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMddHHmm')], [composite(['Year', 'Mon', 'Day', 'Hour', 'Min'])]],
  ['18', '逐小时站点数据', 'SURF_HOR_2025061001.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMddHH')], [composite(['Year', 'Mon', 'Day', 'Hour'])]],
  ['19', '闪电定位数据', 'Z_UPAR_C_BABJ_20240429194500_P_LPD_LOCATE.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMddHHmmss')], [{mode: 'KEY_VALUE', fields: ['时间'], format: 'yyyy-MM-dd HH:mm:ss', source: 'BUSINESS_BASE_TIME'}], 'KEY_VALUE'],
  ['20-HOUR', '气象实况小时数据', 'SURF_CITY_HOUR_2025061010.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMddHH')], [composite(['Year', 'Mon', 'Day', 'Hour'])]],
  ['20-DAY', '气象实况日数据', 'SURF_CITY_DAY_20250731.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMdd')], [composite(['Year', 'Mon', 'Day'])]],
  ['21', '全国和省级实况数据', 'SURF_NATIONAL_20250610.txt', 'TAB', 'UTF-8', [filename(0, 'yyyyMMdd')], [composite(['Year', 'Mon', 'Day'])]],
  ['GY-RSM', '工研院土壤墒情', 'MSP3_PMSC_SMMFC_RSM_LM10-50_CHN_20250917000000_00000-02400.csv', 'AUTO', 'AUTO', [filename(0, 'yyyyMMddHHmmss', 'BUSINESS_DAY_START')], [], 'PASSTHROUGH'],
  ['GY-DROUGHT', '工研院干旱实况', 'MSP3_PMSC_SMMFC_SoilDrought_LNO_CHN_20250917000000_00000-02400.csv', 'AUTO', 'AUTO', [filename(0, 'yyyyMMddHHmmss', 'BUSINESS_DAY_START')], [], 'PASSTHROUGH'],
  ['GY-FORECAST', '工研院未来 10 日干旱预报', 'MSP3_PMSC_SMMFC_SoilDroughtForecast_LNO_CHN_20250918000000_00000-24000.csv', 'AUTO', 'AUTO', [filename(0, 'yyyyMMddHHmmss', 'BUSINESS_DAY_START')], [], 'PASSTHROUGH'],
  ['GS-CITY', '甘肃短中期城镇精细化预报', 'Z_SEVP_C_BCLZ_20260320224506_P_RFFC-SPCC-202603200000-16812.TXT', 'AUTO', 'AUTO', [
    filename(0, 'yyyyMMddHHmmss', 'PLANNED_TRIGGER_TIME'), filename(1, 'yyyyMMddHHmm', 'BUSINESS_BASE_TIME')
  ], [
    positioned({type: 'LINE_SUFFIX', suffix: '时兰州区域中心订正预报', tokenIndex: 0}, 'yyyyMMddHHmm'),
    positioned({type: 'LINE_PREFIX', prefix: 'SPCC', tokenIndex: 1}, 'yyyyMMddHH')
  ], 'POSITIONAL_TEXT'],
  ['GS-WIND', '甘肃短中期风电预报', 'ZJJFDC_2026041808.txt.txt', 'AUTO', 'AUTO', [filename(0, 'yyyyMMddHH')], [
    positioned({type: 'TOKEN_COLUMN', columnIndex: 1, separator: 'TAB', header: false}, 'yyyy-MM-dd_HH:mm', 'SHIFT_BY_FILENAME_DELTA', 'BUSINESS_BASE_TIME', 'ALL_ROWS')
  ], 'POSITIONAL_TEXT'],
  ['GS-PV', '甘肃短中期光伏预报', 'ZZJGGF-sun-2026041708.txt', 'AUTO', 'AUTO', [filename(0, 'yyyyMMddHH')], [
    positioned({type: 'TOKEN_COLUMN', columnIndex: 0, separator: 'WHITESPACE', header: false}, 'yyyyMMddHHmm', 'SHIFT_BY_FILENAME_DELTA', 'BUSINESS_BASE_TIME', 'ALL_ROWS')
  ], 'POSITIONAL_TEXT'],
  ['22', '极端天气预警定长文件', 'D7babj2520_博罗依.txt', 'AUTO', 'UTF-8', [], [
    {mode: 'SHIFT', fields: ['Year', 'Month', 'Day', 'Hour'], source: 'BUSINESS_BASE_TIME'}
  ], 'FIXED_WIDTH']
].map(([id, name, sourceFileName, delimiter, encoding, fileNameBindings, contentBindings, parserMode = 'DELIMITED', enabled = true]) => ({
  id, name, enabled, sourceFileName, parserMode, delimiter, encoding, fileNameBindings, contentBindings
}))

export function fileRulePreset(id) {
  const preset = FILE_RULE_PRESETS.find(item => item.id === id)
  return preset ? JSON.parse(JSON.stringify(preset)) : null
}

export const FILE_TIME_SOURCES = [
  ['BUSINESS_BASE_TIME', '业务基准时间'],
  ['BUSINESS_DAY_START', '业务基准日期零点'],
  ['PLANNED_TRIGGER_TIME', '计划触发时间'],
  ['PERIOD_END_TIME', '数据结束时间'],
  ['PRESERVE_OFFSET', '保持与第一个时间的原始间隔']
]

export const FILE_CONTENT_MODES = [
  ['SHIFT', '整体平移'],
  ['SHIFT_BY_FILENAME_DELTA', '按文件名时间差平移'],
  ['SET', '设置为同一时间'],
  ['DERIVED', '基准时间加固定时长'],
  ['RELATIVE', '保持字段间原始时差'],
  ['COMPOSITE', '拆分年月日时分'],
  ['KEY_VALUE', '键值文本替换']
]
