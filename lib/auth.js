import { SignJWT, jwtVerify } from 'jose'
import { findBy, KEYS, addToList } from './db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'clinic-kanban-secret-key-2026'
)

// 生成 JWT token
export async function createToken(user) {
  return new SignJWT({ userId: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
}

// 验证 JWT token
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload
  } catch {
    return null
  }
}

// 从请求中获取当前用户
export async function getCurrentUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  const user = await findBy(KEYS.USERS, 'id', payload.userId)
  return user || null
}

// 简单密码哈希（生产环境应该用 bcrypt，这里用简易方案）
export async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + (process.env.JWT_SECRET || 'clinic-kanban-secret-key-2026'))
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(password, hash) {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
}

// 注册用户
export async function registerUser(email, password) {
  const existing = await findBy(KEYS.USERS, 'email', email.toLowerCase())
  if (existing) {
    throw new Error('该邮箱已注册')
  }
  const hashedPassword = await hashPassword(password)
  const user = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    email: email.toLowerCase(),
    password: hashedPassword,
    created_at: new Date().toISOString(),
  }
  await addToList(KEYS.USERS, user)
  return user
}

// 登录用户
export async function loginUser(email, password) {
  const user = await findBy(KEYS.USERS, 'email', email.toLowerCase())
  if (!user) {
    throw new Error('邮箱或密码错误')
  }
  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    throw new Error('邮箱或密码错误')
  }
  return user
}
