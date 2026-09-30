import {parseSuccessfulResponse} from './api-response.mjs'
import {createRequestId} from './request-id.mjs'

let unauthorizedHandler = () => {
}
let sessionActivityHandler = () => {
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
    const result = await parseSuccessfulResponse(response)
    sessionActivityHandler(result)
    return result
}
export const setUnauthorizedHandler = handler => {
    unauthorizedHandler = typeof handler === 'function' ? handler : () => {
    }
}
export const setSessionActivityHandler = handler => {
    sessionActivityHandler = typeof handler === 'function' ? handler : () => {
    }
}
export const login = credentials => request('/auth/login', {method: 'POST', body: JSON.stringify(credentials)})
export const getSession = () => request('/auth/session')
export const logout = () => request('/auth/logout', {method: 'POST'})
export const list = type => request(`/${type}`)
export const create = (type, body) => request(`/${type}`, {method: 'POST', body: JSON.stringify(body)})
export const update = (type, id, body) => request(`/${type}/${id}`, {method: 'PUT', body: JSON.stringify(body)})
export const remove = (type, id) => request(`/${type}/${id}`, {method: 'DELETE'})
export const runNow = (id, requestId = createRequestId()) => request(`/tasks/${id}:run-now`, {
    method: 'POST', headers: {'Accept': 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': requestId}
})
export const executeTask = (id, body) => request(`/tasks/${id}:execute`, {method: 'POST', body: JSON.stringify(body)})
/** 查询一次幂等执行请求的处理中或终态结果。 */
export const getExecutionRequest = requestId => request(`/executions/requests/${encodeURIComponent(requestId)}`)
export const previewTaskTime = (id, body) => request(`/tasks/${id}:preview-time`, {method: 'POST', body: JSON.stringify(body)})
/** 分页读取执行摘要；列表接口不返回完整报文正文。 */
export const listExecutions = ({page = 1, size = 10, keyword = '', status = 'ALL', messageType = 'ALL', dataItemCode = '', failureStage = '', startTime = '', endTime = ''} = {}) => {
    const query = new URLSearchParams({page: String(page), size: String(size), keyword, status, messageType})
    if (dataItemCode) query.set('dataItemCode', dataItemCode)
    if (failureStage) query.set('failureStage', failureStage)
    if (startTime) query.set('startTime', startTime)
    if (endTime) query.set('endTime', endTime)
    return request(`/executions?${query.toString()}`)
}
export const listExecutionMessages = executionId => request(`/executions/${encodeURIComponent(executionId)}/messages`)
/** 指定窗口的真实总览聚合；仅支持 24h 与 7d，响应不包含报文正文。 */
export const getExecutionAnalytics = (range = '24h') => request(`/executions/analytics?range=${encodeURIComponent(range)}`)
/** 单个任务的累计执行统计和最近五次执行，不受执行日志当前页影响。 */
export const getTaskExecutionOverview = taskId => request(`/tasks/${encodeURIComponent(taskId)}/execution-overview`)
export const checkMessageComponent = (id, topic = '') => request(`/message-components/${id}/connection-check${topic ? `?topic=${encodeURIComponent(topic)}` : ''}`)
export const probeFile = (filePath, storageType = 'OSS') => request(`/file-references/probe?filePath=${encodeURIComponent(filePath)}&storageType=${encodeURIComponent(storageType)}`)
export const inspectFile = (filePath, delimiter = ',', storageType = 'OSS') => request(`/file-references/inspect?filePath=${encodeURIComponent(filePath)}&delimiter=${encodeURIComponent(delimiter)}&storageType=${encodeURIComponent(storageType)}`)
export const getDataItem = groupId => request(`/data-items/${encodeURIComponent(groupId)}`)
/** SQL 日期生成任务使用独立接口，避免混入报文任务和 MQ 执行记录。 */
export const listSqlDateTasks = () => request('/sql-date-tasks')
export const previewSqlDateSchedule = body => request('/sql-date-tasks/schedule-preview', {method: 'POST', body: JSON.stringify(body)})
export const createSqlDateTask = body => request('/sql-date-tasks', {method: 'POST', body: JSON.stringify(body)})
export const updateSqlDateTask = (id, body) => request(`/sql-date-tasks/${id}`, {method: 'PUT', body: JSON.stringify(body)})
export const deleteSqlDateTask = id => request(`/sql-date-tasks/${id}`, {method: 'DELETE'})
export const getSqlDateTableColumns = (schemaName, tableName) => request(`/sql-date-tasks/table-columns?schemaName=${encodeURIComponent(schemaName)}&tableName=${encodeURIComponent(tableName)}`)
export const previewSqlDateTask = (id, body) => request(`/sql-date-tasks/${id}:preview`, {method: 'POST', body: JSON.stringify(body)})
export const executeSqlDateTask = (id, body) => request(`/sql-date-tasks/${id}:execute`, {method: 'POST', body: JSON.stringify(body)})
export const listSqlDateExecutions = id => request(`/sql-date-tasks/${id}/executions`)
export const searchDataSourceOptions = (keyword = '', limit = 20) => request(`/data-items/source-options?keyword=${encodeURIComponent(keyword)}&limit=${limit}`)
export const searchDataItemOptions = (sourceCode, keyword = '', limit = 20) => request(`/data-items/options?sourceCode=${encodeURIComponent(sourceCode)}&keyword=${encodeURIComponent(keyword)}&limit=${limit}`)
export const searchElementOptions = (dataItemCode, sourceCode, keyword = '', limit = 50) => request(`/data-items/element-options?dataItemCode=${encodeURIComponent(dataItemCode)}&sourceCode=${encodeURIComponent(sourceCode)}&keyword=${encodeURIComponent(keyword)}&limit=${limit}`)
