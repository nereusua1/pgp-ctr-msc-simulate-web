import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDateTime } from '../src/date-time.mjs'

/** ISO UTC 时间应转换为中国标准时间，并去除毫秒与时区后缀。 */
test('全局时间应格式化为 yyyy-MM-dd HH:mm:ss', () => {
  assert.equal(formatDateTime('2026-08-20T06:50:18.073304Z'), '2026-08-20 14:50:18')
})

/** 空时间和异常历史文本必须有稳定、可辨识的展示结果。 */
test('空时间使用占位符且无法解析的文本保持原值', () => {
  assert.equal(formatDateTime(null), '—')
  assert.equal(formatDateTime('尚未执行'), '尚未执行')
})
