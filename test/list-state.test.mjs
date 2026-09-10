import test from 'node:test'
import assert from 'node:assert/strict'
import {createRenderer, h} from 'vue'
import {useListState} from '../src/list-state.mjs'

test('列表筛选、分页写入地址，前进后退恢复且卸载移除监听', () => {
  const location = {pathname: '/tasks', search: '?tasks.q=气象&tasks.page=3&tasks.size=20'}
  const listeners = new Map()
  globalThis.window = {
    location,
    history: {state: {}, replaceState(state, title, path) {
      const url = new URL(path, 'http://localhost')
      location.search = url.search
    }},
    addEventListener(name, fn) { listeners.set(name, fn) },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name) }
  }
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null
  })
  let state
  const app = renderer.createApp({setup() { state = useListState('tasks'); return () => h('div') }})
  try {
    app.mount({})
    assert.equal(state.keyword.value, '气象')
    assert.equal(state.page.value, 3)
    assert.equal(state.pageSize.value, 20)
    state.keyword.value = '水文'
    assert.equal(state.page.value, 1)
    assert.equal(new URLSearchParams(location.search).get('tasks.q'), '水文')
    location.search = '?tasks.q=气象&tasks.status=DISABLED&tasks.page=3&tasks.size=50'
    listeners.get('popstate')()
    assert.equal(state.keyword.value, '气象')
    assert.equal(state.status.value, 'DISABLED')
    assert.equal(state.page.value, 3)
    assert.equal(state.pageSize.value, 50)
    state.pageSize.value = 10
    assert.equal(state.page.value, 1)
  } finally {
    app.unmount()
    assert.equal(listeners.size, 0)
    delete globalThis.window
  }
})
