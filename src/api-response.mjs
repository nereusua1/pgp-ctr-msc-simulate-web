/**
 * 解析成功 HTTP 响应。
 *
 * <p>该函数独立于浏览器请求逻辑，便于覆盖删除接口等无响应体场景。</p>
 */
export const parseSuccessfulResponse = async response => {
  if (response.status === 204) return null
  const body = await response.text()
  if (!body.trim()) return null
  return JSON.parse(body)
}
