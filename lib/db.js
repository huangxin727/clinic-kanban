// Upstash Redis 存储层
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
})

// ===== 通用 KV 操作 =====

// 获取一个集合的所有项目（列表存储）
export async function getAll(key) {
  const items = await redis.lrange(key, 0, -1)
  return items.map(item => typeof item === 'string' ? JSON.parse(item) : (item && typeof item === 'object' ? item : JSON.parse(JSON.stringify(item))))
}

// 添加一个项目到集合
export async function addToList(key, item) {
  const str = JSON.stringify(item)
  await redis.rpush(key, str)
  return item
}

// 获取集合长度
export async function listLen(key) {
  return redis.llen(key)
}

// 根据条件在列表中查找
export async function findBy(key, field, value) {
  const items = await getAll(key)
  return items.find(item => item[field] === value) || null
}

// 根据条件查找多个
export async function filterBy(key, field, value) {
  const items = await getAll(key)
  return items.filter(item => item[field] === value)
}

// 根据 id 查找
export async function findById(key, id) {
  return findBy(key, 'id', id)
}

// 更新列表中的某个项目
export async function updateById(key, id, updates) {
  const items = await getAll(key)
  const index = items.findIndex(item => item.id === id)
  if (index === -1) return null
  items[index] = { ...items[index], ...updates, updated_at: new Date().toISOString() }
  // 重新写入整个列表
  await redis.del(key)
  if (items.length > 0) {
    await redis.rpush(key, ...items.map(i => JSON.stringify(i)))
  }
  return items[index]
}

// 从列表中删除某个项目
export async function removeById(key, id) {
  const items = await getAll(key)
  const filtered = items.filter(item => item.id !== id)
  if (filtered.length === items.length) return false
  await redis.del(key)
  if (filtered.length > 0) {
    await redis.rpush(key, ...filtered.map(i => JSON.stringify(i)))
  }
  return true
}

// ===== 数据表 Key 常量 =====
export const KEYS = {
  USERS: 'kanban:users',
  MEMBERS: 'kanban:members',
  TICKETS: 'kanban:tickets',
  LOGS: 'kanban:logs',
}

// ===== ID 生成 =====
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
