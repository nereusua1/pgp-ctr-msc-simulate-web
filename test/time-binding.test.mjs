import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeTimeBinding,
  recommendedTimeStrategy,
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

test('非 startTime 字段仍可选择计划触发时间', () => {
  assert.ok(timeStrategiesForPath('$.metadata.createTime').some(([value]) => value === 'TASK_TRIGGER_TIME'))
})
