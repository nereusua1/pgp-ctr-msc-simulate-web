import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSuccessfulResponse } from '../src/api-response.mjs'

/** 验证 Spring Controller 返回 200 空响应时，前端将其视为成功且不强制解析 JSON。 */
test('删除接口返回 200 空响应时应解析为 null', async () => {
  const response = new Response(null, { status: 200 })
  assert.equal(await parseSuccessfulResponse(response), null)
})

/** 验证普通成功接口的 JSON 响应仍按原有结构解析。 */
test('包含 JSON 的成功响应应正常解析', async () => {
  const response = new Response(JSON.stringify({ id: 'message-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  assert.deepEqual(await parseSuccessfulResponse(response), { id: 'message-1' })
})
