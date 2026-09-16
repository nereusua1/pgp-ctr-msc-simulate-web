import assert from 'node:assert/strict'
import test from 'node:test'
import {analyzeFileRuleSample, detectFileNameBindings} from '../src/file-rule-sample.mjs'

test('识别文件名中的多个时间并保持第二个时间与首个时间的间隔', () => {
  assert.deepEqual(detectFileNameBindings('FCST_2025061008_2025061623.txt'), [
    {index: 0, format: 'yyyyMMddHH', source: 'BUSINESS_BASE_TIME', relativeTo: null},
    {index: 1, format: 'yyyyMMddHH', source: 'PRESERVE_OFFSET', relativeTo: 0}
  ])
})

test('上传定长样例后自动带出 Year Month Day Hour 替换规则', () => {
  const result = analyzeFileRuleSample({
    fileName: 'D7babj2520_博罗依.txt',
    text: '4\n4 Year\n2 Month\n2 Day\n3 Hour\n2025  6 10 800 '
  })
  assert.equal(result.parserMode, 'FIXED_WIDTH')
  assert.deepEqual(result.contentBindings, [
    {mode: 'SHIFT', fields: ['Year', 'Month', 'Day', 'Hour'], source: 'BUSINESS_BASE_TIME'}
  ])
})

test('上传分隔文本后识别完整时间列与组合时间字段', () => {
  const result = analyzeFileRuleSample({
    fileName: 'forecast_2025061008.csv',
    text: 'Year,Month,Day,Hour,data_time,value\n2025,6,10,8,2025061008,12'
  })
  assert.equal(result.parserMode, 'DELIMITED')
  assert.equal(result.delimiter, ',')
  assert.equal(result.contentBindings[0].mode, 'COMPOSITE')
  assert.deepEqual(result.contentBindings[0].fields, ['Year', 'Month', 'Day', 'Hour'])
  assert.equal(result.contentBindings[1].format, 'yyyyMMddHH')
})
