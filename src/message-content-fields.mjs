const normalizedPath = path => path.replace(/(?:\[\*\])+/g, '[*]')

function collect(value, path, fields, include) {
  if (Array.isArray(value)) {
    value.forEach(item => collect(item, `${path}[*]`, fields, include))
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collect(item, `${path}.${key}`, fields, include))
    return
  }
  const field = include(value, normalizedPath(path))
  if (field && !fields.has(field.path)) fields.set(field.path, field)
}

/** 从 JSON 正文识别可配置的时间字段；无法解析时返回空列表。 */
export function detectTimeFields(content) {
  try {
    const fields = new Map()
    collect(JSON.parse(content || '{}'), '$', fields, (value, path) => {
      const format = typeof value === 'string' && /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
        ? 'yyyy/MM/dd HH:mm:ss'
        : (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value) ? 'yyyy-MM-dd HH:mm:ss' : '')
      return format ? {path, field: path.split('.').pop(), sample: value, format} : null
    })
    return [...fields.values()]
  } catch {
    return []
  }
}

/** 从 JSON 正文识别全部标量字段；无法解析时返回空列表。 */
export function detectScalarFields(content) {
  try {
    const fields = new Map()
    collect(JSON.parse(content || '{}'), '$', fields,
      (value, path) => ({path, field: path.split('.').pop(), sample: value}))
    return [...fields.values()]
  } catch {
    return []
  }
}

/** 广度优先读取正文中首个非空同名字符串字段。 */
export function findFirstStringField(content, fieldName) {
  try {
    const queue = [JSON.parse(content || '{}')]
    while (queue.length) {
      const value = queue.shift()
      if (!value || typeof value !== 'object') continue
      if (typeof value[fieldName] === 'string' && value[fieldName].trim()) return value[fieldName].trim()
      queue.push(...Object.values(value).filter(item => item && typeof item === 'object'))
    }
  } catch {
    return ''
  }
  return ''
}
