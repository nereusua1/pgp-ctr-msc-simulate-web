const text = value => String(value || '').trim()
const lower = value => text(value).toLowerCase()

export const statusMeta = status => ({
  ENABLED: ['已启用', 'positive'], PUBLISHED: ['已发布', 'positive'], SUCCESS: ['成功', 'positive'],
  DISABLED: ['已停用', 'neutral'], DRAFT: ['草稿', 'neutral'], RUNNING: ['运行中', 'warning'],
  PARTIAL_SUCCESS: ['部分成功', 'warning'], FAILED: ['失败', 'negative']
}[status] || [text(status) || '状态未知', 'neutral'])

export function buildGlobalSearchItems({tasks = [], templates = [], components = [], dataItems = [], executions = [], canManage = false} = {}) {
  const taskItems = tasks.map(item => ({
    key: `task:${item.id}`, kind: 'task', type: '任务', icon: 'tasks', title: item.name || '未命名任务',
    code: item.id, status: item.status, page: 'tasks', id: item.id,
    searchText: [item.name, item.id, item.code]
  }))
  const messageItems = templates.map(item => {
    const targets = Array.isArray(item.deliveryTargets) ? item.deliveryTargets : []
    const topics = targets.map(target => target.topic).filter(Boolean)
    const groups = targets.map(target => target.producerGroup).filter(Boolean)
    return {
      key: `message:${item.id}`, kind: 'message', type: '报文', icon: 'messages', title: item.name || '未命名报文',
      code: item.id, status: item.status, page: 'messages', id: item.id,
      detail: [...new Set([...topics, ...groups])].slice(0, 2).join(' · '),
      searchText: [item.name, item.id, item.code, item.topic, item.producerGroup, ...topics, ...groups]
    }
  })
  const componentItems = components.map(item => ({
    key: `component:${item.id}`, kind: 'component', type: 'MQ 组件', icon: 'components', title: item.name || '未命名组件',
    code: item.code || item.id, status: item.status, page: 'message-components', filter: item.name || item.id,
    detail: item.namesrvAddr || '', searchText: [item.name, item.id, item.code, item.namesrvAddr, ...(item.topics || []), ...(item.producerGroups || [])]
  }))
  const sources = new Map()
  for (const item of dataItems) {
    const code = text(item.sourceCode)
    if (!code || sources.has(code)) continue
    sources.set(code, {
      key: `source:${code}`, kind: 'source', type: '数据源', icon: 'data', title: item.sourceCodeName || '未命名数据源',
      code, status: item.sourceStatus || item.status || '', page: 'data-items', filter: code,
      detail: '进入数据项管理', searchText: [code, item.sourceCodeName]
    })
  }
  const executionItems = executions.map(item => ({
    key: `execution:${item.id}`, kind: 'execution', type: '执行记录', icon: 'logs', title: item.id || '未知执行',
    code: item.taskName || item.taskId || '', status: item.status, page: 'logs', id: item.id,
    detail: item.errorSummary || item.errorMessage || item.taskName || '',
    searchText: [item.id, item.taskId, item.taskName, item.errorSummary, item.errorMessage]
  }))
  const actions = [
    ...(canManage ? [
      {key: 'action:new-task', kind: 'action', type: '快捷动作', icon: 'plus', title: '新建任务', detail: '创建调度任务', action: 'new-task'},
      {key: 'action:new-message', kind: 'action', type: '快捷动作', icon: 'plus', title: '新建报文', detail: '创建报文草稿', action: 'new-message'}
    ] : []),
    {key: 'action:failed-executions', kind: 'action', type: '快捷动作', icon: 'logs', title: '查看失败执行', detail: '打开失败执行记录', action: 'failed-executions'}
  ]
  return [...taskItems, ...messageItems, ...componentItems, ...sources.values(), ...executionItems, ...actions]
}

export function filterGlobalSearchItems(items, keyword, limit = 30) {
  const query = lower(keyword)
  if (!query) return items.filter(item => item.kind === 'action')
  return items.filter(item => [item.title, item.code, item.detail, ...(item.searchText || [])]
    .some(value => lower(value).includes(query))).slice(0, limit)
}

export function safeStoredItems(storage, key, limit = 8) {
  try {
    const rows = JSON.parse(storage?.getItem(key) || '[]')
    return Array.isArray(rows) ? rows.filter(item => item?.key && item?.title).slice(0, limit) : []
  } catch { return [] }
}

export function rememberItem(rows, item, limit = 8) {
  const snapshot = (({key, kind, type, icon, title, code, status, page, id, filter, detail, action}) =>
    ({key, kind, type, icon, title, code, status, page, id, filter, detail, action}))(item)
  return [snapshot, ...rows.filter(row => row.key !== item.key)].slice(0, limit)
}
