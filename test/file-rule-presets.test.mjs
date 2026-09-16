import assert from 'node:assert/strict'
import test from 'node:test'
import {FILE_TIME_SOURCES, fileTimeSourceDescription} from '../src/file-rule-presets.mjs'
import {normalizeFileGeneration} from '../src/file-storage.mjs'

test('报文不再提供无三要素绑定的内置文件样例', () => {
  assert.equal(FILE_TIME_SOURCES.some(([source]) => source === 'BUSINESS_BASE_TIME'), true)
})

test('文件时间来源说明明确业务基准、结束时间与原始间隔', () => {
  assert.match(fileTimeSourceDescription('BUSINESS_BASE_TIME'), /实况.*预报/)
  assert.match(fileTimeSourceDescription('PERIOD_END_TIME'), /period 小时.*预报/)
  assert.match(fileTimeSourceDescription('PRESERVE_OFFSET'), /原始间隔/)
})

test('历史单字段文件配置自动升级为 V2 内容绑定', () => {
  const config = normalizeFileGeneration({timeColumn: 'datatime', sourceTimeFormat: 'yyyyMMddHH'})
  assert.equal(config.schemaVersion, 2)
  assert.deepEqual(config.contentBindings[0], {mode: 'SHIFT', fields: ['datatime'], format: 'yyyyMMddHH', source: 'BUSINESS_BASE_TIME'})
})
