import {ref, watch, onBeforeUnmount} from 'vue'

/** 列表状态存入带页面前缀的查询参数，刷新和浏览器前进后退可恢复。 */
export function useListState(prefix) {
  const keyword = ref('')
  const status = ref('ALL')
  const page = ref(1)
  const pageSize = ref(10)
  let syncing = false
  function restore() {
    syncing = true
    const query = new URLSearchParams(window.location.search)
    keyword.value = query.get(prefix + '.q') || ''
    status.value = query.get(prefix + '.status') || 'ALL'
    page.value = Math.max(1, Number(query.get(prefix + '.page')) || 1)
    const size = Number(query.get(prefix + '.size'))
    pageSize.value = [10, 20, 50].includes(size) ? size : 10
    syncing = false
  }
  restore()
  watch([keyword, status, pageSize], () => { if (!syncing) page.value = 1 }, {flush: 'sync'})
  watch([keyword, status, page, pageSize], () => {
    if (syncing) return
    const query = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries({q: keyword.value, status: status.value, page: page.value, size: pageSize.value})) {
      query.set(prefix + '.' + key, String(value))
    }
    window.history.replaceState(window.history.state, '', window.location.pathname + '?' + query.toString())
  }, {flush: 'sync'})
  window.addEventListener('popstate', restore)
  onBeforeUnmount(() => window.removeEventListener('popstate', restore))
  return {keyword, status, page, pageSize}
}

/** 为列表补充一个可由地址栏恢复的独立筛选条件。 */
export function useListQueryValue(prefix, key, fallback = '') {
  const value = ref(fallback)
  let syncing = false
  function restore() {
    syncing = true
    value.value = new URLSearchParams(window.location.search).get(`${prefix}.${key}`) || fallback
    syncing = false
  }
  restore()
  watch(value, current => {
    if (syncing) return
    const query = new URLSearchParams(window.location.search)
    query.set(`${prefix}.${key}`, String(current))
    window.history.replaceState(window.history.state, '', window.location.pathname + '?' + query.toString())
  }, {flush: 'sync'})
  window.addEventListener('popstate', restore)
  onBeforeUnmount(() => window.removeEventListener('popstate', restore))
  return value
}
