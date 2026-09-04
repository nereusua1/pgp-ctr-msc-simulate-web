/** 认证成功响应必须提供可展示的用户名，避免不完整响应被误判为已登录。 */
export const getAuthenticatedUsername = user => {
  const username = user?.username
  return typeof username === 'string' && username.trim() ? username.trim() : null
}

export const isAuthenticatedUser = user => getAuthenticatedUsername(user) !== null
