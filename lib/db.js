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

// 并行获取多个集合（已弃用，pipeline 在 Edge Runtime 不兼容，保留供参考）
export async function getAllBatch(keys) {
  const results = await Promise.all(keys.map(key => getAll(key)))
  return results
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

// 简易互斥锁（防止并发重写丢失数据）
const locks = new Map()

async function acquireLock(key) {
  const maxWait = 3000
  const interval = 50
  const start = Date.now()
  while (locks.has(key)) {
    if (Date.now() - start > maxWait) throw new Error('获取锁超时')
    await new Promise(r => setTimeout(r, interval))
  }
  locks.set(key, true)
}

function releaseLock(key) {
  locks.delete(key)
}

// 重写列表（del + 批量 rpush，兼容 Vercel，单次网络往返）
export async function rewriteList(key, items) {
  await redis.del(key)
  if (items.length === 0) return
  await redis.rpush(key, ...items.map(item => JSON.stringify(item)))
}

// 更新列表中的某个项目
export async function updateById(key, id, updates) {
  await acquireLock(key)
  try {
    const items = await getAll(key)
    const index = items.findIndex(item => item.id === id)
    if (index === -1) return null
    items[index] = { ...items[index], ...updates, updated_at: new Date().toISOString() }
    await rewriteList(key, items)
    return items[index]
  } finally {
    releaseLock(key)
  }
}

// 从列表中删除某个项目
export async function removeById(key, id) {
  await acquireLock(key)
  try {
    const items = await getAll(key)
    const filtered = items.filter(item => item.id !== id)
    if (filtered.length === items.length) return false
    await rewriteList(key, filtered)
    return true
  } finally {
    releaseLock(key)
  }
}

// ===== 数据表 Key 常量 =====
export const KEYS = {
  USERS: 'kanban:users',
  MEMBERS: 'kanban:members',
  TICKETS: 'kanban:tickets',
  LOGS: 'kanban:logs',
}

// ===== 变更检测（用于前端增量轮询） =====

// 写入当前时间戳到 Redis，标记数据已变更
export async function touchUpdate() {
  const ts = Date.now().toString()
  await redis.set('kanban:update_ts', ts)
  return ts
}

// 读取最新变更时间戳
export async function getUpdateTs() {
  return await redis.get('kanban:update_ts')
}

// ===== 接单分布式锁（先到先得） =====

// 尝试获取接单锁，先到先得
// 锁 key: lock:accept:{ticketId}，TTL 5 秒
export async function tryAcquireAcceptLock(ticketId, requesterId) {
  const lockKey = `lock:accept:${ticketId}`
  const lockValue = JSON.stringify({ memberId: requesterId, ts: Date.now() })

  // SET NX：仅当 key 不存在时设置，先到先得
  const ok = await redis.set(lockKey, lockValue, { nx: true, ex: 5 })
  return { winner: !!ok }
}

// 释放接单锁
export async function releaseAcceptLock(ticketId) {
  await redis.del(`lock:accept:${ticketId}`)
}

// ===== ID 生成 =====
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
