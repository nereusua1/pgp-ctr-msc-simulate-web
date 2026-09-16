const paths = {overview: 'overview', tasks: 'tasks', messages: 'messages', 'file-rules': 'file-rules', 'data-items': 'data-items', 'message-components': 'message-components', logs: 'executions'}
const scrollPositions = new Map()
export function parseRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  const page = Object.keys(paths).find(key => paths[key] === parts[0]) || 'overview'
  let id = ''
  try { id = decodeURIComponent(parts[1] || '') } catch { /* 无效地址显示列表 */ }
  return {page, id, edit: parts[2] === 'edit'}
}
export function routePath(page, id = '', edit = false) {
  return '/' + (paths[page] || 'overview') + (id ? '/' + encodeURIComponent(id) : '') + (edit ? '/edit' : '')
}
export function setRoute(page, id = '', edit = false, replace = false) {
  const path = routePath(page, id, edit) + window.location.search
  if (window.location.pathname + window.location.search === path) return
  const previous = parseRoute(window.location.pathname)
  if (!previous.id) scrollPositions.set(previous.page, window.scrollY)
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new Event('app-route'))
  if (!id) requestAnimationFrame(() => window.scrollTo(0, scrollPositions.get(page) || 0))
}
