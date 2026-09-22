import test from 'node:test'
import assert from 'node:assert/strict'
import {detectScalarFields, detectTimeFields, findFirstStringField} from '../src/message-content-fields.mjs'

test('正文遍历统一识别数组时间路径和标量字段', () => {
  const content = JSON.stringify({records: [{time: '2026-09-21 08:00:00', value: 3}]})
  assert.equal(detectTimeFields(content)[0].path, '$.records[*].time')
  assert.deepEqual(detectScalarFields(content).map(item => item.path), ['$.records[*].time', '$.records[*].value'])
})

test('文件引用读取使用首个非空同名字符串且安全处理损坏 JSON', () => {
  assert.equal(findFirstStringField('{"items":[{"filePath":"a/b.nc"}]}', 'filePath'), 'a/b.nc')
  assert.equal(findFirstStringField('{bad', 'filePath'), '')
})
