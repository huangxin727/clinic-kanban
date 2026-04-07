import { getCurrentUser } from './auth'
import { findBy, KEYS, runWithCache } from './db'

// 验证用户身份，返回 member 信息
export async function getUserMember(req) {
  const user = await getCurrentUser(req)
  if (!user) return null

  const member = await findBy(KEYS.MEMBERS, 'user_id', user.id)
  return member || null
}

// 验证用户身份，返回 user 信息
export async function getUser(req) {
  return getCurrentUser(req)
}

// 通用 API 响应辅助
export function ok(data) {
  return { success: true, data }
}

export function err(msg, status = 400) {
  return { success: false, error: msg }
}

// 包裹 API handler，启用请求级 Redis 缓存
export function cachedHandler(handler) {
  return async (req, res) => {
    return runWithCache(() => handler(req, res))
  }
}
