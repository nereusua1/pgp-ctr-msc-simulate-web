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
  const result = preGenerateMessage(template, '2026-09-08T14:00:00', new Date('2026-09-08T14:00:01'), () => '550e8400-e29b-41d4-a716-446655440000')
  const content = JSON.parse(result.content)
  assert.equal(content.metadata.messageId, '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(result.messageId, content.metadata.messageId)
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

test('FILE 预生成按配置替换文件名时间且不追加系统后缀', () => {
  const result = preGenerateMessage({...template, type:'FILE', content:JSON.stringify({fileName:'SUN_RISE111_20180907_20190907.csv', filePath:'http://localhost/files/SUN_RISE111_20180907_20190907.csv'}), fileGeneration:{sourceFileName:'SUN_RISE111_20180907_20190907.csv', fileNameBindings:[{index:0, format:'yyyyMMdd', source:'BUSINESS_BASE_TIME'}, {index:1, format:'yyyyMMdd', source:'PRESERVE_OFFSET', relativeTo:0}]}, bindings:[]}, '2026-09-08T14:00:00')
  assert.equal(result.fileName, 'SUN_RISE111_20260908_20270908.csv')
  assert.match(result.content, /SUN_RISE111_20260908_20270908\.csv/)
})

test('FILE 文件名可使用业务基准日期零点且不改变时效编号', () => {
  const sourceName = 'MSP3_PMSC_SMMFC_RSM_LM10-50_CHN_20250917000000_00000-02400.csv'
  const result = preGenerateMessage({...template, type: 'FILE', content: JSON.stringify({fileName: sourceName, filePath: `http://localhost/files/${sourceName}`}), fileGeneration: {sourceFileName: sourceName, parserMode: 'PASSTHROUGH', fileNameBindings: [{index: 0, format: 'yyyyMMddHHmmss', source: 'BUSINESS_DAY_START'}], contentBindings: []}, bindings: []}, '2026-09-08T14:00:00')
  assert.equal(result.fileName, 'MSP3_PMSC_SMMFC_RSM_LM10-50_CHN_20260908000000_00000-02400.csv')
})

test('FILE 预生成支持当前整点和第一个预报时间二级方式', () => {
  const sourceName = 'weather_202501010000_202501010000.csv'
  const result = preGenerateMessage({...template, type: 'FILE',
    dataBinding: {elements: [{period: 24, period_interval: 60}]},
    content: JSON.stringify({fileName: sourceName}),
    fileGeneration: {sourceFileName: sourceName, fileNameBindings: [
      {index: 0, format: 'yyyyMMddHHmm', sourceCategory: 'CURRENT_TIME', source: 'CURRENT_HOUR'},
      {index: 1, format: 'yyyyMMddHHmm', sourceCategory: 'FORECAST_TIME', source: 'FORECAST_FIRST_TIME'}
    ]}, bindings: []}, '2026-09-08T14:37:25')
  assert.equal(result.fileName, 'weather_202609081400_202609081537.csv')
})

test('非结构化 FILE 预生成只更新目标文件引用并标记原样复制', () => {
  const sourceName = 'radar_2025091708.nc'
  const result = preGenerateMessage({...template, type:'UNSTRUCTURED_FILE', content:JSON.stringify({fileName:sourceName,filePath:`source/${sourceName}`,fileType:'NC',fileSize:0}), fileGeneration:{sourceFileName:sourceName,targetDirectory:'generated/radar',fileType:'NC',fileNamePath:'$.fileName',filePathPath:'$.filePath',fileTypePath:'$.fileType',fileSizePath:'$.fileSize',fileNameBindings:[{index:0,format:'yyyyMMddHH',source:'BUSINESS_BASE_TIME'}]}, bindings:[]}, '2026-09-17T08:00:00')
  assert.equal(result.processingMode, '原样复制')
  assert.equal(result.targetFileName, 'radar_2026091708.nc')
  assert.equal(result.targetFilePath, 'generated/radar/radar_2026091708.nc')
  assert.match(result.content, /generated\/radar\/radar_2026091708\.nc/)
})

test('Shapefile 预生成列出同一基础名的主文件和附属文件', () => {
  const sourceName = 'area_2025091708.shp'
  const result = preGenerateMessage({...template, type:'UNSTRUCTURED_FILE', content:JSON.stringify({fileName:sourceName,filePath:`source/${sourceName}`,fileType:'SHP',fileSize:0}), fileGeneration:{sourceFileName:sourceName,targetDirectory:'generated/shape',fileType:'SHAPEFILE',fileGroup:{sidecars:['.shp','.shx','.dbf','.prj']},fileNamePath:'$.fileName',filePathPath:'$.filePath',fileTypePath:'$.fileType',fileSizePath:'$.fileSize',fileNameBindings:[{index:0,format:'yyyyMMddHH',source:'BUSINESS_BASE_TIME'}]}, bindings:[]}, '2026-09-17T08:00:00')
  assert.deepEqual(result.targetFiles, [
    'generated/shape/area_2026091708.shp', 'generated/shape/area_2026091708.shx',
    'generated/shape/area_2026091708.dbf', 'generated/shape/area_2026091708.prj'
  ])
})

test('原报文直发预览保持字符序列并只计算 UTF-8 SHA-256', () => {
  const original = '{\n  "messageId": "KEEP-ME",\n  "filePath": "archive/a.csv"\n}'
  const result = preGenerateMessage({...template, type:'FILE', content:original,
    fileGeneration:{schemaVersion:3, processingMode:'ORIGINAL_MESSAGE'},
    bindings:[{path:'$.messageId', provider:'MESSAGE_ID'}]}, 'invalid-time')
  assert.equal(result.content, original)
  assert.equal(result.contentSha256, 'd47d9583fe17e56b65a1fa2e0a2a9c44340f619ec6235cbb8ee83e83e9c2e306')
  assert.equal(result.messageId, '')
  assert.equal(result.replacementCount, 0)
  assert.equal(result.processingMode, '原报文直发')
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
