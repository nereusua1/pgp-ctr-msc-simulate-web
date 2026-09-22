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
export function createFileGeneration(overrides = {}, messageType = 'FILE') {
    const {storageType, ...rest} = overrides
    const unstructured = messageType === 'UNSTRUCTURED_FILE'
    const processingMode = unstructured ? 'BINARY_COPY'
        : (Object.prototype.hasOwnProperty.call(rest, 'processingMode') ? String(rest.processingMode || '').toUpperCase() : 'RULE_DRIVEN')
    if (!unstructured && processingMode === 'ORIGINAL_MESSAGE') {
        return {schemaVersion: 3, processingMode: 'ORIGINAL_MESSAGE'}
    }
    const base = {
        storageType: normalizeStorageType(storageType ?? 'OSS'),
        sourceFileName: '',
        sourceFilePath: '',
        schemaVersion: unstructured ? 3 : 2,
        ...(unstructured ? {
            targetDirectory: '',
            fileNamePath: '$.fileName',
            filePathPath: '$.filePath',
            fileTypePath: '$.fileType',
            fileSizePath: '$.fileSize',
            fileType: 'OTHER',
            overwritePolicy: 'OVERWRITE', collisionPolicy: 'OVERWRITE', processingMode: 'BINARY_COPY',
            fileGroup: null
        } : {processingMode, encoding: 'AUTO', delimiter: 'AUTO'}),
        fileNameBindings: [],
        ...(unstructured ? {} : {contentBindings: []}),
        ...rest
    }
    if (unstructured) {
        base.referenceBindings = {...(overrides.referenceBindings || {}),
            fileNamePath: overrides.fileNamePath || overrides.referenceBindings?.fileNamePath || '$.fileName',
            filePathPath: overrides.filePathPath || overrides.referenceBindings?.filePathPath || '$.filePath',
            fileTypePath: overrides.fileTypePath || overrides.referenceBindings?.fileTypePath || '$.fileType',
            fileSizePath: overrides.fileSizePath || overrides.referenceBindings?.fileSizePath || '$.fileSize'}
        base.collisionPolicy = overrides.collisionPolicy || (overrides.overwritePolicy === 'FAIL' ? 'FAIL_IF_EXISTS' : 'OVERWRITE')
    }
    return base
}

/** Shapefile 文件组默认包含主文件及三种常用附属文件。 */
export const SHAPEFILE_EXTENSIONS = Object.freeze(['.shp', '.shx', '.dbf', '.prj'])

/** 返回规范化、去重后的附属文件扩展名。 */
export function normalizeFileGroupExtensions(fileGroup, fileType = '') {
    const hasConfiguredSidecars = Array.isArray(fileGroup?.sidecars)
    const values = hasConfiguredSidecars
        ? fileGroup.sidecars
        : (String(fileType).toUpperCase() === 'SHAPEFILE' ? SHAPEFILE_EXTENSIONS : [])
    return [...new Set(values.map(value => String(value || '').trim().toLowerCase()).filter(value => /^\.[a-z0-9]+$/.test(value)))]
}

/** 历史单时间列配置升级为规则数组，保证旧报文仍可继续编辑和执行。 */
export function normalizeFileGeneration(value = {}, messageType = 'FILE') {
    const normalized = createFileGeneration(value, messageType)
    if (messageType !== 'UNSTRUCTURED_FILE' && normalized.processingMode === 'ORIGINAL_MESSAGE') return normalized
    if (messageType === 'UNSTRUCTURED_FILE') {
        delete normalized.encoding
        delete normalized.delimiter
        delete normalized.timeColumn
        delete normalized.sourceTimeFormat
        delete normalized.contentBindings
        normalized.fileNameBindings = (normalized.fileNameBindings || []).map(normalizeFileTimeBinding)
        delete normalized.parserMode
        return normalized
    }
    if (!normalized.contentBindings.length && value.timeColumn) {
        normalized.contentBindings = [{
            mode: 'SHIFT', fields: [value.timeColumn],
            format: value.sourceTimeFormat || 'yyyy-MM-dd_HH:mm:ss', source: 'BUSINESS_BASE_TIME'
        }]
    }
    normalized.fileNameBindings = (normalized.fileNameBindings || []).map(normalizeFileTimeBinding)
    normalized.contentBindings = (normalized.contentBindings || []).map(normalizeFileTimeBinding)
    return normalized
}

const FILE_TIME_METHODS = {
    CURRENT_TIME: ['PLANNED_TRIGGER_TIME', 'CURRENT_DAY', 'CURRENT_HOUR'],
    ISSUE_TIME: ['BUSINESS_BASE_TIME', 'BUSINESS_DAY_START'],
    FORECAST_TIME: ['DATA_INTERVAL_SEQUENCE', 'FORECAST_FIRST_TIME', 'PERIOD_END_TIME']
}

/** 旧配置只有 source；编辑时自动补出一级来源，新配置同时持久化两级选择。 */
function normalizeFileTimeBinding(binding = {}) {
    const source = binding.provider || binding.source || 'BUSINESS_BASE_TIME'
    const sourceCategory = Object.entries(FILE_TIME_METHODS).find(([, methods]) => methods.includes(source))?.[0] || 'ISSUE_TIME'
    const normalizedSource = FILE_TIME_METHODS[sourceCategory].includes(source) ? source : FILE_TIME_METHODS[sourceCategory][0]
    const normalized = {...binding, sourceCategory, source: normalizedSource}
    delete normalized.provider
    return normalized
}
