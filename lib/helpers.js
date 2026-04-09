import { getCurrentUser } from './auth'
import { findBy, updateById, getAll, KEYS } from './db'

// 验证用户身份，返回 member 信息（兼容旧数据，带 email 兜底）
export async function getUserMember(req) {
  const user = await getCurrentUser(req)
  if (!user) return null

  // 1. 按 user_id 查找（新流程）
  let member = await findBy(KEYS.MEMBERS, 'user_id', user.id)

  // 2. 按 email 查找（旧数据兼容）
  if (!member && user.email) {
    const allMembers = await getAll(KEYS.MEMBERS)
    member = allMembers.find(m => m.email?.toLowerCase() === user.email.toLowerCase())
  }

  // 3. 管理员邮箱兜底
  if (!member && user.email) {
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL
    if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase()) {
      const allMembers = await getAll(KEYS.MEMBERS)
      member = allMembers.find(m => m.is_admin && !m.user_id)
    }
  }

  // 自动补关联
  if (member && !member.user_id) {
    const updates = { user_id: user.id }
    if (!member.email && user.email) updates.email = user.email.toLowerCase()
    await updateById(KEYS.MEMBERS, member.id, updates)
  }

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
