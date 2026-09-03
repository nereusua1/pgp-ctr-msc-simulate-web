import {parseSuccessfulResponse} from './api-response.mjs'

let unauthorizedHandler = () => {
}

const request = async (path, options = {}) => {
    const response = await fetch(`/api${path}`, {
        credentials: 'same-origin',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        ...options
    })
    if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const error = new Error(body.message || `请求失败（HTTP ${response.status}）`)
        error.status = response.status
        if (response.status === 401 && path !== '/auth/login') unauthorizedHandler()
        throw error
    }
    return parseSuccessfulResponse(response)
}
export const setUnauthorizedHandler = handler => {
    unauthorizedHandler = typeof handler === 'function' ? handler : () => {
    }
}
export const login = credentials => request('/auth/login', {method: 'POST', body: JSON.stringify(credentials)})
export const getSession = () => request('/auth/session')
export const logout = () => request('/auth/logout', {method: 'POST'})
export const list = type => request(`/${type}`)
export const create = (type, body) => request(`/${type}`, {method: 'POST', body: JSON.stringify(body)})
export const update = (type, id, body) => request(`/${type}/${id}`, {method: 'PUT', body: JSON.stringify(body)})
export const remove = (type, id) => request(`/${type}/${id}`, {method: 'DELETE'})
export const runNow = id => request(`/tasks/${id}:run-now`, {method: 'POST'})
export const executeTask = (id, body) => request(`/tasks/${id}:execute`, {method: 'POST', body: JSON.stringify(body)})
export const previewTaskTime = (id, body) => request(`/tasks/${id}:preview-time`, {method: 'POST', body: JSON.stringify(body)})
/** 分页读取执行摘要；列表接口不返回完整报文正文。 */
export const listExecutions = ({page = 1, size = 10, keyword = '', status = 'ALL'} = {}) => request(
  `/executions?page=${page}&size=${size}&keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}`
)
export const listExecutionMessages = executionId => request(`/executions/${encodeURIComponent(executionId)}/messages`)
/** 指定窗口的真实总览聚合；仅支持 24h 与 7d，响应不包含报文正文。 */
export const getExecutionAnalytics = (range = '24h') => request(`/executions/analytics?range=${encodeURIComponent(range)}`)
/** 单个任务的累计执行统计和最近五次执行，不受执行日志当前页影响。 */
export const getTaskExecutionOverview = taskId => request(`/tasks/${encodeURIComponent(taskId)}/execution-overview`)
export const checkMessageComponent = (id, topic = '') => request(`/message-components/${id}/connection-check${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`)
export const probeFile = fileName => request(`/file-references/probe?fileName=${encodeURIComponent(fileName)}`)
export const inspectFile = (fileName, delimiter = ',') => request(`/file-references/inspect?fileName=${encodeURIComponent(fileName)}&delimiter=${encodeURIComponent(delimiter)}`)
export const getDataItem = groupId => request(`/data-items/${encodeURIComponent(groupId)}`)
export const searchDataSourceOptions = (keyword = '', limit = 20) => request(`/data-items/source-options?keyword=${encodeURIComponent(keyword)}&limit=${limit}`)
export const searchDataItemOptions = (sourceCode, keyword = '', limit = 20) => request(`/data-items/options?sourceCode=${encodeURIComponent(sourceCode)}&keyword=${encodeURIComponent(keyword)}&limit=${limit}`)
export const searchElementOptions = (dataItemCode, sourceCode, keyword = '', limit = 50) => request(`/data-items/element-options?dataItemCode=${encodeURIComponent(dataItemCode)}&sourceCode=${encodeURIComponent(sourceCode)}&keyword=${encodeURIComponent(keyword)}&limit=${limit}`)
