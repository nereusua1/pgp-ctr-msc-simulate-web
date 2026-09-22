const FORMAT_BY_LENGTH = new Map([
  [6, 'yyyyMM'], [8, 'yyyyMMdd'], [10, 'yyyyMMddHH'],
  [12, 'yyyyMMddHHmm'], [14, 'yyyyMMddHHmmss']
])

const VALUE_FORMATS = [
  ['yyyy-MM-dd HH:mm:ss', /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/],
  ['yyyy-MM-dd_HH:mm:ss', /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}$/],
  ['yyyy/MM/dd HH:mm:ss', /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/],
  ['yyyyMMddHHmmss', /^\d{14}$/], ['yyyyMMddHHmm', /^\d{12}$/],
  ['yyyyMMddHH', /^\d{10}$/], ['yyyy-MM-dd', /^\d{4}-\d{2}-\d{2}$/],
  ['yyyy/MM/dd', /^\d{4}\/\d{2}\/\d{2}$/], ['yyyyMMdd', /^\d{8}$/], ['yyyyMM', /^\d{6}$/]
]
const EMBEDDED_VALUE_FORMATS = [
  ['yyyy-MM-dd HH:mm:ss', /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/],
  ['yyyy-MM-dd_HH:mm:ss', /\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}/],
  ['yyyyMMddHHmmss', /(?<!\d)\d{14}(?!\d)/], ['yyyyMMddHHmm', /(?<!\d)\d{12}(?!\d)/],
  ['yyyyMMddHH', /(?<!\d)\d{10}(?!\d)/], ['yyyyMMdd', /(?<!\d)\d{8}(?!\d)/]
]

/** 识别文件名中与后端 FILE_TIME 规则一致的连续数字时间片段。 */
export function detectFileNameBindings(fileName = '') {
  const tokens = [...String(fileName).matchAll(/(?<!\d)((?:19|20)\d{4}(?:\d{2}){0,4})(?!\d)/g)]
  return tokens.map((match, index) => ({
    index,
    sourceText: match[1],
    format: FORMAT_BY_LENGTH.get(match[1].length) || 'yyyyMMddHH',
    source: 'BUSINESS_BASE_TIME'
  }))
}

function detectEncoding(buffer) {
  try {
    return {encoding: 'UTF-8', text: new TextDecoder('utf-8', {fatal: true}).decode(buffer)}
  } catch {
    return {encoding: 'GB18030', text: new TextDecoder('gb18030').decode(buffer)}
  }
}

/** 最多读取前 512 KiB 样例，避免配置页面因大文件占用过多浏览器内存。 */
export async function readLocalFileSample(file) {
  const buffer = await file.slice(0, 512 * 1024).arrayBuffer()
  return {fileName: file.name, size: file.size, ...detectEncoding(buffer)}
}

function fixedWidthFields(lines) {
  const countIndex = lines.slice(0, 10).findIndex(line => /^\d+$/.test(line.trim()))
  if (countIndex < 0) return []
  const count = Number(lines[countIndex].trim())
  if (!Number.isInteger(count) || count <= 0 || lines.length <= countIndex + count) return []
  const fields = []
  for (const line of lines.slice(countIndex + 1, countIndex + count + 1)) {
    const match = line.match(/^\s*(\d+)\s+(.+?)\s*$/)
    if (!match) return []
    fields.push(match[2].trim())
  }
  return fields
}

function delimiterOf(line = '') {
  const candidates = [[',', ','], ['\t', 'TAB'], ['|', '|'], [';', ';']]
  return candidates.map(([character, value]) => ({value, count: line.split(character).length - 1}))
    .sort((left, right) => right.count - left.count)[0]
}

function valueFormat(value = '') {
  const normalized = String(value).trim()
  return VALUE_FORMATS.find(([, expression]) => expression.test(normalized))?.[0] || ''
}

function splitLine(line, delimiter) {
  const character = delimiter === 'TAB' ? '\t' : delimiter
  return line.split(character).map(value => value.trim().replace(/^"|"$/g, ''))
}

/**
 * 从本地样例推导后端可执行的 V2 时间规则。自动识别只提交有明确证据的字段，
 * 无法可靠判断的文本保持 PASSTHROUGH，交由用户继续调整，避免误改业务数据。
 */
export function analyzeFileRuleSample({fileName = '', text = '', encoding = 'UTF-8'} = {}) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).filter(line => line.trim()).slice(0, 200)
  const fileNameBindings = detectFileNameBindings(fileName)
  const fixedFields = fixedWidthFields(lines)
  const fixedTimeFields = ['Year', 'Month', 'Day', 'Hour'].map(required =>
    fixedFields.find(field => field.toLowerCase() === required.toLowerCase())).filter(Boolean)
  if (fixedTimeFields.length === 4) {
    const sampleValues = splitLine(lines[fixedFields.length + 1] || '', ' ').filter(Boolean)
    const sampleValue = fixedTimeFields.map(field => `${field}=${sampleValues[fixedFields.indexOf(field)] || '—'}`).join('，')
    const binding = {mode: 'SHIFT', fields: fixedTimeFields, source: 'BUSINESS_BASE_TIME', sampleValue}
    return {
      parserMode: 'FIXED_WIDTH', encoding, delimiter: 'AUTO', fileNameBindings,
      contentBindings: [binding], contentCandidates: [binding],
      detectedFields: fixedTimeFields, summary: `识别到定长文件头及 ${fixedTimeFields.join('、')} 组合时间字段`
    }
  }

  const firstLine = lines[0] || ''
  const delimiter = delimiterOf(firstLine)
  if (delimiter?.count > 0 && lines.length > 1) {
    const headers = splitLine(firstLine, delimiter.value)
    const values = splitLine(lines[1], delimiter.value)
    const compositeAliases = new Set(['year', 'mon', 'month', 'day', 'hour', 'min', 'minute'])
    const compositeFields = headers.filter(header => compositeAliases.has(header.toLowerCase()))
    const contentBindings = []
    if (compositeFields.some(field => field.toLowerCase() === 'year')
      && compositeFields.some(field => ['mon', 'month'].includes(field.toLowerCase()))
      && compositeFields.some(field => field.toLowerCase() === 'day')) {
      contentBindings.push({mode: 'COMPOSITE', fields: compositeFields, source: 'BUSINESS_BASE_TIME',
        sampleValue: compositeFields.map(field => `${field}=${values[headers.indexOf(field)] || '—'}`).join('，')})
    }
    headers.forEach((header, index) => {
      if (compositeFields.includes(header)) return
      const format = valueFormat(values[index])
      if (format) contentBindings.push({mode: 'SHIFT', fields: [header], format, source: 'BUSINESS_BASE_TIME', sampleValue: values[index]})
    })
    return {
      parserMode: 'DELIMITED', encoding, delimiter: delimiter.value, fileNameBindings, contentBindings,
      contentCandidates: contentBindings,
      detectedFields: contentBindings.flatMap(binding => binding.fields),
      summary: contentBindings.length ? `识别到 ${contentBindings.length} 组内容时间字段` : '识别到分隔文本结构，未发现明确时间字段'
    }
  }

  const keyValueBindings = []
  for (const line of lines.slice(0, 50)) {
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    const format = valueFormat(line.slice(separatorIndex + 1))
    if (format && !keyValueBindings.some(binding => binding.fields[0] === key)) {
      keyValueBindings.push({mode: 'SHIFT', fields: [key], format, source: 'BUSINESS_BASE_TIME',
        sampleValue: line.slice(separatorIndex + 1).trim()})
    }
  }
  if (!keyValueBindings.length) {
    const positionalCandidates = []
    for (const line of lines.slice(0, 50)) {
      const tokens = line.match(/\S+/g) || []
      tokens.forEach((token, columnIndex) => {
        for (const [format, expression] of EMBEDDED_VALUE_FORMATS) {
          const sampleValue = token.match(expression)?.[0]
          if (!sampleValue) continue
          const candidateId = `${columnIndex}:${format}`
          const existing = positionalCandidates.find(candidate => candidate.candidateId === candidateId)
          if (existing) existing.expectedMatches += 1
          else positionalCandidates.push({candidateId, mode: 'SET', locator: {type: 'TOKEN_COLUMN', columnIndex, separator: 'WHITESPACE', header: false},
            format, source: 'BUSINESS_BASE_TIME', sampleValue, expectedMatches: 1})
          break
        }
      })
    }
    if (positionalCandidates.length) {
      const bindings = positionalCandidates.map(({candidateId, ...candidate}) => candidate)
      return {
        parserMode: 'POSITIONAL_TEXT', encoding, delimiter: 'AUTO', fileNameBindings,
        contentBindings: bindings, contentCandidates: bindings,
        detectedFields: bindings.map(binding => `第 ${binding.locator.columnIndex + 1} 列`),
        summary: `识别到 ${bindings.length} 个无表头时间位置`
      }
    }
  }
  return {
    parserMode: keyValueBindings.length ? 'KEY_VALUE' : 'PASSTHROUGH', encoding, delimiter: 'AUTO',
    fileNameBindings, contentBindings: keyValueBindings, contentCandidates: keyValueBindings,
    detectedFields: keyValueBindings.flatMap(binding => binding.fields),
    summary: keyValueBindings.length ? `识别到 ${keyValueBindings.length} 个键值时间字段` :
      (fileNameBindings.length ? '仅识别到文件名时间，文件内容保持原样' : '未发现可安全自动替换的时间字段')
  }
}
