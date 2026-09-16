import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeTimeBinding,
  recommendedTimeStrategy,
  timeStrategyDescription,
  timeStrategiesForPath
} from '../src/time-binding.mjs'

test('startTime 固定使用业务基准时间且不提供计划触发时间选项', () => {
  const path = '$.metadata.effectTimePeriod.startTime'

  assert.equal(recommendedTimeStrategy(path), 'BUSINESS_BASE_TIME')
  assert.deepEqual(
    timeStrategiesForPath(path).map(([value]) => value),
    ['BUSINESS_BASE_TIME', 'DATA_INTERVAL_SEQUENCE', 'PERIOD_END_TIME']
  )
  assert.equal(normalizeTimeBinding({kind: 'TIME_RULE', path, strategy: 'TASK_TRIGGER_TIME'}).strategy, 'BUSINESS_BASE_TIME')
})

test('时间策略提供数据项参数与生成语义的完整说明', () => {
  assert.match(timeStrategyDescription('BUSINESS_BASE_TIME'), /period_interval.*pre_time_point/)
  assert.match(timeStrategyDescription('DATA_INTERVAL_SEQUENCE'), /去重排序.*period_interval/)
  assert.match(timeStrategyDescription('PERIOD_END_TIME'), /period 小时.*预报/)
  assert.match(timeStrategyDescription('BUSINESS_BASE_TIME', 'TRIGGER_TIME'), /计划触发时间.*不读取/)
})

test('非 startTime 字段仍可选择计划触发时间', () => {
  assert.ok(timeStrategiesForPath('$.metadata.createTime').some(([value]) => value === 'TASK_TRIGGER_TIME'))
})
