import test from 'node:test'
import assert from 'node:assert/strict'
import {describeSqlDateFailure} from '../src/sql-date-execution.mjs'

test('历史分区错误显示目标日期与处理建议，原 SQL 仅作为技术详情', () => {
  const raw = 'PreparedStatementCallback; bad SQL grammar [INSERT INTO msc_base.msc_station_aws_data_1d (...)]; nested exception is org.postgresql.util.PSQLException: ERROR: no partition of relation found for row'
  const result = describeSqlDateFailure(raw, '2026-10-02', '2026-10-02')
  assert.match(result.summary, /2026-10-02.*分区.*重试/)
  assert.doesNotMatch(result.summary, /INSERT|PreparedStatement/)
  assert.equal(result.detail, raw)
})

test('新记录的简短业务错误直接展示，不显示无意义的技术详情', () => {
  const text = '目标日期 2026-10-02 写入失败：目标表缺少该日期对应的分区，请先建立分区后重试。'
  assert.deepEqual(describeSqlDateFailure(text), {summary: text, detail: ''})
  assert.equal(describeSqlDateFailure(''), null)
})
