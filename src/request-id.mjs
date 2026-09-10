let fallbackSequence = 0

/**
 * 为一次执行动作生成稳定的 UUID 请求标识。
 *
 * 局域网通过 HTTP 访问时不属于安全上下文，部分浏览器不会暴露
 * crypto.randomUUID；此时使用仍可用的 getRandomValues 生成 UUID v4。
 * 最后的非加密随机分支只用于极旧浏览器，请求标识仅承担防重复提交而非密钥用途。
 */
export function createRequestId(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID === 'function') return cryptoProvider.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof cryptoProvider?.getRandomValues === 'function') {
    cryptoProvider.getRandomValues(bytes)
  } else {
    fallbackSequence = (fallbackSequence + 1) & 0xffff
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
    bytes[0] ^= Date.now() & 0xff
    bytes[1] ^= fallbackSequence & 0xff
    bytes[2] ^= fallbackSequence >>> 8
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
