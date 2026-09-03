/**
 * 在一个异步操作完成前锁定相同业务键，避免按钮连点产生重复请求。
 * 锁在成功、失败和异常场景下都会释放；不同业务键仍允许并行执行。
 */
export async function runExclusive(pendingKeys, key, operation) {
  if (pendingKeys.has(key)) return { executed: false }
  pendingKeys.add(key)
  try {
    return { executed: true, value: await operation() }
  } finally {
    pendingKeys.delete(key)
  }
}
