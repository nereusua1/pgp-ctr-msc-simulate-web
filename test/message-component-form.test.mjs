import assert from 'node:assert/strict'
import test from 'node:test'
import { resetMessageComponentForCreate } from '../src/message-component-form.mjs'

/** 编辑已有实例后再新建时，必须清空旧实例编码，避免触发数据库唯一键冲突。 */
test('新建消息组件不得继承上一次编辑实例的编码', () => {
  const form = { id: 'old-id', code: 'rocketmq-test', name: 'RocketMQ-9876' }

  resetMessageComponentForCreate(form)

  assert.equal(form.id, '')
  assert.equal(form.code, null)
  assert.equal(form.namesrvAddr, '')
  assert.equal(form.instanceId, '')
  assert.equal(form.accessKey, '')
  assert.equal(form.secretKey, '')
})
