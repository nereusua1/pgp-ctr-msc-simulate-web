import assert from 'node:assert/strict'
import test from 'node:test'
import {FILE_RULE_PRESETS, fileRulePreset} from '../src/file-rule-presets.mjs'
import {normalizeFileGeneration} from '../src/file-storage.mjs'

test('用户样例形成可复用规则模板并开放定长文件时间平移', () => {
  assert.equal(FILE_RULE_PRESETS.length, 39)
  assert.equal(fileRulePreset('01').contentBindings[0].fields[0], '预报时间')
  assert.equal(fileRulePreset('10-4').fileNameBindings.length, 2)
  assert.equal(fileRulePreset('12').contentBindings.length, 3)
  assert.equal(fileRulePreset('19').parserMode, 'KEY_VALUE')
  assert.equal(fileRulePreset('GY-RSM').parserMode, 'PASSTHROUGH')
  assert.equal(fileRulePreset('GY-RSM').fileNameBindings[0].format, 'yyyyMMddHHmmss')
  assert.equal(fileRulePreset('GY-RSM').fileNameBindings[0].source, 'BUSINESS_DAY_START')
  assert.deepEqual(fileRulePreset('GY-RSM').contentBindings, [])
  assert.equal(fileRulePreset('GS-CITY').parserMode, 'POSITIONAL_TEXT')
  assert.equal(fileRulePreset('GS-CITY').contentBindings[0].locator.type, 'LINE_SUFFIX')
  assert.equal(fileRulePreset('GS-WIND').contentBindings[0].mode, 'SHIFT_BY_FILENAME_DELTA')
  assert.equal(fileRulePreset('GS-WIND').contentBindings[0].locator.columnIndex, 1)
  assert.equal(fileRulePreset('GS-PV').contentBindings[0].locator.separator, 'WHITESPACE')
  assert.equal(fileRulePreset('22').name, '极端天气预警定长文件')
  assert.equal(fileRulePreset('22').enabled, true)
  assert.equal(fileRulePreset('22').parserMode, 'FIXED_WIDTH')
  assert.deepEqual(fileRulePreset('22').contentBindings[0].fields, ['Year', 'Month', 'Day', 'Hour'])
})

test('历史单字段文件配置自动升级为 V2 内容绑定', () => {
  const config = normalizeFileGeneration({timeColumn: 'datatime', sourceTimeFormat: 'yyyyMMddHH'})
  assert.equal(config.schemaVersion, 2)
  assert.deepEqual(config.contentBindings[0], {mode: 'SHIFT', fields: ['datatime'], format: 'yyyyMMddHH', source: 'BUSINESS_BASE_TIME'})
})
