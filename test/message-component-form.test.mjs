import assert from 'node:assert/strict'
import test from 'node:test'

import {
  duplicateRoute,
  normalizeMessageComponentForSave,
  producerGroupError,
  topicError
} from '../src/message-component-form.mjs'

test('Producer Group 使用云组件命名规则', () => {
  assert.equal(producerGroupError('GID_weather-prod'), '')
  assert.match(producerGroupError('weather'), /GID_/)
  assert.match(producerGroupError('GID_天气天气'), /英文字母/)
  assert.match(producerGroupError('GID_a'), /7～64/)
})

test('Topic 使用云组件命名规则并禁止 CID、GID 前缀', () => {
  assert.equal(topicError('weather-topic_1'), '')
  assert.match(topicError('GID_weather'), /不能以 CID 或 GID/)
  assert.match(topicError('cid-weather'), /不能以 CID 或 GID/)
  assert.match(topicError('天气-topic'), /英文字母/)
})

test('同一组件内重复路由可被识别且状态固定为启用', () => {
  assert.equal(duplicateRoute(['weather', 'forecast', 'weather']), 'weather')
  assert.equal(duplicateRoute(['weather', 'forecast']), '')
  assert.equal(normalizeMessageComponentForSave({status: 'DISABLED'}).status, 'ENABLED')
})
