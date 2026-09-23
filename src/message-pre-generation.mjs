import {createRequestId} from './request-id.mjs'
import {sha256Utf8} from './content-sha256.mjs'
import {isOriginalMessage} from './resource-adapter.mjs'
import {normalizeFileGeneration, normalizeFileGroupExtensions} from './file-storage.mjs'
import {normalizeTimeBinding} from './time-binding.mjs'

const pad = value => String(value).padStart(2, '0')

export function localDateTimeValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatTime(date, pattern = 'yyyy-MM-dd HH:mm:ss') {
  const values = {yyyy: date.getFullYear(), MM: pad(date.getMonth() + 1), dd: pad(date.getDate()), HH: pad(date.getHours()), mm: pad(date.getMinutes()), ss: pad(date.getSeconds())}
  return Object.entries(values).reduce((result, [token, value]) => result.replaceAll(token, value), pattern)
}

function pathParts(path) {
  return String(path || '').replace(/^\$\.?/, '').replace(/\[(\d+|\*)\]/g, '.$1').split('.').filter(Boolean)
}

function setPath(root, path, value) {
  const parts = pathParts(path)
  if (!parts.length) return false

  function replaceAt(target, index) {
    if (target == null) return 0
    const part = parts[index]
    if (part === '*') {
      if (!Array.isArray(target)) return 0
      if (index === parts.length - 1) {
        target.fill(value)
        return target.length
      }
      return target.reduce((count, item) => count + replaceAt(item, index + 1), 0)
    }
    if (index === parts.length - 1) {
      if (!Object.prototype.hasOwnProperty.call(Object(target), part)) return 0
      target[part] = value
      return 1
    }
    return replaceAt(target[part], index + 1)
  }

  return replaceAt(root, 0) > 0
}

function castValue(value, type = 'string') {
  if (type === 'integer') return Number.parseInt(value, 10)
  if (type === 'number') return Number(value)
  if (type === 'boolean') return value === true || String(value).toLowerCase() === 'true'
  if (type === 'json') { try { return JSON.parse(value) } catch { return value } }
  return String(value)
}

function periodHours(template) {
  const values = (template.dataBinding?.elements || []).map(item => Number(item.period)).filter(Number.isFinite)
  return values.length ? Math.max(...values) : 0
}

function periodIntervalMinutes(template) {
  const values = (template.dataBinding?.elements || []).map(item => Number(item.periodInterval ?? item.period_interval)).filter(value => Number.isFinite(value) && value > 0)
  return values.length ? Math.min(...values) : 0
}

function realtimeCurrentTime(template, plannedAt) {
  if (template.businessType !== 'REALTIME') return plannedAt
  const interval = periodIntervalMinutes(template)
  if (!interval) return plannedAt
  const aligned = new Date(plannedAt)
  const minuteOfDay = aligned.getHours() * 60 + aligned.getMinutes()
  const alignedMinute = Math.floor(minuteOfDay / interval) * interval
  aligned.setHours(0, alignedMinute, 0, 0)
  return aligned
}

function parseFileTime(value, pattern) {
  const parts = {yyyy: 1970, MM: 1, dd: 1, HH: 0, mm: 0, ss: 0}
  let cursor = 0
  for (const token of ['yyyy', 'MM', 'dd', 'HH', 'mm', 'ss']) {
    const index = pattern.indexOf(token)
    if (index >= 0) parts[token] = Number(value.slice(index, index + token.length))
    cursor = Math.max(cursor, index + token.length)
  }
  const date = new Date(parts.yyyy, parts.MM - 1, parts.dd, parts.HH, parts.mm, parts.ss)
  return Number.isNaN(date.getTime()) || cursor > value.length ? null : date
}

function generatedFileName(sourceName, bindings, plannedAt, endAt, intervalMinutes = 0) {
  const name = String(sourceName || 'PRE_GENERATED_FILE.dat').split('/').pop()
  if (!bindings?.length) return name
  const matches = [...name.matchAll(/(?<!\d)((?:19|20)\d{4}(?:\d{2}){0,4})(?!\d)/g)]
  const replacements = new Map()
  for (const binding of bindings) {
    const match = matches[Number(binding.index)]
    if (!match) continue
    let target = binding.source === 'PERIOD_END_TIME' ? endAt : plannedAt
    if (binding.source === 'CURRENT_DAY' || binding.source === 'BUSINESS_DAY_START') {
      target = new Date(plannedAt.getFullYear(), plannedAt.getMonth(), plannedAt.getDate())
    }
    if (binding.source === 'CURRENT_HOUR') {
      target = new Date(plannedAt.getFullYear(), plannedAt.getMonth(), plannedAt.getDate(), plannedAt.getHours())
    }
    if (binding.source === 'DATA_INTERVAL_SEQUENCE' || binding.source === 'FORECAST_FIRST_TIME') {
      target = new Date(plannedAt.getTime() + intervalMinutes * 60000)
    }
    if (binding.source === 'PRESERVE_OFFSET') {
      const reference = bindings.find(item => Number(item.index) === Number(binding.relativeTo || 0)) || bindings[0]
      const oldReference = parseFileTime(matches[Number(reference.index)]?.[1] || '', reference.format)
      const oldCurrent = parseFileTime(match[1], binding.format)
      if (oldReference && oldCurrent) target = new Date(plannedAt.getTime() + oldCurrent.getTime() - oldReference.getTime())
    }
    replacements.set(Number(binding.index), formatTime(target, binding.format))
  }
  let cursor = 0
  let result = ''
  matches.forEach((match, index) => {
    result += name.slice(cursor, match.index) + (replacements.get(index) || match[1])
    cursor = match.index + match[1].length
  })
  return result + name.slice(cursor)
}

function replaceFileReferences(value, fileName) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (key === 'fileName') value[key] = fileName
    else if (key === 'filePath' && typeof child === 'string') value[key] = child.replace(/[^/]+$/, fileName)
    else replaceFileReferences(child, fileName)
  }
}

function joinTargetPath(directory, fileName) {
  const prefix = String(directory || '').trim().replace(/\/+$/, '')
  return prefix ? `${prefix}/${fileName}` : fileName
}

function replaceExtension(fileName, extension) {
  const dot = String(fileName || '').lastIndexOf('.')
  return dot > 0 ? `${fileName.slice(0, dot)}${extension}` : `${fileName}${extension}`
}

export function preGenerateMessage(template, plannedValue, now = new Date(), uuidFactory = createRequestId) {
  if (isOriginalMessage(template)) {
    const content = String(template.content || '')
    if (!content.trim()) throw new Error('原报文正文不能为空')
    return {
      content, contentSha256: sha256Utf8(content), messageId: '', replacementCount: 0,
      replacedPaths: [], warnings: [], fileName: '', plannedAt: '', businessBaseAt: '', periodEndAt: '',
      generatedAt: formatTime(now), type: 'FILE', sourceFileName: '', targetFileName: '', targetFilePath: '',
      processingMode: '原报文直发'
    }
  }
  const plannedAt = plannedValue ? new Date(plannedValue) : now
  if (Number.isNaN(plannedAt.getTime())) throw new Error('计划触发时间无效')
  let content
  try { content = JSON.parse(template.content || '') } catch (error) {
    const errorMessage = String(error?.message || '')
    const directLine = Number(errorMessage.match(/line\s+(\d+)/i)?.[1])
    const positionMatch = errorMessage.match(/position\s+(\d+)/i)
    const position = positionMatch ? Number(positionMatch[1]) : Number.NaN
    const line = Number.isFinite(directLine) ? directLine : (Number.isFinite(position)
      ? String(template.content || '').slice(0, position).split('\n').length
      : String(template.content || '').split('\n').length)
    throw new Error(`报文内容不是有效的 JSON${line ? `（第 ${line} 行附近）` : ''}，无法预生成`)
  }
  // 预生成与真实执行保持同一标识格式，便于在投递前直接核对正文 Message ID。
  const messageId = uuidFactory()
  const currentAt = realtimeCurrentTime(template, plannedAt)
  const endAt = new Date(currentAt.getTime() + periodHours(template) * 3600000)
  const warnings = []
  const replacedPaths = []
  let replacementCount = 0
  for (const binding of template.bindings || []) {
    let value
    const format = binding.format || 'yyyy-MM-dd HH:mm:ss'
    const provider = binding.provider || binding.strategy
    if (provider === 'MESSAGE_ID') value = messageId
    else if (provider === 'TASK_TRIGGER_TIME' || provider === 'PLANNED_TRIGGER_TIME' || provider === 'BUSINESS_BASE_TIME' || provider === 'DATA_INTERVAL_SEQUENCE') value = formatTime(currentAt, format)
    else if (provider === 'PERIOD_END_TIME') value = formatTime(endAt, format)
    else if (provider === 'CONSTANT') value = castValue(binding.value, binding.targetType)
    else continue
    if (setPath(content, binding.path, value)) {
      replacementCount += 1
      replacedPaths.push(binding.path)
    }
    else warnings.push(`未找到绑定字段 ${binding.path}`)
  }
  let fileName = ''
  let targetFiles = []
  if (template.type === 'FILE' || template.type === 'UNSTRUCTURED_FILE') {
    const configuredName = template.fileGeneration?.sourceFileName || findFirstValue(content, 'fileName')
    fileName = generatedFileName(configuredName, template.fileGeneration?.fileNameBindings, currentAt, endAt, periodIntervalMinutes(template))
    if (template.type === 'UNSTRUCTURED_FILE') {
      const generation = template.fileGeneration || {}
      const targetPath = joinTargetPath(generation.targetDirectory, fileName)
      const extensions = normalizeFileGroupExtensions(generation.fileGroup, generation.fileType)
      targetFiles = extensions.length
        ? extensions.map(extension => joinTargetPath(generation.targetDirectory, replaceExtension(fileName, extension)))
        : [targetPath]
      setPath(content, generation.fileNamePath || '$.fileName', fileName)
      setPath(content, generation.filePathPath || '$.filePath', targetPath)
      if (generation.fileTypePath) setPath(content, generation.fileTypePath, generation.fileType || 'OTHER')
      replaceFileReferences(content, fileName)
    } else replaceFileReferences(content, fileName)
  }
  return {
    content: JSON.stringify(content, null, 2), messageId, replacementCount, replacedPaths, warnings, fileName,
    plannedAt: formatTime(plannedAt), businessBaseAt: formatTime(currentAt), periodEndAt: formatTime(endAt),
    generatedAt: formatTime(now), type: template.type || 'JSON',
    sourceFileName: template.fileGeneration?.sourceFileName || '',
    targetFileName: fileName,
    targetFilePath: template.type === 'UNSTRUCTURED_FILE' ? joinTargetPath(template.fileGeneration?.targetDirectory, fileName) : '',
    targetFiles,
    processingMode: template.type === 'UNSTRUCTURED_FILE' ? '原样复制' : (template.type === 'FILE' ? '结构化解析并替换时间字段' : '')
  }
}

function findFirstValue(root, key) {
  if (!root || typeof root !== 'object') return ''
  if (typeof root[key] === 'string' && root[key]) return root[key]
  for (const child of Object.values(root)) {
    const found = findFirstValue(child, key)
    if (found) return found
  }
  return ''
}

export function copyMessageDraft(template, name, includeDeliveryTargets = false) {
  const clone = JSON.parse(JSON.stringify(template || {}))
  for (const key of ['id', 'code', 'createdAt', 'updatedAt', 'messages']) delete clone[key]
  clone.name = String(name || '').trim()
  clone.status = 'DRAFT'
  delete clone.timePlan
  if (Array.isArray(clone.bindings)) {
    clone.bindings = clone.bindings.map(binding => normalizeTimeBinding(binding, clone.businessType || 'FORECAST'))
  }
  if (clone.fileGeneration && (clone.type === 'FILE' || clone.type === 'FILE_REFERENCE' || clone.type === 'UNSTRUCTURED_FILE')) {
    clone.fileGeneration = normalizeFileGeneration(clone.fileGeneration, clone.type === 'UNSTRUCTURED_FILE' ? 'UNSTRUCTURED_FILE' : 'FILE')
  }
  if (!includeDeliveryTargets) {
    clone.deliveryTargets = []
    clone.componentIds = []
    clone.componentId = ''
    clone.producerGroup = ''
    clone.topic = ''
  }
  return clone
}
