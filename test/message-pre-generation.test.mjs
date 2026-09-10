import test from 'node:test'
import assert from 'node:assert/strict'
import {copyMessageDraft, preGenerateMessage} from '../src/message-pre-generation.mjs'

const template = {
  id: 'm1', name: '气象报文', status: 'PUBLISHED', type: 'JSON',
  content: JSON.stringify({metadata:{messageId:'old'}, startTime:'old', endTime:'old', level:0}),
  dataBinding: {elements: [{period: 72}]},
  deliveryTargets: [{componentId:'mq1', producerGroup:'g1', topic:'t1'}],
  bindings: [
    {path:'$.metadata.messageId', provider:'MESSAGE_ID', targetType:'string'},
    {path:'$.startTime', strategy:'PLANNED_TRIGGER_TIME', format:'yyyy-MM-dd HH:mm:ss'},
    {path:'$.endTime', strategy:'PERIOD_END_TIME', format:'yyyy-MM-dd HH:mm:ss'},
    {path:'$.level', provider:'CONSTANT', targetType:'integer', value:'2'}
  ]
}

test('JSON 预生成替换系统值、时间规则和常量但不执行投递', () => {
  const result = preGenerateMessage(template, '2026-09-08T14:00:00')
  const content = JSON.parse(result.content)
  assert.equal(content.metadata.messageId, 'PREVIEW-20260908140000')
  assert.equal(content.startTime, '2026-09-08 14:00:00')
  assert.equal(content.endTime, '2026-09-11 14:00:00')
  assert.equal(content.level, 2)
  assert.equal(result.replacementCount, 4)
  assert.deepEqual(result.replacedPaths, ['$.metadata.messageId', '$.startTime', '$.endTime', '$.level'])
  assert.match(result.generatedAt, /^\d{4}-\d{2}-\d{2} /)
})

test('无效 JSON 返回可定位的行号提示', () => {
  assert.throws(() => preGenerateMessage({...template, content:'{\n  "broken":\n}'}, '2026-09-08T14:00:00'), /第 3 行附近/)
})

test('数组通配符绑定应替换 records 中的每一条记录', () => {
  const wildcardTemplate = {
    ...template,
    content: JSON.stringify({records: [
      {datetime: 'old-1', inTime: 'old-1'},
      {datetime: 'old-2', inTime: 'old-2'}
    ]}),
    bindings: [
      {path: '$.records[*].datetime', provider: 'PLANNED_TRIGGER_TIME'},
      {path: '$.records[*].inTime', provider: 'BUSINESS_BASE_TIME'}
    ]
  }
  const result = preGenerateMessage(wildcardTemplate, '2026-09-08T16:40:48')
  const content = JSON.parse(result.content)
  assert.deepEqual(content.records, [
    {datetime: '2026-09-08 16:40:48', inTime: '2026-09-08 16:40:48'},
    {datetime: '2026-09-08 16:40:48', inTime: '2026-09-08 16:40:48'}
  ])
  assert.equal(result.replacementCount, 2)
  assert.deepEqual(result.warnings, [])
})

test('FILE 预生成产生 SIM 文件名并更新外层报文引用', () => {
  const result = preGenerateMessage({...template, type:'FILE', content:JSON.stringify({fileName:'SOURCE.csv', filePath:'http://localhost/files/SOURCE.csv'}), fileGeneration:{sourceFileName:'SOURCE.csv'}, bindings:[]}, '2026-09-08T14:00:00')
  assert.equal(result.fileName, 'SOURCE_SIM_20260908140000.csv')
  assert.match(result.content, /SOURCE_SIM_20260908140000\.csv/)
})

test('复制报文固定生成草稿且默认移除投递目标', () => {
  const copy = copyMessageDraft(template, '气象报文 - 副本')
  assert.equal(copy.id, undefined)
  assert.equal(copy.status, 'DRAFT')
  assert.equal(copy.deliveryTargets.length, 0)
  assert.equal(copy.name, '气象报文 - 副本')
  assert.equal(copy.content, template.content)
  assert.equal(copyMessageDraft(template, '含目标副本', true).deliveryTargets.length, 1)
})
