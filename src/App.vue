<script setup>
import {computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch} from 'vue'
import {latestRequest, executionModeError} from './interaction-policy.mjs'
import {parseRoute, setRoute} from './page-route.mjs'
import OverviewView from './views/OverviewView.vue'
import TaskManagementView from './views/TaskManagementView.vue'
import MessageManagementView from './views/MessageManagementView.vue'
import FileRuleTemplateView from './views/FileRuleTemplateView.vue'
import DataItemManagementView from './views/DataItemManagementView.vue'
import MessageComponentManagementView from './views/MessageComponentManagementView.vue'
import ExecutionLogView from './views/ExecutionLogView.vue'
import LoginView from './views/LoginView.vue'
import AppIcon from './components/AppIcon.vue'
import GlobalSearch from './components/GlobalSearch.vue'
import PageSkeleton from './components/PageSkeleton.vue'
import * as api from './api'
import {runExclusive} from './action-guard.mjs'
import {createRequestId} from './request-id.mjs'
import {canManageConfiguration, getAuthenticatedRole, getAuthenticatedUsername, hasPermission, isAuthenticatedUser} from './authentication.mjs'
import {
  flattenResource,
  normalizeDataItem,
  normalizeExecutionMessage,
  normalizeTemplate,
  serializeResource
} from './resource-adapter.mjs'

const navigation = [
  {key: 'overview', label: '运行总览', icon: 'overview'},
  {key: 'tasks', label: '任务管理', icon: 'tasks'},
  {key: 'messages', label: '报文模板', icon: 'messages'},
  {key: 'file-rules', label: '文件规则模板', icon: 'messages'},
  {key: 'data-items', label: '数据项管理', icon: 'data'},
  {key: 'message-components', label: '消息云组件', icon: 'components'},
  {key: 'logs', label: '执行记录', icon: 'logs'}
]
const endpoints = {
  tasks: 'tasks',
  messages: 'messages',
  'file-rules': 'file-rule-templates',
  'data-items': 'data-items',
  'message-components': 'message-components'
}
const initialRoute = parseRoute(window.location.pathname)
const activePage = ref(initialRoute.page)
const dataItems = ref([])
const components = ref([])
const templates = ref([])
const fileRuleTemplates = ref([])
const tasks = ref([])
const executions = ref([])
const executionAnalytics = ref({trend: [], failureStages: [], mqDistribution: [], taskTrends: [], recentFailures: []})
const analyticsRange = ref('24h')
const initialQuery = new URLSearchParams(window.location.search)
const executionPage = reactive({page: Number(initialQuery.get('logs.page')) || 1, size: Number(initialQuery.get('logs.size')) || 10, total: 0, totalPages: 1, keyword: initialRoute.page === 'logs' && initialRoute.id ? initialRoute.id : initialQuery.get('logs.q') || '', status: initialQuery.get('logs.status') || 'ALL'})
const executionMessages = ref([])
const selectedTaskId = ref(initialRoute.page === 'tasks' ? initialRoute.id : '')
const selectedExecutionId = ref(initialRoute.page === 'logs' ? initialRoute.id : '')
const routeId = ref(initialRoute.id)
const loading = ref(true)
const loadError = ref('')
const resourceErrors = reactive({})
const connectionChecks = reactive({})
const updatedAt = ref('')
const toast = ref(null)
const currentUser = ref(null)
const checkingAuthentication = ref(true)
const loginLoading = ref(false)
const loginError = ref('')
const hasUnsavedMessageChanges = ref(false)
const pendingActions = reactive(new Set())
let toastTimer

const pageTitle = computed(() => navigation.find(item => item.key === activePage.value)?.label || '运行总览')
const serviceState = computed(() => Object.values(resourceErrors).some(Boolean)
  ? {label: '部分数据更新失败', tone: 'error'}
  : {label: updatedAt.value ? '数据已更新' : '尚未读取数据', tone: 'neutral'})
const componentHealthState = computed(() => {
  if (!components.value.length) return {label: '暂无消息云组件', detail: '请先完成组件配置', tone: 'neutral'}
  const results = components.value.map(item => connectionChecks[item.id + ':']).filter(Boolean)
  if (!results.length) return {label: '消息云连接：未检测', detail: '前往消息云组件执行连接检测', tone: 'neutral'}
  const failures = results.filter(item => !item.success)
  const latest = results.reduce((current, item) => {
    const time = Date.parse(item.checkedAt)
    return Number.isFinite(time) && time > current.time ? {time, label: item.checkedAt} : current
  }, {time: -Infinity, label: ''}).label
  if (failures.length) return {label: `消息云连接：${failures.length} 项异常`, detail: latest ? `最近检测于 ${latest}` : '请重新检测异常组件', tone: 'negative'}
  if (results.length < components.value.length) return {label: `消息云连接：已检测 ${results.length}/${components.value.length}`, detail: '未检测组件不代表可用', tone: 'warning'}
  return {label: '消息云连接：最近检测通过', detail: latest ? `最近检测于 ${latest}` : '检测结果来自当前会话', tone: 'positive'}
})
const authenticatedUsername = computed(() => getAuthenticatedUsername(currentUser.value))
const authenticatedRole = computed(() => getAuthenticatedRole(currentUser.value))
const canManage = computed(() => canManageConfiguration(currentUser.value))
const visibleNavigation = computed(() => navigation.filter(item => canManage.value || ['overview', 'tasks', 'logs'].includes(item.key)))
const navigationGroups = computed(() => [
  {label: '工作台', items: visibleNavigation.value.filter(item => item.key === 'overview')},
  {label: '配置管理', items: visibleNavigation.value.filter(item => ['messages', 'file-rules', 'data-items', 'message-components'].includes(item.key))},
  {label: '运行管理', items: visibleNavigation.value.filter(item => ['tasks', 'logs'].includes(item.key))}
].filter(group => group.items.length))
watch(canManage, () => {
  if (!canManage.value && !['overview', 'tasks', 'logs'].includes(activePage.value)) navigate('overview')
})
const canCheckConnection = computed(() => hasPermission(currentUser.value, 'CONNECTION_CHECK'))
const isAuthenticated = computed(() => isAuthenticatedUser(currentUser.value))
const currentComponent = computed(() => ({
  overview: OverviewView,
  tasks: TaskManagementView,
  messages: MessageManagementView,
  'file-rules': FileRuleTemplateView,
  'data-items': DataItemManagementView,
  'message-components': MessageComponentManagementView,
  logs: ExecutionLogView
})[activePage.value])
const pageProps = computed(() => {
  if (activePage.value === 'overview') return {
    tasks: tasks.value,
    executions: executions.value,
    executionPage,
    analytics: executionAnalytics.value,
    analyticsRange: analyticsRange.value,
    analyticsPending: pendingActions.has('refresh:overview'),
    components: components.value,
    templates: templates.value,
    canManage: canManage.value,
    connectionChecks
  }
  if (activePage.value === 'tasks') return {
    tasks: tasks.value,
    templates: templates.value,
    sources: dataItems.value,
    executionMessages: executionMessages.value,
    selectedTaskId: selectedTaskId.value,
    pendingActions,
    canManage: canManage.value,
    routeId: routeId.value,
    components: components.value
  }
  if (activePage.value === 'messages') return {
    templates: templates.value,
    sources: dataItems.value,
    components: components.value,
    tasks: tasks.value,
    pendingActions,
    canManage: canManage.value,
    routeId: routeId.value,
    fileRuleTemplates: fileRuleTemplates.value
  }
  if (activePage.value === 'file-rules') return {
    templates: fileRuleTemplates.value,
    messages: templates.value,
    pendingActions,
    canManage: canManage.value,
    routeId: routeId.value
  }
  if (activePage.value === 'data-items') return {items: dataItems.value, pendingActions}
  if (activePage.value === 'message-components') return {
    components: components.value,
    templates: templates.value,
    tasks: tasks.value,
    pendingActions,
    canManage: canManage.value,
    canCheckConnection: canCheckConnection.value,
    connectionChecks
  }
  return {
    executions: executions.value,
    executionPage,
    messages: executionMessages.value,
    pendingActions,
    selectedExecutionId: selectedExecutionId.value
  }
})

function notify(message, tone = 'success') {
  const titles = {success: '操作成功', error: '操作失败', warning: '请注意'}
  toast.value = {title: titles[tone] || '操作结果', message, tone}
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 3600)
}

function showError(error) {
  notify(error?.message || '操作失败', 'error')
}

function navigate(page, filter) {
  if (!canManage.value && !['overview', 'tasks', 'logs'].includes(page)) return
  if (page === activePage.value && !routeId.value && !filter) return
  if (hasUnsavedMessageChanges.value && !window.confirm('当前表单仍有未保存修改，离开后修改将丢失。是否继续离开？')) return
  hasUnsavedMessageChanges.value = false
  if (page !== 'tasks') selectedTaskId.value = ''
  if (page !== 'logs') selectedExecutionId.value = ''
  if (filter?.keyword != null) {
    const prefix = {'message-components': 'components', 'data-items': 'data', messages: 'messages', 'file-rules': 'fileRules', tasks: 'tasks'}[page]
    if (prefix) {
      const query = new URLSearchParams(window.location.search)
      query.set(prefix + '.q', filter.keyword)
      query.set(prefix + '.page', '1')
      query.set(prefix + '.status', 'ALL')
      window.history.replaceState(window.history.state, '', window.location.pathname + '?' + query.toString())
    }
  }
  activePage.value = page
  setRoute(page)
  window.scrollTo({top: 0, behavior: 'smooth'})
}

function syncRoute() {
  const route = parseRoute(window.location.pathname)
  if (hasUnsavedMessageChanges.value && (route.page !== activePage.value || route.id !== routeId.value) &&
      !window.confirm('当前修改尚未保存，是否离开？')) {
    setRoute(activePage.value, routeId.value, ['messages', 'file-rules'].includes(activePage.value) && Boolean(routeId.value), true)
    return
  }
  if (isAuthenticated.value && !canManage.value && !['overview', 'tasks', 'logs'].includes(route.page)) {
    setRoute('overview', '', false, true)
    return
  }
  if (route.page !== activePage.value || route.id !== routeId.value) hasUnsavedMessageChanges.value = false
  activePage.value = route.page
  routeId.value = route.id
  selectedTaskId.value = route.page === 'tasks' ? route.id : ''
  selectedExecutionId.value = route.page === 'logs' ? route.id : ''
  if (route.page === 'logs' && !route.id && !loading.value) {
    const query = new URLSearchParams(window.location.search)
    const restored = {page: Math.max(1, Number(query.get('logs.page')) || 1), size: Number(query.get('logs.size')) || 10, keyword: query.get('logs.q') || '', status: query.get('logs.status') || 'ALL'}
    if (Object.entries(restored).some(([key, value]) => executionPage[key] !== value)) queryExecutions(restored)
  }
  if (route.page === 'logs' && route.id && !loading.value && !executions.value.some(row => row.id === route.id) && !pendingActions.has('query:executions')) {
    queryExecutions({page: 1, keyword: route.id, status: 'ALL'})
  }
}
window.addEventListener('popstate', syncRoute)
window.addEventListener('app-route', syncRoute)
onBeforeUnmount(() => {
  window.removeEventListener('popstate', syncRoute)
  window.removeEventListener('app-route', syncRoute)
  clearTimeout(toastTimer)
})

/** 清空认证态和已加载业务数据，防止会话失效后旧数据继续停留在页面。 */
function requireLogin() {
  currentUser.value = null
  loginError.value = '登录状态已失效，请重新登录'
  loading.value = false
  dataItems.value = [];
  components.value = [];
  templates.value = [];
  fileRuleTemplates.value = [];
  tasks.value = [];
  executions.value = [];
  executionMessages.value = []
  for (const key of Object.keys(connectionChecks)) delete connectionChecks[key]
  for (const key of Object.keys(resourceErrors)) delete resourceErrors[key]
  updatedAt.value = ''
}

/** 启动时先恢复后端 Session；未认证时只展示登录页，不调用业务接口。 */
async function initialize() {
  try {
    const session = await api.getSession()
    currentUser.value = isAuthenticatedUser(session) ? session : null
    api.setUnauthorizedHandler(requireLogin)
    if (currentUser.value) await loadAll()
  } catch (error) {
    loginError.value = error.status === 401 ? '' : error.message
  } finally {
    api.setUnauthorizedHandler(requireLogin)
    checkingAuthentication.value = false
  }
}

async function login(credentials) {
  loginLoading.value = true
  loginError.value = ''
  try {
    const user = await api.login(credentials)
    if (!isAuthenticatedUser(user)) throw new Error('登录响应缺少用户名，请检查后端认证服务')
    currentUser.value = user
    await loadAll()
  } catch (error) {
    currentUser.value = null
    loginError.value = error.message
  } finally {
    loginLoading.value = false
  }
}

async function logout() {
  if (hasUnsavedMessageChanges.value && !window.confirm('当前表单仍有未保存修改，退出后修改将丢失。是否继续退出？')) return
  await runExclusive(pendingActions, 'logout', async () => {
    try {
      await api.logout()
    } catch (error) {
      if (error.status !== 401) showError(error)
    }
    requireLogin()
    loginError.value = ''
    loading.value = false
  })
}

async function loadAll(showLoading = true) {
  if (showLoading) loading.value = true
  loadError.value = ''
  const user = currentUser.value
  const executionQuery = {...executionPage}
  const isLatestExecution = beginExecutionQuery()
  const jobs = [
    ['数据项', () => api.list('data-items'), rows => { dataItems.value = rows.map(normalizeDataItem) }],
    ['消息云组件', () => api.list('message-components'), rows => { components.value = rows.map(flattenResource) }],
    ['报文模板', () => api.list('messages'), rows => { templates.value = rows.map(normalizeTemplate) }],
    ['文件规则模板', () => api.list('file-rule-templates'), rows => { fileRuleTemplates.value = rows.map(flattenResource) }],
    ['任务', () => api.list('tasks'), rows => { tasks.value = rows.map(flattenResource) }],
    ['执行记录', () => api.listExecutions(executionQuery), rows => { if (isLatestExecution()) applyExecutionPage(rows) }],
    ['运行统计', () => api.getExecutionAnalytics(analyticsRange.value), rows => { executionAnalytics.value = rows || {} }]
  ]
  await Promise.allSettled(jobs.map(async ([name, fetchRows, apply]) => {
    try {
      const rows = await fetchRows()
      if (currentUser.value !== user) return
      apply(rows)
      resourceErrors[name] = ''
      updatedAt.value = new Date().toLocaleString('zh-CN')
    } catch (error) {
      if (currentUser.value === user) resourceErrors[name] = error.message
    }
  }))
  if (showLoading) loading.value = false
  if (isLatestExecution()) pendingActions.delete('query:executions')
  syncRoute()
}

/** 应用后端分页结果，并保留当前查询条件供刷新复用。 */
function applyExecutionPage(response) {
  executions.value = Array.isArray(response?.records) ? response.records : []
  executionPage.page = Number(response?.page || 1)
  executionPage.size = Number(response?.size || 10)
  executionPage.total = Number(response?.total || 0)
  executionPage.totalPages = Number(response?.totalPages || 1)
}

/** 执行记录搜索、状态和翻页均在数据库端完成，避免只筛选当前页。 */
const beginExecutionQuery = latestRequest()
async function queryExecutions(query = {}) {
  const isLatest = beginExecutionQuery()
  const user = currentUser.value
  executionPage.page = Number(query.page || 1)
  executionPage.size = Number(query.size || executionPage.size || 10)
  executionPage.keyword = query.keyword == null ? executionPage.keyword : String(query.keyword)
  executionPage.status = query.status || executionPage.status || 'ALL'
  // 详情定位查询不覆盖列表条件，返回列表时从原查询参数恢复。
  if (!routeId.value && activePage.value === 'logs') {
    const params = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries({q: executionPage.keyword, status: executionPage.status, page: executionPage.page, size: executionPage.size})) params.set('logs.' + key, String(value))
    window.history.replaceState(window.history.state, '', window.location.pathname + '?' + params.toString())
  }
  pendingActions.add('query:executions')
    try {
      const rows = await api.listExecutions({...executionPage})
      if (isLatest() && currentUser.value === user) applyExecutionPage(rows)
    } catch (error) {
      if (isLatest() && currentUser.value === user) showError(error)
    } finally {
      if (isLatest()) pendingActions.delete('query:executions')
    }
}

async function createResource(item, onCreated, onFailed) {
  if (!canManage.value) { notify('当前账号没有配置管理权限', 'error'); return }
  const endpoint = endpoints[activePage.value]
  await runExclusive(pendingActions, `create:${endpoint}`, async () => {
    try {
      const created = await api.create(endpoint, serializeResource(item))
      await loadAll(false)
      if (typeof onCreated === 'function') onCreated(flattenResource(created))
      const message = endpoint === 'file-rule-templates' && item.status === 'PUBLISHED' ? '模板发布成功' : '已保存'
      notify(Object.values(resourceErrors).some(Boolean) ? `${message}，部分列表更新失败，可重新加载` : message)
    } catch (error) {
      if (typeof onFailed === 'function') onFailed(error.message)
      showError(error)
    }
  })
}

async function updateResource(item, onUpdated) {
  if (!canManage.value) { notify('当前账号没有配置管理权限', 'error'); return }
  const endpoint = endpoints[activePage.value]
  await runExclusive(pendingActions, `update:${endpoint}:${item.id}`, async () => {
    try {
      const updated = await api.update(endpoint, item.id, serializeResource(item))
      if (endpoint === 'message-components') {
        for (const key of Object.keys(connectionChecks)) if (key.startsWith(item.id + ':')) delete connectionChecks[key]
      }
      await loadAll(false)
      if (typeof onUpdated === 'function') onUpdated({success: true, resource: flattenResource(updated)})
      const message = endpoint === 'file-rule-templates' && item.status === 'PUBLISHED' ? '模板发布成功' : '修改已保存'
      notify(Object.values(resourceErrors).some(Boolean) ? `${message}，部分列表更新失败，可重新加载` : message)
    } catch (error) {
      if (typeof onUpdated === 'function') onUpdated({success: false, error: error.message})
      showError(error)
    }
  })
}

async function removeResource(id, onRemoved) {
  if (!canManage.value) { notify('当前账号没有配置管理权限', 'error'); return }
  const endpoint = endpoints[activePage.value]
  await runExclusive(pendingActions, `remove:${endpoint}:${id}`, async () => {
    try {
      await api.remove(endpoint, id)
      await loadAll(false)
      if (typeof onRemoved === 'function') onRemoved()
      notify('已删除，历史执行记录仍保留')
    } catch (error) {
      showError(error)
    }
  })
}

const executionRequestIds = new Map()

async function runTask(command) {
  const item = command?.task || command
  const originalRequest = command?.request || {mode: 'MANUAL_CURRENT'}
  const requestKey = `${item.id}:${originalRequest.mode || 'MANUAL_CURRENT'}:${originalRequest.plannedTriggerTime || ''}`
  const requestId = originalRequest.requestId || executionRequestIds.get(requestKey) || createRequestId()
  executionRequestIds.set(requestKey, requestId)
  const request = {...originalRequest, requestId}
  const modeError = executionModeError(canManage.value, request)
  if (modeError) { notify(modeError, 'error'); return }
  await runExclusive(pendingActions, `run:${item.id}`, async () => {
    try {
      const result = await api.executeTask(item.id, request)
      executionRequestIds.delete(requestKey)
      await loadAll(false)
      const summary = `Execution ${result.executionId}：成功 ${result.success}/${result.total}，失败 ${result.failed}`
      const failure = result.errorMessage ? `；${result.errorMessage}` : (result.deliveryStatus === 'PARTIAL_SUCCESS' ? '（部分投递失败）' : '')
      notify(result.deliveryStatus === 'SUCCESS' ? summary : `${summary}${failure}`, result.deliveryStatus === 'SUCCESS' ? 'success' : 'error')
      if (typeof command?.onCompleted === 'function') command.onCompleted(result)
    } catch (error) {
      // 请求响应丢失或服务端报告防重冲突时，先按 requestId 恢复唯一结果，禁止盲目生成新批次。
      if (!error.status || error.status === 409 || error.status >= 500) {
        try {
          const state = await api.getExecutionRequest(requestId)
          if (state.status === 'COMPLETED' && state.result) {
            executionRequestIds.delete(requestKey)
            await loadAll(false)
            const result = state.result
            notify(`Execution ${result.executionId}：成功 ${result.success}/${result.total}，失败 ${result.failed}`,
              result.deliveryStatus === 'SUCCESS' ? 'success' : 'error')
            if (typeof command?.onCompleted === 'function') command.onCompleted(result)
            return
          }
          if (state.status === 'IN_PROGRESS') {
            const message = '执行请求仍在处理中，请稍后查看执行记录，无需重复提交。'
            if (typeof command?.onFailed === 'function') command.onFailed(message)
            notify(message, 'warning')
            return
          }
          if (state.status === 'FAILED') executionRequestIds.delete(requestKey)
        } catch (_) { /* 保留原始错误提示；同一参数重试继续复用 requestId。 */ }
      }
      // 投递前失败也会由后端保存为执行明细，刷新后可立即从执行记录查看失败阶段与原因。
      await loadAll(false)
      const message = !error.status || error.status >= 500
        ? '执行结果暂未确认，请先查看执行记录，避免重复补跑。'
        : error.message
      if (typeof command?.onFailed === 'function') command.onFailed(message)
      notify(message, !error.status || error.status >= 500 ? 'warning' : 'error')
      if (error.status && error.status < 500 && error.status !== 409) executionRequestIds.delete(requestKey)
    }
  })
}

const previewRequests = new Map()
async function previewTaskTime(command) {
  const item = command?.task
  if (!item) return
  if (!previewRequests.has(item.id)) previewRequests.set(item.id, latestRequest())
  const isLatest = previewRequests.get(item.id)()
  pendingActions.add(`preview-time:${item.id}`)
    try {
      const result = await api.previewTaskTime(item.id, command.request || {mode: 'MANUAL_CURRENT'})
      if (isLatest() && typeof command.onLoaded === 'function') command.onLoaded(result)
    } catch (error) {
      if (isLatest() && typeof command.onLoaded === 'function') command.onLoaded(null)
      if (isLatest()) showError(error)
    } finally {
      if (isLatest()) pendingActions.delete(`preview-time:${item.id}`)
    }
}

const beginMessagesRequest = latestRequest()
async function loadMessages(executionId, onLoaded) {
  await runExclusive(pendingActions, `load-messages:${executionId}`, async () => {
    const isLatest = beginMessagesRequest()
    const user = currentUser.value
    try {
      const rows = await api.listExecutionMessages(executionId)
      if (!isLatest() || currentUser.value !== user) return
      executionMessages.value = rows.map(normalizeExecutionMessage)
      if (typeof onLoaded === 'function') onLoaded({error: ''})
    } catch (error) {
      if (!isLatest() || currentUser.value !== user) return
      executionMessages.value = []
      if (typeof onLoaded === 'function') onLoaded({error: error?.message || '执行明细加载失败'})
      showError(error)
    }
  })
}

async function loadTaskExecutionOverview(taskId, onLoaded) {
  await runExclusive(pendingActions, `load-task-execution-overview:${taskId}`, async () => {
    try {
      const data = await api.getTaskExecutionOverview(taskId)
      if (typeof onLoaded === 'function') onLoaded({data, error: ''})
    } catch (error) {
      if (typeof onLoaded === 'function') onLoaded({data: null, error: error?.message || '任务执行概览加载失败'})
      showError(error)
    }
  })
}

async function checkComponent({id, topic = ''}) {
  if (!canCheckConnection.value) { notify('当前账号没有 MQ 连接检查权限', 'error'); return }
  await runExclusive(pendingActions, `check:${id}:${topic}`, async () => {
    try {
      const result = await api.checkMessageComponent(id, topic);
      connectionChecks[id + ':' + topic] = {...result, checkedAt: new Date().toLocaleString('zh-CN')}
      notify(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      connectionChecks[id + ':' + topic] = {success: false, message: error.message, checkedAt: new Date().toLocaleString('zh-CN')}
      showError(error)
    }
  })
}

async function batchUpdateTasks({items, enabled, onCompleted}) {
  if (!canManage.value) return
  await runExclusive(pendingActions, 'batch:tasks', async () => {
    const results = []
    for (const item of items) {
      try {
        const result = await runExclusive(pendingActions, 'update:tasks:' + item.id,
          () => api.update('tasks', item.id, serializeResource({...item, status: enabled ? 'ENABLED' : 'DISABLED'})))
        if (!result.executed) throw new Error('该任务正在处理，请稍后再试')
        results.push({id:item.id, name:item.name, success:true})
      } catch (error) { results.push({id:item.id, name:item.name, success:false, error:error.message}) }
    }
    await loadAll(false)
    onCompleted?.(results)
  })
}

async function loadDataItem(id, onLoaded) {
  await runExclusive(pendingActions, `load-data-item:${id}`, async () => {
    try {
      const data = await api.getDataItem(id)
      if (typeof onLoaded === 'function') onLoaded({data, error: ''})
    } catch (error) {
      if (typeof onLoaded === 'function') onLoaded({data: null, error: error?.message || '数据项详情加载失败'})
      showError(error)
    }
  })
}

function openTaskDetail(task) {
  setRoute('tasks', task.id)
}

/** 从总览直接定位某次执行，避免用户在日志页再次人工检索 Execution ID。 */
async function openExecutionDetail(executionId) {
  await queryExecutions({page: 1, keyword: executionId, status: 'ALL'})
  selectedExecutionId.value = executionId
  activePage.value = 'logs'
  setRoute('logs', executionId)
  window.scrollTo({top: 0, behavior: 'smooth'})
}

/** 更新时间窗口或手动刷新总览，分析接口与最近执行列表使用同一刷新时点。 */
async function refreshOverview(range = analyticsRange.value) {
  analyticsRange.value = range === '7d' ? '7d' : '24h'
  await runExclusive(pendingActions, 'refresh:overview', async () => {
    try {
      const [analytics, executionRows] = await Promise.all([
        api.getExecutionAnalytics(analyticsRange.value),
        api.listExecutions({page: 1, size: executionPage.size, keyword: '', status: 'ALL'})
      ])
      executionAnalytics.value = analytics
      executionPage.keyword = ''
      executionPage.status = 'ALL'
      applyExecutionPage(executionRows)
    } catch (error) {
      showError(error)
    }
  })
}

/** 图表点击后进入执行记录，并保留失败阶段或 MQ 实例筛选上下文。 */
async function openLogFilter(filter = {}) {
  selectedExecutionId.value = ''
  await queryExecutions({page: 1, keyword: filter.keyword || '', status: filter.status || 'ALL'})
  activePage.value = 'logs'
  setRoute('logs')
  window.scrollTo({top: 0, behavior: 'smooth'})
}

/** 命令面板使用独立查询，避免搜索执行记录时改写执行列表的分页与筛选状态。 */
async function searchGlobalExecutions(keyword, onLoaded) {
  try {
    const response = await api.listExecutions({page: 1, size: 8, keyword, status: 'ALL'})
    onLoaded?.(response?.records || [])
  } catch { onLoaded?.([]) }
}

function openGlobalResult(item) {
  if (item.kind === 'execution') { openExecutionDetail(item.id); return }
  if (item.id && ['tasks', 'messages'].includes(item.page)) { setRoute(item.page, item.id); return }
  navigate(item.page, item.filter ? {keyword: item.filter} : undefined)
}

async function runGlobalAction(action) {
  if (action === 'failed-executions') { await openLogFilter({status: 'FAILED'}); return }
  const page = action === 'new-task' ? 'tasks' : 'messages'
  navigate(page)
  await nextTick()
  window.dispatchEvent(new CustomEvent('global-create', {detail: {page}}))
}

onMounted(initialize)
</script>

<template>
  <main v-if="checkingAuthentication" class="authentication-loading">
    <div><span>MS</span>
      <p>正在检查登录状态…</p></div>
  </main>
  <LoginView v-else-if="!isAuthenticated" :loading="loginLoading" :error="loginError" @login="login"/>
  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand"><span>MS</span>
        <div><b>报文模拟系统</b><small>MESSAGE SIMULATION</small></div>
      </div>
      <template v-for="group in navigationGroups" :key="group.label">
      <p class="navigation-label">{{ group.label }}</p>
      <nav class="navigation" aria-label="主导航">
        <button v-for="item in group.items" :key="item.key" class="nav-item" :class="{ active: activePage === item.key }"
                :aria-current="activePage === item.key ? 'page' : undefined"
                :aria-label="item.label" :title="item.label" @click="navigate(item.key)">
          <AppIcon :name="item.icon"/>
          <span>{{ item.label }}</span></button>
      </nav>
      </template>
      <div class="environment-card" :class="componentHealthState.tone"><span>{{ componentHealthState.label }}</span><small>{{ componentHealthState.detail }}</small></div>
    </aside>
    <div class="content-shell">
      <header class="topbar">
        <div class="breadcrumb"><b>{{ pageTitle }}</b></div>
        <GlobalSearch :tasks="tasks" :templates="templates" :components="components" :data-items="dataItems"
                      :can-manage="canManage" @open="openGlobalResult" @action="runGlobalAction"
                      @search-executions="searchGlobalExecutions"/>
        <div class="account-area"><span class="service-tag" :class="serviceState.tone">{{
            serviceState.label
          }}</span><span class="account-avatar">{{ authenticatedUsername.slice(0, 2).toUpperCase() }}</span><span
            class="account-name">{{ authenticatedUsername }}</span><span class="account-role">{{ authenticatedRole === 'ADMIN' ? '管理员' : '任务操作员' }}</span>
          <button class="logout-button" :disabled="pendingActions.has('logout')" @click="logout">
            <AppIcon name="logout" :size="16"/>
            <span>{{ pendingActions.has('logout') ? '正在退出…' : '退出' }}</span>
          </button>
        </div>
      </header>
      <PageSkeleton v-if="loading"/>
      <aside v-if="!loading && Object.values(resourceErrors).some(Boolean)" class="notice" role="alert">
        <b>部分数据更新失败，已保留上次结果</b>
        <p v-for="(error, name) in resourceErrors" :key="name" v-show="error">{{ name }}：{{ error }}</p>
        <button class="button secondary small" @click="loadAll(false)">重新加载</button>
      </aside>
      <component v-if="!loading" :is="currentComponent" v-bind="pageProps" @navigate="navigate" @task-action="openTaskDetail"
                 @open-execution="openExecutionDetail" @refresh-overview="refreshOverview" @filter-logs="openLogFilter"
                 @create="createResource" @run="runTask" @preview-time="previewTaskTime" @update="updateResource"
                 @batch-update="batchUpdateTasks"
                 @notify="notify" @editing-state="hasUnsavedMessageChanges = $event" @remove="removeResource"
                 @load-messages="loadMessages" @load-task-execution-overview="loadTaskExecutionOverview"
                 @query-executions="queryExecutions" @check-component="checkComponent" @load-data-item="loadDataItem"/>
    </div>
    <transition name="toast">
      <div v-if="toast" class="toast" :class="toast.tone" :role="toast.tone === 'error' ? 'alert' : 'status'"
           :aria-live="toast.tone === 'error' ? 'assertive' : 'polite'"><strong>{{ toast.title }}</strong><span>{{ toast.message }}</span></div>
    </transition>
  </div>
</template>

<style scoped>
.authentication-loading {
  display: grid;
  min-height: 100vh;
  place-items: center;
  background: #f5f5f5;
  color: #8c8c8c;
}

.authentication-loading div {
  text-align: center;
}

.authentication-loading span {
  display: grid;
  width: 46px;
  height: 46px;
  margin: 0 auto 14px;
  place-items: center;
  border-radius: 8px;
  background: #1677ff;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 2px 8px #00000014;
}

.authentication-loading p {
  margin: 0;
}

.account-area {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 11px;
  white-space: nowrap;
}

.account-name {
  color: #434343;
  font-size: 14px;
  font-weight: 650;
}

.account-role {
  padding: 3px 7px;
  border-radius: 4px;
  background: #e6f4ff;
  color: #1677ff;
  font-size: 11px;
  font-weight: 650;
}

.account-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: #e6f4ff;
  color: #1677ff;
  font-size: 12px;
  font-weight: 750;
}

.logout-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #595959;
  font-size: 13px;
  font-weight: 550;
}

.logout-button:hover {
  background: #f5f5f5;
  color: #1677ff;
}

.logout-button:disabled {
  color: #a8b1bf;
  cursor: not-allowed;
}

.toast strong, .toast span {
  display: block;
}

.toast strong {
  font-size: 14px;
  line-height: 1.35;
}

.toast span {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.45;
}
</style>
