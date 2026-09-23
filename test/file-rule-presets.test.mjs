import assert from 'node:assert/strict'
import test from 'node:test'
import {FILE_TIME_GROUPS, FILE_TIME_SOURCES, fileTimeCategory, fileTimeOptions, fileTimeSourceDescription} from '../src/file-rule-presets.mjs'
import {normalizeFileGeneration} from '../src/file-storage.mjs'

test('文件规则提供当前、起报、预报三个时间来源', () => {
  assert.deepEqual(FILE_TIME_SOURCES.map(([source]) => source), [
    'CURRENT_TIME', 'ISSUE_TIME', 'FORECAST_TIME'
  ])
  assert.deepEqual(FILE_TIME_GROUPS.map(group => group.options.map(option => option[0])), [
    ['PLANNED_TRIGGER_TIME', 'CURRENT_DAY', 'CURRENT_HOUR'],
    ['BUSINESS_BASE_TIME', 'BUSINESS_DAY_START'],
    ['DATA_INTERVAL_SEQUENCE', 'FORECAST_FIRST_TIME', 'PERIOD_END_TIME']
  ])
  assert.equal(fileTimeCategory('CURRENT_HOUR'), 'CURRENT_TIME')
  assert.equal(fileTimeCategory('FORECAST_FIRST_TIME'), 'FORECAST_TIME')
  assert.deepEqual(fileTimeOptions('ISSUE_TIME').map(option => option[0]), ['BUSINESS_BASE_TIME', 'BUSINESS_DAY_START'])
  assert.match(fileTimeSourceDescription('CURRENT_TIME'), /任务时间.*period_interval.*最近间隔点.*为空/)
  assert.match(fileTimeSourceDescription('FORECAST_TIME'), /第一个预报时间/)
})

test('新建非结构化文件等待从原始文件名选择时间片段', () => {
  assert.deepEqual(normalizeFileGeneration({}, 'UNSTRUCTURED_FILE').fileNameBindings, [])
})

test('历史单字段文件配置升级后默认使用起报时间', () => {
  const config = normalizeFileGeneration({timeColumn: 'datatime', sourceTimeFormat: 'yyyyMMddHH'})
  assert.deepEqual(config.contentBindings[0], {mode: 'SHIFT', fields: ['datatime'], format: 'yyyyMMddHH', sourceCategory: 'ISSUE_TIME', source: 'BUSINESS_BASE_TIME'})
})

test('历史非结构化文件保留三个受支持的时间来源', () => {
  const config = normalizeFileGeneration({fileNameBindings: [{index: 0, format: 'yyyyMMddHH', source: 'PLANNED_TRIGGER_TIME'}]}, 'UNSTRUCTURED_FILE')
  assert.equal(config.fileNameBindings[0].source, 'PLANNED_TRIGGER_TIME')
  assert.equal(config.fileNameBindings[0].sourceCategory, 'CURRENT_TIME')
})

test('原报文直发表单不保留任何文件生成配置', () => {
  assert.deepEqual(normalizeFileGeneration({processingMode: 'ORIGINAL_MESSAGE', sourceFilePath: 'old.csv', parserMode: 'PASSTHROUGH'}), {
    schemaVersion: 3, processingMode: 'ORIGINAL_MESSAGE'
  })
})
