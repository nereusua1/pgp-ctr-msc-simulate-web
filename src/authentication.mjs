/** 认证成功响应必须提供可展示的用户名，避免不完整响应被误判为已登录。 */
export const getAuthenticatedUsername = user => {
  const username = user?.username
  return typeof username === 'string' && username.trim() ? username.trim() : null
}

export const isAuthenticatedUser = user => getAuthenticatedUsername(user) !== null

/** 只接受后端约定的角色；缺失或未知角色按最小权限 OPERATOR 处理。 */
export const getAuthenticatedRole = user => String(user?.role || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'OPERATOR'

/** 权限由后端固定角色映射返回；兼容 ADMIN 会话时仍按管理员完整权限处理。 */
export const hasPermission = (user, permission) => {
  if (!isAuthenticatedUser(user)) return false
  const permissions = Array.isArray(user?.permissions) ? user.permissions.map(item => String(item).toUpperCase()) : []
  return permissions.includes(permission) || getAuthenticatedRole(user) === 'ADMIN'
}

/** 配置新增、修改、发布、启停和删除仅对管理员开放。 */
export const canManageConfiguration = user => hasPermission(user, 'CONFIG_WRITE')
