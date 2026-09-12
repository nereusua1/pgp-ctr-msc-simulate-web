/** FILE 报文允许的存储类型；未知或历史空值统一回退到 OSS。 */
export function normalizeStorageType(value) {
    const type = String(value || '').trim().toUpperCase()
    return type === 'OBS' || type === 'HTTP' ? type : 'OSS'
}

/** 创建 FILE 配置的唯一默认值，避免新建、切换类型和历史数据回填产生差异。 */
/**
 * @param {Object} overrides
 * @param {string} [overrides.storageType]
 */
export function createFileGeneration(overrides = {}) {
    const {storageType, ...rest} = overrides
    return {
        storageType: normalizeStorageType(storageType ?? 'OSS'),
        sourceFileName: '',
        sourceFilePath: '',
        schemaVersion: 2,
        parserMode: 'DELIMITED',
        encoding: 'AUTO',
        delimiter: 'AUTO',
        fileNameBindings: [],
        contentBindings: [],
        ...rest
    }
}

/** 历史单时间列配置升级为规则数组，保证旧报文仍可继续编辑和执行。 */
export function normalizeFileGeneration(value = {}) {
    const normalized = createFileGeneration(value)
    if (!normalized.contentBindings.length && value.timeColumn) {
        normalized.contentBindings = [{
            mode: 'SHIFT', fields: [value.timeColumn],
            format: value.sourceTimeFormat || 'yyyy-MM-dd_HH:mm:ss', source: 'BUSINESS_BASE_TIME'
        }]
    }
    return normalized
}
