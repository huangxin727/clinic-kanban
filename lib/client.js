// API 请求封装

// 使用 sessionStorage 替代 localStorage，实现多标签页独立登录
// sessionStorage 按标签页隔离，不同标签页可以用不同账号登录

function getToken() {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('kanban_token')
}

function setToken(token) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem('kanban_token', token)
}

function clearToken() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem('kanban_token')
  sessionStorage.removeItem('kanban_user')
}

function getLocalUser() {
  if (typeof window === 'undefined') return null
  const data = sessionStorage.getItem('kanban_user')
  return data ? JSON.parse(data) : null
}

function setLocalUser(user) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem('kanban_user', JSON.stringify(user))
}

// API 请求封装
// 401 防抖：避免并发请求中某一个 401 导致清 token
let _401Cooldown = false
export async function api(path, options = {}) {
  const token = getToken()

  // GET 请求加时间戳防 CDN 缓存
  let url = `/api${path}`
  if (!options.method || options.method === 'GET') {
    const sep = url.includes('?') ? '&' : '?'
    url += `${sep}_t=${Date.now()}`
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  })

  if (path.startsWith('/export')) {
    return res // export 返回文件流
  }

  const json = await res.json()
  if (!res.ok) {
    // 401 自动跳转登录（带防抖，防止并发请求重复触发）
    if (res.status === 401 && !_401Cooldown) {
      _401Cooldown = true
      clearToken()
      window.location.href = '/login'
      throw new Error('登录已过期')
    }
    throw new Error(json.error || '请求失败')
  }
  return json
}

// 日期工具
export function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// 登录
export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, mode: 'login' }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || '登录失败')
  setToken(json.token)
  setLocalUser(json.user)
  return json.user
}

// 注册
export async function register(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, mode: 'register' }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || '注册失败')
  setToken(json.token)
  setLocalUser(json.user)
  return json.user
}

// 登出
export function logout() {
  clearToken()
  window.location.href = '/login'
}

// 检查是否已登录
export function isLoggedIn() {
  return !!getToken()
}

// 获取当前用户
export function getCurrentUser() {
  return getLocalUser()
}
