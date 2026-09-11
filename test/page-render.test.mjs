import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'

test('真实页面组件可渲染两种角色与直接详情地址', async () => {
  const location = {pathname: '/tasks/t1', search: ''}
  globalThis.window = {
    location, scrollY: 0, scrollTo() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    history: {
      state: {},
      pushState(state, title, path) { const url = new URL(path, 'http://localhost'); Object.assign(location, {pathname:url.pathname, search:url.search}) },
      replaceState(state, title, path) { this.pushState(state, title, path) }
    }
  }
  globalThis.requestAnimationFrame = fn => fn()
  const server = await createServer({server: {middlewareMode: true, hmr: false, ws: false}, appType: 'custom'})
  try {
    const task = {id:'t1', name:'气象补跑任务', messageId:'m1', status:'DISABLED'}
    const template = {id:'m1', name:'气象模板', type:'JSON', businessType:'REALTIME', timeGenerationMode:'DATA_POLICY', status:'DRAFT', content:'{}'}
    const {default: Task} = await server.ssrLoadModule('/src/views/TaskManagementView.vue')
    const props = {tasks:[task], templates:[template], routeId:'t1', selectedTaskId:'t1'}
    const operator = await renderToString(createSSRApp(Task, props))
    assert.match(operator, /历史补跑/)
    assert.doesNotMatch(operator, /<button[^>]*>[^<]*立即执行<\/button>/)
    assert.match(operator, /detail-page/)
    const admin = await renderToString(createSSRApp(Task, {...props, canManage:true}))
    assert.match(admin, /立即执行<\/button>/)
    const list = await renderToString(createSSRApp(Task, {tasks:[task], templates:[template], canManage:true}))
    assert.match(list, /选择当前页全部任务/)
    assert.doesNotMatch(list, /批量停用/)
    const operatorList = await renderToString(createSSRApp(Task, {tasks:[task], templates:[template]}))
    assert.doesNotMatch(operatorList, /批量停用/)
    const {default: Message} = await server.ssrLoadModule('/src/views/MessageManagementView.vue')
    const editor = await renderToString(createSSRApp(Message, {templates:[template], sources:[], components:[], tasks:[task], canManage:true, routeId:'m1'}))
    assert.match(editor, /保存草稿/)
    assert.match(editor, /待完善 2 项/)
    assert.match(editor, /tab-issue-count/)
    assert.match(editor, /当前没有未保存修改/)
    assert.match(editor, /detail-page/)
    const {default: Execution} = await server.ssrLoadModule('/src/views/ExecutionLogView.vue')
    const detail = await renderToString(createSSRApp(Execution, {
      executions:[{id:'e1', taskName:task.name, status:'PARTIAL_SUCCESS'}], selectedExecutionId:'e1'
    }))
    assert.match(detail, /detail-page/)
    assert.match(detail, /部分成功/)
    assert.doesNotMatch(detail, /存在中断|链路完整/)
    const {default: Overview} = await server.ssrLoadModule('/src/views/OverviewView.vue')
    const overview = await renderToString(createSSRApp(Overview, {canManage:true, tasks:[task], templates:[template]}))
    assert.match(overview, /待处理事项/)
    assert.match(overview, /模板未配置投递目标/)
    assert.match(overview, /查看任务/)
  } finally {
    await server.close()
    delete globalThis.window
    delete globalThis.requestAnimationFrame
  }
})
