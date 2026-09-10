import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { canManageConfiguration, getAuthenticatedRole, getAuthenticatedUsername, hasPermission, isAuthenticatedUser } from '../src/authentication.mjs'

test('only a non-empty username represents an authenticated user', () => {
  assert.equal(isAuthenticatedUser({ username: 'admin' }), true)
  assert.equal(isAuthenticatedUser({ username: null }), false)
  assert.equal(isAuthenticatedUser(null), false)
  assert.equal(getAuthenticatedUsername({username: ' admin '}), 'admin')
})

test('admin can manage configuration while operator is execution-only', () => {
  assert.equal(getAuthenticatedRole({username: 'admin', role: 'ADMIN'}), 'ADMIN')
  assert.equal(canManageConfiguration({username: 'admin', role: 'ADMIN'}), true)
  const operator = {username: 'operator', role: 'OPERATOR', permissions: ['CONFIG_READ', 'MESSAGE_SEND']}
  assert.equal(canManageConfiguration(operator), false)
  assert.equal(hasPermission(operator, 'MESSAGE_SEND'), true)
  assert.equal(hasPermission(operator, 'CONNECTION_CHECK'), false)
  assert.equal(getAuthenticatedRole({username: 'legacy-user'}), 'OPERATOR')
})

test('configuration pages expose write actions only when canManage is true', async () => {
  const files = await Promise.all([
    readFile(new URL('../src/App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/TaskManagementView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/MessageManagementView.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/MessageComponentManagementView.vue', import.meta.url), 'utf8')
  ])
  assert.match(files[0], /canManage: canManage\.value/)
  assert.match(files[0], /canCheckConnection: canCheckConnection\.value/)
  for (const view of files.slice(1)) {
    assert.match(view, /canManage: \{type: Boolean|canManage: \{ type: Boolean/)
    assert.match(view, /v-if="canManage"/)
  }
})
