<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import OverviewView from './views/OverviewView.vue'
import TaskManagementView from './views/TaskManagementView.vue'
import MessageManagementView from './views/MessageManagementView.vue'
import DataItemManagementView from './views/DataItemManagementView.vue'
import MessageComponentManagementView from './views/MessageComponentManagementView.vue'
import ExecutionLogView from './views/ExecutionLogView.vue'
import LoginView from './views/LoginView.vue'
import AppIcon from './components/AppIcon.vue'
import PageSkeleton from './components/PageSkeleton.vue'
import * as api from './api'
import { runExclusive } from './action-guard.mjs'
import { flattenResource, normalizeDataItem, normalizeExecutionMessage, normalizeTemplate, serializeResource } from './resource-adapter.mjs'

const navigation = [
  { key: 'overview', label: '运行总览', icon: 'overview' },
  { key: 'tasks', label: '任务管理', icon: 'tasks' },
  { key: 'messages', label: '报文管理', icon: 'messages' },
  { key: 'data-items', label: '数据项管理', icon: 'data' },
  { key: 'message-components', label: '消息组件管理', icon: 'components' },
  { key: 'logs', label: '执行日志', icon: 'logs' }
]
const endpoints = { tasks: 'tasks', messages: 'messages', 'data-items': 'data-items', 'message-components': 'message-components' }
const activePage = ref('overview')
const dataItems = ref([])
const components = ref([])
const templates = ref([])
const tasks = ref([])
const executions = ref([])
const executionAnalytics = ref({ trend: [], failureStages: [], mqDistribution: [], taskTrends: [], recentFailures: [] })
const analyticsRange = ref('24h')
const executionPage = reactive({ page: 1, size: 10, total: 0, totalPages: 1, keyword: '', status: 'ALL' })
const executionMessages = ref([])
const selectedTaskId = ref('')
const selectedExecutionId = ref('')
const loading = ref(true)
const loadError = ref('')
const toast = ref(null)
const currentUser = ref(null)
const checkingAuthentication = ref(true)
const loginLoading = ref(false)
const loginError = ref('')
const hasUnsavedMessageChanges = ref(false)
const pendingActions = reactive(new Set())
let toastTimer

const pageTitle = computed(() => navigation.find(item => item.key === activePage.value)?.label || '运行总览')
const serviceState = computed(() => loadError.value ? { label: '接口异常', tone: 'error' } : { label: '服务在线', tone: 'online' })
const currentComponent = computed(() => ({ overview: OverviewView, tasks: TaskManagementView, messages: MessageManagementView, 'data-items': DataItemManagementView, 'message-components': MessageComponentManagementView, logs: ExecutionLogView })[activePage.value])
const pageProps = computed(() => {
  if (activePage.value === 'overview') return {
    tasks: tasks.value,
    executions: executions.value,
    executionPage,
    analytics: executionAnalytics.value,
    analyticsRange: analyticsRange.value,
    analyticsPending: pendingActions.has('refresh:overview'),
    components: components.value,
    templates: templates.value
  }
  if (activePage.value === 'tasks') return { tasks: tasks.value, templates: templates.value, sources: dataItems.value, executionMessages: executionMessages.value, selectedTaskId: selectedTaskId.value, pendingActions }
  if (activePage.value === 'messages') return { templates: templates.value, sources: dataItems.value, components: components.value, tasks: tasks.value, pendingActions }
  if (activePage.value === 'data-items') return { items: dataItems.value, pendingActions }
  if (activePage.value === 'message-components') return { components: components.value, templates: templates.value, tasks: tasks.value, pendingActions }
  return { executions: executions.value, executionPage, messages: executionMessages.value, pendingActions, selectedExecutionId: selectedExecutionId.value }
})

function notify(message, tone = 'success') {
  const titles = { success: '操作成功', error: '操作失败', warning: '存在未保存修改' }
  toast.value = { title: titles[tone] || '操作结果', message, tone }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3600)
}
function showError(error) { notify(error?.message || '操作失败', 'error') }
function navigate(page) {
  if (page !== activePage.value && hasUnsavedMessageChanges.value && !window.confirm('报文配置仍有未保存修改，离开后修改将丢失。是否继续离开？')) return
  hasUnsavedMessageChanges.value = false
  if (page !== 'tasks') selectedTaskId.value = ''
  if (page !== 'logs') selectedExecutionId.value = ''
  activePage.value = page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 清空认证态和已加载业务数据，防止会话失效后旧数据继续停留在页面。 */
function requireLogin() {
  currentUser.value = null
  loginError.value = '登录状态已失效，请重新登录'
  loading.value = false
  dataItems.value = []; components.value = []; templates.value = []; tasks.value = []; executions.value = []; executionMessages.value = []
}

/** 启动时先恢复后端 Session；未认证时只展示登录页，不调用业务接口。 */
async function initialize() {
  try {
    currentUser.value = await api.getSession()
    api.setUnauthorizedHandler(requireLogin)
    await loadAll()
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
    currentUser.value = await api.login(credentials)
    await loadAll()
  } catch (error) {
    currentUser.value = null
    loginError.value = error.message
  } finally { loginLoading.value = false }
}

async function logout() {
  if (hasUnsavedMessageChanges.value && !window.confirm('报文配置仍有未保存修改，退出后修改将丢失。是否继续退出？')) return
  await runExclusive(pendingActions, 'logout', async () => {
    try { await api.logout() } catch (error) { if (error.status !== 401) showError(error) }
    currentUser.value = null
    loginError.value = ''
    loading.value = false
  })
}

async function loadAll(showLoading = true) {
  if (showLoading) loading.value = true
  loadError.value = ''
  try {
    const [sourceRows, componentRows, templateRows, taskRows, executionRows, analytics] = await Promise.all([
      api.list('data-items'), api.list('message-components'), api.list('messages'), api.list('tasks'), api.listExecutions(executionPage), api.getExecutionAnalytics(analyticsRange.value)
    ])
    dataItems.value = sourceRows.map(normalizeDataItem)
    components.value = componentRows.map(flattenResource)
    templates.value = templateRows.map(normalizeTemplate)
    tasks.value = taskRows.map(flattenResource)
    applyExecutionPage(executionRows)
    executionAnalytics.value = analytics || { trend: [], failureStages: [], mqDistribution: [], taskTrends: [], recentFailures: [] }
  } catch (error) { loadError.value = error.message; showError(error) }
  finally { if (showLoading) loading.value = false }
}

/** 应用后端分页结果，并保留当前查询条件供刷新复用。 */
function applyExecutionPage(response) {
  executions.value = Array.isArray(response?.records) ? response.records : []
  executionPage.page = Number(response?.page || 1)
  executionPage.size = Number(response?.size || 10)
  executionPage.total = Number(response?.total || 0)
  executionPage.totalPages = Number(response?.totalPages || 1)
}

/** 执行日志搜索、状态和翻页均在数据库端完成，避免只筛选当前页。 */
async function queryExecutions(query = {}) {
  executionPage.page = Number(query.page || 1)
  executionPage.size = Number(query.size || executionPage.size || 10)
  executionPage.keyword = query.keyword == null ? executionPage.keyword : String(query.keyword)
  executionPage.status = query.status || executionPage.status || 'ALL'
  await runExclusive(pendingActions, 'query:executions', async () => {
    try { applyExecutionPage(await api.listExecutions(executionPage)) }
    catch (error) { showError(error) }
  })
}

async function createResource(item, onCreated) {
  const endpoint = endpoints[activePage.value]
  await runExclusive(pendingActions, `create:${endpoint}`, async () => {
    try {
      const created = await api.create(endpoint, serializeResource(item))
      await loadAll(false)
      if (typeof onCreated === 'function') onCreated(flattenResource(created))
      notify('已保存到 PostgreSQL')
    } catch (error) { showError(error) }
  })
}
async function updateResource(item, onUpdated) {
  const endpoint = endpoints[activePage.value]
  await runExclusive(pendingActions, `update:${endpoint}:${item.id}`, async () => {
    try {
      await api.update(endpoint, item.id, serializeResource(item))
      await loadAll(false)
      if (typeof onUpdated === 'function') onUpdated({ success: true })
      notify('修改已保存并同步到后端。')
    } catch (error) {
      if (typeof onUpdated === 'function') onUpdated({ success: false })
      showError(error)
    }
  })
}
async function removeResource(id, onRemoved) {
  const endpoint = endpoints[activePage.value]
  await runExclusive(pendingActions, `remove:${endpoint}:${id}`, async () => {
    try {
      await api.remove(endpoint, id)
      await loadAll(false)
      if (typeof onRemoved === 'function') onRemoved()
      notify('已从 PostgreSQL 删除')
    } catch (error) { showError(error) }
  })
}
async function runTask(command) {
  const item = command?.task || command
  const request = command?.request || { mode: 'MANUAL_CURRENT' }
  await runExclusive(pendingActions, `run:${item.id}`, async () => {
    try {
      const result = await api.executeTask(item.id, request)
      await loadAll(false)
      const summary = `Execution ${result.executionId}：成功 ${result.success}/${result.total}，失败 ${result.failed}`
      const failure = result.errorMessage ? `；${result.errorMessage}` : (result.deliveryStatus === 'PARTIAL_SUCCESS' ? '（部分投递失败）' : '')
      notify(result.deliveryStatus === 'SUCCESS' ? summary : `${summary}${failure}`, result.deliveryStatus === 'SUCCESS' ? 'success' : 'error')
      if (typeof command?.onCompleted === 'function') command.onCompleted(result)
    } catch (error) {
      // 投递前失败也会由后端保存为执行明细，刷新后可立即从执行日志查看失败阶段与原因。
      await loadAll(false)
      showError(error)
    }
  })
}
async function previewTaskTime(command) {
  const item = command?.task
  if (!item) return
  await runExclusive(pendingActions, `preview-time:${item.id}`, async () => {
    try {
      const result = await api.previewTaskTime(item.id, command.request || { mode: 'MANUAL_CURRENT' })
      if (typeof command.onLoaded === 'function') command.onLoaded(result)
    } catch (error) {
      if (typeof command.onLoaded === 'function') command.onLoaded(null)
      showError(error)
    }
  })
}
async function loadMessages(executionId, onLoaded) {
  await runExclusive(pendingActions, `load-messages:${executionId}`, async () => {
    try {
      executionMessages.value = (await api.listExecutionMessages(executionId)).map(normalizeExecutionMessage)
      if (typeof onLoaded === 'function') onLoaded({ error: '' })
    } catch (error) {
      executionMessages.value = []
      if (typeof onLoaded === 'function') onLoaded({ error: error?.message || '执行明细加载失败' })
      showError(error)
    }
  })
}
async function loadTaskExecutionOverview(taskId, onLoaded) {
  await runExclusive(pendingActions, `load-task-execution-overview:${taskId}`, async () => {
    try {
      const data = await api.getTaskExecutionOverview(taskId)
      if (typeof onLoaded === 'function') onLoaded({ data, error: '' })
    } catch (error) {
      if (typeof onLoaded === 'function') onLoaded({ data: null, error: error?.message || '任务执行概览加载失败' })
      showError(error)
    }
  })
}
async function checkComponent({ id, topic = '' }) {
  await runExclusive(pendingActions, `check:${id}:${topic}`, async () => {
    try { const result = await api.checkMessageComponent(id, topic); notify(result.message, result.success ? 'success' : 'error') }
    catch (error) { showError(error) }
  })
}
async function loadDataItem(id, onLoaded) {
  await runExclusive(pendingActions, `load-data-item:${id}`, async () => {
    try {
      const data = await api.getDataItem(id)
      if (typeof onLoaded === 'function') onLoaded({ data, error: '' })
    } catch (error) {
      if (typeof onLoaded === 'function') onLoaded({ data: null, error: error?.message || '数据项详情加载失败' })
      showError(error)
    }
  })
}
function openTaskDetail(task) { selectedTaskId.value = task.id; navigate('tasks') }

/** 从总览直接定位某次执行，避免用户在日志页再次人工检索 Execution ID。 */
async function openExecutionDetail(executionId) {
  await queryExecutions({ page: 1, keyword: executionId, status: 'ALL' })
  selectedExecutionId.value = executionId
  activePage.value = 'logs'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 更新时间窗口或手动刷新总览，分析接口与最近执行列表使用同一刷新时点。 */
async function refreshOverview(range = analyticsRange.value) {
  analyticsRange.value = range === '7d' ? '7d' : '24h'
  await runExclusive(pendingActions, 'refresh:overview', async () => {
    try {
      const [analytics, executionRows] = await Promise.all([
        api.getExecutionAnalytics(analyticsRange.value),
        api.listExecutions({ page: 1, size: executionPage.size, keyword: '', status: 'ALL' })
      ])
      executionAnalytics.value = analytics
      executionPage.keyword = ''
      executionPage.status = 'ALL'
      applyExecutionPage(executionRows)
    } catch (error) { showError(error) }
  })
}

/** 图表点击后进入执行日志，并保留失败阶段或 MQ 实例筛选上下文。 */
async function openLogFilter(filter = {}) {
  selectedExecutionId.value = ''
  await queryExecutions({ page: 1, keyword: filter.keyword || '', status: filter.status || 'ALL' })
  activePage.value = 'logs'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(initialize)
</script>

<template>
  <main v-if="checkingAuthentication" class="authentication-loading"><div><span>MS</span><p>正在检查登录状态…</p></div></main>
  <LoginView v-else-if="!currentUser" :loading="loginLoading" :error="loginError" @login="login" />
  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand"><span>MS</span><div><b>报文模拟系统</b><small>MESSAGE SIMULATION</small></div></div>
      <p class="navigation-label">工作空间</p>
      <nav class="navigation" aria-label="主导航">
        <button v-for="item in navigation" :key="item.key" class="nav-item" :class="{ active: activePage === item.key }" :aria-label="item.label" :title="item.label" @click="navigate(item.key)"><AppIcon :name="item.icon" /> <span>{{ item.label }}</span></button>
      </nav>
      <div class="environment-card"><span>测试环境运行正常</span><small>真实接口 · PostgreSQL · RocketMQ</small></div>
    </aside>
    <div class="content-shell">
      <header class="topbar"><div class="breadcrumb"><span>测试环境</span><i>/</i><b>{{ pageTitle }}</b></div><div class="account-area"><span class="service-tag" :class="serviceState.tone">{{ serviceState.label }}</span><span class="account-avatar">{{ currentUser.username.slice(0, 2).toUpperCase() }}</span><span class="account-name">{{ currentUser.username }}</span><button class="logout-button" :disabled="pendingActions.has('logout')" @click="logout"><AppIcon name="logout" :size="16" />{{ pendingActions.has('logout') ? '正在退出…' : '退出' }}</button></div></header>
      <PageSkeleton v-if="loading" />
      <main v-else-if="loadError" class="page"><section class="card empty-state"><h2>数据加载失败</h2><p>{{ loadError }}</p><button class="button primary" @click="loadAll">重新加载</button></section></main>
      <component v-else :is="currentComponent" v-bind="pageProps" @navigate="navigate" @task-action="openTaskDetail" @open-execution="openExecutionDetail" @refresh-overview="refreshOverview" @filter-logs="openLogFilter" @create="createResource" @run="runTask" @preview-time="previewTaskTime" @update="updateResource" @notify="notify" @editing-state="hasUnsavedMessageChanges = $event" @remove="removeResource" @load-messages="loadMessages" @load-task-execution-overview="loadTaskExecutionOverview" @query-executions="queryExecutions" @check-component="checkComponent" @load-data-item="loadDataItem" />
    </div>
    <transition name="toast"><div v-if="toast" class="toast" :class="toast.tone" :role="toast.tone === 'error' ? 'alert' : 'status'" :aria-live="toast.tone === 'error' ? 'assertive' : 'polite'"><strong>{{ toast.title }}</strong><span>{{ toast.message }}</span></div></transition>
  </div>
</template>

<style scoped>
.authentication-loading { display: grid; min-height: 100vh; place-items: center; background: #f5f7fb; color: #758299; }
.authentication-loading div { text-align: center; }
.authentication-loading span { display: grid; width: 46px; height: 46px; margin: 0 auto 14px; place-items: center; border-radius: 13px; background: #15223d; color: #fff; font-weight: 800; box-shadow: 0 12px 30px #1d31521f; }
.authentication-loading p { margin: 0; }
.account-area { display: flex; align-items: center; gap: 11px; }
.account-name { color: #46576f; font-size: 14px; font-weight: 650; }
.account-avatar { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #e8edff; color: #4462c5; font-size: 12px; font-weight: 750; }
.logout-button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 9px; border: 0; border-radius: 8px; background: transparent; color: #66778f; font-size: 13px; font-weight: 550; }
.logout-button:hover { background: #f0f3f8; color: #315ecc; }
.logout-button:disabled { color: #a8b1bf; cursor: not-allowed; }
.toast strong, .toast span { display: block; }
.toast strong { font-size: 14px; line-height: 1.35; }
.toast span { margin-top: 3px; font-size: 13px; line-height: 1.45; }
</style>
