import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequestId } from '../src/request-id.mjs'

test('HTTP 局域网页面缺少 randomUUID 时仍生成标准 UUID', () => {
  const cryptoWithoutRandomUUID = {
    getRandomValues(bytes) {
      bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
      return bytes
    }
  }

  assert.equal(createRequestId(cryptoWithoutRandomUUID), '00010203-0405-4607-8809-0a0b0c0d0e0f')
})

test('安全上下文优先使用浏览器原生 randomUUID', () => {
  assert.equal(createRequestId({randomUUID: () => 'native-request-id'}), 'native-request-id')
})
