import {createRequestId} from './request-id.mjs'

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

function generatedFileName(sourceName, bindings, plannedAt, endAt) {
  const name = String(sourceName || 'PRE_GENERATED_FILE.dat').split('/').pop()
  if (!bindings?.length) return name
  const matches = [...name.matchAll(/(?<!\d)((?:19|20)\d{4}(?:\d{2}){0,4})(?!\d)/g)]
  const replacements = new Map()
  for (const binding of bindings) {
    const match = matches[Number(binding.index)]
    if (!match) continue
    let target = binding.source === 'PERIOD_END_TIME' ? endAt : plannedAt
    if (binding.source === 'BUSINESS_DAY_START') target = new Date(plannedAt.getFullYear(), plannedAt.getMonth(), plannedAt.getDate())
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

export function preGenerateMessage(template, plannedValue, now = new Date(), uuidFactory = createRequestId) {
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
  const endAt = new Date(plannedAt.getTime() + periodHours(template) * 3600000)
  const warnings = []
  const replacedPaths = []
  let replacementCount = 0
  for (const binding of template.bindings || []) {
    let value
    const format = binding.format || 'yyyy-MM-dd HH:mm:ss'
    const provider = binding.provider || binding.strategy
    if (provider === 'MESSAGE_ID') value = messageId
    else if (provider === 'TASK_TRIGGER_TIME' || provider === 'PLANNED_TRIGGER_TIME' || provider === 'BUSINESS_BASE_TIME' || provider === 'DATA_INTERVAL_SEQUENCE') value = formatTime(plannedAt, format)
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
  if (template.type === 'FILE') {
    const configuredName = template.fileGeneration?.sourceFileName || findFirstValue(content, 'fileName')
    fileName = generatedFileName(configuredName, template.fileGeneration?.fileNameBindings, plannedAt, endAt)
    replaceFileReferences(content, fileName)
  }
  return {
    content: JSON.stringify(content, null, 2), messageId, replacementCount, replacedPaths, warnings, fileName,
    plannedAt: formatTime(plannedAt), businessBaseAt: formatTime(plannedAt), periodEndAt: formatTime(endAt),
    generatedAt: formatTime(now), type: template.type || 'JSON'
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
  if (!includeDeliveryTargets) {
    clone.deliveryTargets = []
    clone.componentIds = []
    clone.componentId = ''
    clone.producerGroup = ''
    clone.topic = ''
  }
  return clone
}
