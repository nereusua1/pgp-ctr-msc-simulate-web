import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const view = await readFile(new URL('../src/views/TaskManagementView.vue', import.meta.url), 'utf8')

test('Cron 编辑器允许直接配置包含列表值的六段表达式', () => {
  assert.match(view, /v-model\.trim="form\.schedule"/)
  assert.match(view, /@blur="applyCronExpression"/)
  assert.match(view, /8,20/)
  assert.match(view, /customCronOption/)
})
