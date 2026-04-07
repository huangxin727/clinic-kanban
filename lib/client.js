// API 请求封装（不再依赖 Supabase）

// 获取本地存储的 token
function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('kanban_token')
}

// 设置 token
function setToken(token) {
  if (typeof window === 'undefined') return
  localStorage.setItem('kanban_token', token)
}

// 清除 token
function clearToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('kanban_token')
  localStorage.removeItem('kanban_user')
}

// 获取本地存储的用户信息
function getLocalUser() {
  if (typeof window === 'undefined') return null
  const data = localStorage.getItem('kanban_user')
  return data ? JSON.parse(data) : null
}

// 设置用户信息
function setLocalUser(user) {
  if (typeof window === 'undefined') return
  localStorage.setItem('kanban_user', JSON.stringify(user))
}

// API 请求封装
export async function api(path, options = {}) {
  const token = getToken()

  const res = await fetch(`/api${path}`, {
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
    // 401 自动跳转登录
    if (res.status === 401) {
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
