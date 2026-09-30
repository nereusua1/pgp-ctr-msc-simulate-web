import test from 'node:test'
import assert from 'node:assert/strict'
import {validateTargetRange} from '../src/sql-date-targets.mjs'

test('补数范围包含首尾日期，并支持单日及跨月', () => {
  assert.equal(validateTargetRange('2026-10-01', '2026-10-01'), 1)
  assert.equal(validateTargetRange('2026-09-29', '2026-10-01'), 3)
})

test('拒绝缺失、倒置、无效和超过 366 天的范围', () => {
  assert.throws(() => validateTargetRange('', '2026-10-01'))
  assert.throws(() => validateTargetRange('2026-10-02', '2026-10-01'))
  assert.throws(() => validateTargetRange('2026-02-30', '2026-03-01'))
  assert.throws(() => validateTargetRange('2026-01-01', '2027-02-01'))
})
