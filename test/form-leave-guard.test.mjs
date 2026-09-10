import test from 'node:test'
import assert from 'node:assert/strict'
import {createRenderer, h, ref} from 'vue'
import {useFormLeaveGuard} from '../src/form-leave-guard.mjs'

test('未保存表单可拒绝关闭、阻止刷新，关闭后清除状态并重新建立基线', () => {
  const listeners = new Map()
  let answer = false
  let prompts = 0
  globalThis.window = {
    confirm() { prompts++; return answer },
    addEventListener(name, fn) { listeners.set(name, fn) },
    removeEventListener(name) { listeners.delete(name) }
  }
  const renderer = createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null
  })
  const open = ref(false)
  const input = ref('原值')
  const changes = []
  let guard
  const app = renderer.createApp({setup() {
    guard = useFormLeaveGuard(() => open.value, () => input.value, value => changes.push(value))
    return () => h('div')
  }})
  try {
    app.mount({})
    open.value = true
    assert.equal(guard.confirmClose(), true)
    assert.equal(prompts, 0)
    input.value = '新值'
    assert.equal(guard.dirty.value, true)
    assert.equal(guard.confirmClose(), false)
    assert.equal(input.value, '新值')
    let prevented = false
    const event = {preventDefault() { prevented = true }}
    listeners.get('beforeunload')(event)
    assert.equal(prevented, true)
    assert.equal(event.returnValue, '')
    answer = true
    assert.equal(guard.confirmClose(), true)
    open.value = false
    assert.equal(changes.at(-1), false)
    input.value = '另一份配置'
    open.value = true
    assert.equal(guard.dirty.value, false)
  } finally {
    app.unmount()
    assert.equal(listeners.size, 0)
    delete globalThis.window
  }
})
