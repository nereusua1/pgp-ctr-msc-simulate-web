import test from 'node:test'
import assert from 'node:assert/strict'
import {buildGlobalSearchItems, filterGlobalSearchItems, rememberItem, safeStoredItems, statusMeta} from '../src/global-search.mjs'

const resources = {
  tasks: [{id: 'task-1001', name: '华东气象投递', status: 'ENABLED'}],
  templates: [{id: 'msg-1', name: '气象报文', status: 'PUBLISHED', deliveryTargets: [{topic: 'weather-live', producerGroup: 'weather-producer'}]}],
  components: [{id: 'mq-1', name: '华东 RocketMQ', status: 'ENABLED', topics: ['weather-live'], producerGroups: ['weather-producer']}],
  dataItems: [
    {id: 'd1', sourceCode: 'CMA', sourceCodeName: '国家气象数据源'},
    {id: 'd2', sourceCode: 'CMA', sourceCodeName: '国家气象数据源'}
  ],
  executions: [{id: 'exec-9', taskName: '华东气象投递', status: 'FAILED', errorSummary: 'Topic 不存在'}],
  canManage: true
}

test('全局搜索覆盖任务编号、Topic、Group、异常摘要、MQ 和去重后的数据源', () => {
  const items = buildGlobalSearchItems(resources)
  assert.equal(filterGlobalSearchItems(items, 'task-1001')[0].kind, 'task')
  assert.equal(filterGlobalSearchItems(items, 'weather-live').some(item => item.kind === 'message'), true)
  assert.equal(filterGlobalSearchItems(items, 'weather-producer').some(item => item.kind === 'message'), true)
  assert.equal(filterGlobalSearchItems(items, 'Topic 不存在')[0].kind, 'execution')
  assert.equal(filterGlobalSearchItems(items, 'RocketMQ')[0].kind, 'component')
  assert.equal(filterGlobalSearchItems(items, '国家气象').filter(item => item.kind === 'source').length, 1)
})

test('快捷动作受权限约束并保留查看失败执行', () => {
  const adminActions = buildGlobalSearchItems(resources).filter(item => item.kind === 'action')
  assert.deepEqual(adminActions.map(item => item.action), ['new-task', 'new-message', 'failed-executions'])
  const operatorActions = buildGlobalSearchItems({...resources, canManage: false}).filter(item => item.kind === 'action')
  assert.deepEqual(operatorActions.map(item => item.action), ['failed-executions'])
})

test('最近访问去重置顶并安全读取损坏的浏览器存储', () => {
  const item = buildGlobalSearchItems(resources)[0]
  assert.deepEqual(rememberItem([{...item}, {key: 'old', title: '旧记录'}], item).map(row => row.key), [item.key, 'old'])
  assert.deepEqual(safeStoredItems({getItem: () => '{bad json'}, 'recent'), [])
  assert.deepEqual(statusMeta('FAILED'), ['失败', 'negative'])
})
