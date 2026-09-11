/** FILE 报文允许的对象存储类型；未知或历史空值统一回退到 OSS。 */
export function normalizeStorageType(value) {
  return String(value || '').toUpperCase() === 'OBS' ? 'OBS' : 'OSS'
}

/** 创建 FILE 配置的唯一默认值，避免新建、切换类型和历史数据回填产生差异。 */
export function createFileGeneration(overrides = {}) {
  return {
    storageType: 'OSS',
    sourceFileName: '',
    sourceFilePath: '',
    timeColumn: '预报时间',
    sourceTimeFormat: 'yyyy-MM-dd_HH:mm:ss',
    delimiter: ',',
    ...overrides,
    storageType: normalizeStorageType(overrides.storageType)
  }
}
