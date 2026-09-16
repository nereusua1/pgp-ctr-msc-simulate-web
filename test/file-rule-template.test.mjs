import assert from 'node:assert/strict'
import test from 'node:test'
import {applyFileRuleTemplate, matchingFileRuleTemplates, copyFileRuleTemplate} from '../src/file-rule-template.mjs'

test('复制文件规则生成独立草稿并保留配置，不继承标识及版本', () => {
  const original = {id: 'old', version: 4, status: 'PUBLISHED', name: '预报', binding: {elementCodes: ['A']}, rule: {fileNameBindings: [{index: 0}]}}
  const copied = copyFileRuleTemplate(original)
  assert.equal(copied.status, 'DRAFT')
  assert.equal(copied.name, '预报（副本）')
  assert.equal(copied.id, undefined)
  assert.equal(copied.version, undefined)
  assert.deepEqual(copied.rule, original.rule)
  copied.rule.fileNameBindings[0].index = 2
  copied.binding.elementCodes.push('B')
  assert.equal(original.rule.fileNameBindings[0].index, 0)
  assert.deepEqual(original.binding.elementCodes, ['A'])
})

test('文件规则模板按数据源、数据项和无序要素集合精确匹配', () => {
  const templates = [{id:'t1', status:'PUBLISHED', binding:{sourceCode:'S1', dataItemCode:'D1', elementCodes:['B', 'A']}}]
  const binding = {sourceCode:'S1', dataItemCode:'D1', elements:[{code:'A'}, {code:'B'}]}
  assert.equal(matchingFileRuleTemplates(templates, binding)[0].id, 't1')
  assert.equal(matchingFileRuleTemplates(templates, {...binding, elements:[{code:'A'}]}).length, 0)
})

test('应用模板复制规则快照并保留报文自己的源地址和存储类型', () => {
  const result = applyFileRuleTemplate(
    {storageType:'HTTP', sourceFilePath:'http://host/input.txt'},
    {id:'t1', name:'定长规则', version:3, rule:{parserMode:'FIXED_WIDTH', sourceFileName:'sample.txt'}}
  )
  assert.equal(result.parserMode, 'FIXED_WIDTH')
  assert.equal(result.storageType, 'HTTP')
  assert.equal(result.sourceFilePath, 'http://host/input.txt')
  assert.equal(result.ruleTemplateVersion, 3)
})
