import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeSqlDateSchedule} from '../src/sql-date-schedule.mjs'

test('old task defaults to manual only', () => {
  assert.equal(normalizeSqlDateSchedule().enabled, false)
  assert.equal(normalizeSqlDateSchedule().expression, '0 0 8 * * ?')
})

test('legacy daily time is converted to the shared six-field Cron shape', () => {
  assert.equal(normalizeSqlDateSchedule({enabled: true, dailyTime: '08:30'}).expression, '0 30 8 * * ?')
})

test('invalid offset order is rejected', () => {
  assert.throws(() => normalizeSqlDateSchedule({startOffsetDays: 2, endOffsetDays: -1}), /开始日/)
})
