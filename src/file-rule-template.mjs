/** 复制业务配置为独立草稿，不继承标识、版本或引用信息。 */
export function copyFileRuleTemplate(template) {
  return JSON.parse(JSON.stringify({
    name: `${template.name || '文件规则模板'}（副本）`,
    status: 'DRAFT', code: null, description: template.description || '',
    binding: template.binding || {}, match: template.match || {}, rule: template.rule || {}
  }))
}

/** 将要素集合规范化为排序后的编码数组，选择顺序不影响模板匹配。 */
export function elementCodesOf(binding = {}) {
  const values = Array.isArray(binding.elementCodes)
    ? binding.elementCodes
    : (Array.isArray(binding.elements) ? binding.elements.map(item => item?.code) : [])
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort()
}

/** 判断已发布文件模板是否与报文的数据源、数据项、要素项完全一致。 */
export function matchesFileRuleTemplate(template = {}, binding = {}) {
  if (template.status !== 'PUBLISHED' || !template.binding) return false
  return String(template.binding.sourceCode || '') === String(binding.sourceCode || '')
    && String(template.binding.dataItemCode || '') === String(binding.dataItemCode || '')
    && JSON.stringify(elementCodesOf(template.binding)) === JSON.stringify(elementCodesOf(binding))
}

/** 返回三要素完全匹配的已发布模板；后端保证正常情况下最多一个。 */
export function matchingFileRuleTemplates(templates = [], binding = {}) {
  if (!binding.sourceCode || !binding.dataItemCode || !elementCodesOf(binding).length) return []
  return templates.filter(template => matchesFileRuleTemplate(template, binding))
}

/** 返回同一数据源和数据项下的已发布候选模板，供要素集合尚未选完整时直接采用。 */
export function candidateFileRuleTemplates(templates = [], binding = {}) {
  if (!binding.sourceCode || !binding.dataItemCode) return []
  return templates.filter(template => template.status === 'PUBLISHED' && template.binding
    && String(template.binding.sourceCode || '') === String(binding.sourceCode)
    && String(template.binding.dataItemCode || '') === String(binding.dataItemCode))
}

/**
 * 将模板规则复制为报文内联快照，同时保留报文自己的存储类型和源文件地址。
 * 运行时只读取快照，模板后续升级不会静默改变已经发布的报文。
 */
export function applyFileRuleTemplate(current = {}, template = {}) {
  const rule = JSON.parse(JSON.stringify(template.rule || {}))
  return {
    ...rule,
    storageType: current.storageType || rule.storageType || 'OSS',
    sourceFilePath: current.sourceFilePath || '',
    sourceFileName: current.sourceFileName || rule.sourceFileName || '',
    ruleTemplateId: template.id,
    ruleTemplateVersion: Number(template.version || 1),
    ruleTemplateName: template.name || ''
  }
}
