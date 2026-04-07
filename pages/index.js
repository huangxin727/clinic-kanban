import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { api, getToday, isLoggedIn, getCurrentUser, logout } from '@/lib/client'

const TYPE_MAP = {
  init: { label: '数据初始化', cls: 'tag-init' },
  training: { label: '培训', cls: 'tag-training' },
  insurance: { label: '医保对接', cls: 'tag-insurance' },
  followup: { label: '跟进', cls: 'tag-followup' },
  other: { label: '其他', cls: 'tag-other' },
}
const STATUS_MAP = {
  pending: { label: '待处理', cls: 'tag-pending' },
  inprogress: { label: '进行中', cls: 'tag-inprogress' },
  done: { label: '已完成', cls: 'tag-done' },
  urgent: { label: '需跟进', cls: 'tag-urgent' },
}

// 默认值（后端未返回时使用）
const DEFAULT_TYPE_MAP = {
  init: { label: '数据初始化', cls: 'tag-init' },
  training: { label: '培训', cls: 'tag-training' },
  insurance: { label: '医保对接', cls: 'tag-insurance' },
  followup: { label: '跟进', cls: 'tag-followup' },
  other: { label: '其他', cls: 'tag-other' },
}
const DEFAULT_SERVICES = ['数据初始化', '医保对接', '系统培训', '上线验收']
const DEFAULT_TYPE_SERVICE_MAP = {
  init: '数据初始化',
  training: '系统培训',
  insurance: '医保对接',
  followup: '上线验收',
}

// 根据 settings 动态生成配置
function buildConfig(settings) {
  const types = settings?.types || []
  const services = settings?.services || DEFAULT_SERVICES

  const typeMap = {}
  const typeServiceMap = {}
  types.forEach(t => {
    typeMap[t.id] = { label: t.label, cls: t.cls || 'tag-other' }
    if (t.service) typeServiceMap[t.id] = t.service
  })

  return { typeMap, services, typeServiceMap }
}

// 根据工单类型和服务进度判断是否应自动完成
function shouldAutoDone(type, services, typeServiceMap) {
  const target = typeServiceMap[type]
  if (!target) return false
  return Array.isArray(services) && services.includes(target)
}

// 设置面板组件
function SettingsModal({ settings, onClose, onSave }) {
  const [types, setTypes] = useState(settings?.types || [])
  const [services, setServices] = useState(settings?.services || [])
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeService, setNewTypeService] = useState('')
  const [newServiceName, setNewServiceName] = useState('')

  const clsOptions = ['tag-init', 'tag-training', 'tag-insurance', 'tag-followup', 'tag-other']

  const addType = () => {
    if (!newTypeName.trim()) return alert('请填写类型名称')
    const id = newTypeName.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '_').slice(0, 20) + '_' + Date.now().toString(36)
    setTypes(prev => [...prev, { id, label: newTypeName.trim(), service: newTypeService, cls: 'tag-other' }])
    setNewTypeName('')
    setNewTypeService('')
  }

  const removeType = (id) => {
    setTypes(prev => prev.filter(t => t.id !== id))
  }

  const updateType = (id, field, value) => {
    setTypes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const addService = () => {
    if (!newServiceName.trim()) return alert('请填写服务进度名称')
    if (services.includes(newServiceName.trim())) return alert('该服务进度已存在')
    setServices(prev => [...prev, newServiceName.trim()])
    setNewServiceName('')
  }

  const removeService = (name) => {
    setServices(prev => prev.filter(s => s !== name))
  }

  return (
    <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>⚙ 系统设置</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {/* 工单类型 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>工单类型</div>
            {types.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 10px', background: '#f9fafb', borderRadius: 8 }}>
                <input
                  value={t.label}
                  onChange={e => updateType(t.id, 'label', e.target.value)}
                  style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                  placeholder="类型名称"
                />
                <select
                  value={t.cls || 'tag-other'}
                  onChange={e => updateType(t.id, 'cls', e.target.value)}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
                >
                  {clsOptions.map(c => <option key={c} value={c}>{c.replace('tag-', '')}</option>)}
                </select>
                <select
                  value={t.service || ''}
                  onChange={e => updateType(t.id, 'service', e.target.value)}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 12, minWidth: 100 }}
                >
                  <option value="">无对应进度</option>
                  {services.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  onClick={() => removeType(t.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
                >×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                placeholder="新类型名称"
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
                onKeyDown={e => e.key === 'Enter' && addType()}
              />
              <select
                value={newTypeService}
                onChange={e => setNewTypeService(e.target.value)}
                style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}
              >
                <option value="">无对应进度</option>
                {services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 13 }} onClick={addType}>添加</button>
            </div>
          </div>

          {/* 服务进度 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>服务进度</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {services.map(s => (
                <span key={s} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: 12, fontSize: 13
                }}>
                  {s}
                  <button
                    onClick={() => removeService(s)}
                    style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 14, fontWeight: 700, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
              {!services.length && <span style={{ color: '#9ca3af', fontSize: 13 }}>暂无服务进度</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newServiceName}
                onChange={e => setNewServiceName(e.target.value)}
                placeholder="新服务进度名称"
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}
                onKeyDown={e => e.key === 'Enter' && addService()}
              />
              <button className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 13 }} onClick={addService}>添加</button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={() => onSave({ types, services })}>保存</button>
        </div>
      </div>
    </div>
  )
}

export default function Kanban() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [members, setMembers] = useState([])
  const [tickets, setTickets] = useState([])
  const [stats, setStats] = useState({ total: 0, inprogress: 0, done: 0, urgent: 0 })
  const [memberStats, setMemberStats] = useState([])
  const [selectedMember, setSelectedMember] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clock, setClock] = useState('')

  // 显示modal
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [drawerTicket, setDrawerTicket] = useState(null)
  const [editMode, setEditMode] = useState(false)

  // 完成服务进度弹窗
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeInfo, setCompleteInfo] = useState({ ticketId: null, serviceName: null })
  const [clinicCodeInput, setClinicCodeInput] = useState('')

  // 表单
  const [form, setForm] = useState({})
  const [services, setServices] = useState([])
  const [logInput, setLogInput] = useState('')

  // 成员表单
  const [memberForm, setMemberForm] = useState({ name: '', role: '全能', status: 'free' })

  // 动态配置（类型 + 服务进度）
  const [settings, setSettings] = useState(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  // 从 settings 计算出运行时配置
  const { typeMap: TYPE_MAP, services: ALL_SERVICES, typeServiceMap: TYPE_SERVICE_MAP } = buildConfig(settings)

  // 检查登录
  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login'
      return
    }
    setUser(getCurrentUser())
    loadProfile(getCurrentUser())
  }, [])

  // 时钟
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setClock(now.toLocaleTimeString('zh-CN', { hour12: false }))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 加载 profile
  const loadProfile = async (user) => {
    try {
      const json = await api('/auth/profile')
      if (json.data) {
        setProfile(json.data)
      } else {
        // 首次登录，需要创建 profile
      }
    } catch {
      // profile 不存在
    }
    setLoading(false)
  }

  // 创建 profile（首次登录）
  const handleCreateProfile = async () => {
    if (!form.name?.trim()) return alert('请填写姓名')
    try {
      const json = await api('/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), role: form.role || '全能' })
      })
      setProfile(json.data)
      setForm({})
      refreshAll()
    } catch (err) {
      alert(err.message)
    }
  }

  // 刷新所有数据
  const refreshAll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [tRes, mRes, sRes, stRes] = await Promise.all([
        api('/tickets'),
        api('/members'),
        api(`/stats?date=${getToday()}`),
        api('/settings')
      ])
      setTickets(tRes.data || [])
      setMembers(mRes.data || [])
      setStats({ total: sRes.data.total, inprogress: sRes.data.inprogress, done: sRes.data.done, urgent: sRes.data.urgent })
      setMemberStats(sRes.data.memberStats || [])
      if (stRes.data) setSettings(stRes.data)
    } catch (err) {
      console.error('刷新失败:', err)
    }
    if (showRefresh) setRefreshing(false)
  }, [])

  useEffect(() => {
    if (profile) refreshAll()
  }, [profile, refreshAll])

  // 过滤工单
  const filteredTickets = tickets.filter(t => {
    if (selectedMember && t.member_id !== selectedMember) return false
    if (filterType && t.type !== filterType) return false
    if (filterStatus && t.status !== filterStatus) return false
    if (search) {
      const s = search.toLowerCase()
      return (t.client || '').toLowerCase().includes(s) || (t.ticket_no || '').toLowerCase().includes(s)
    }
    return true
  })

  // ===== 工单操作 =====
  const openNewTicket = () => {
    setEditMode(false)
    setForm({ type: 'init', status: 'inprogress', note: '' })
    setServices([])
    setShowTicketModal(true)
  }

  const openEditTicket = (t) => {
    setEditMode(true)
    // 只提取表单需要的字段，避免把 member/logs 等关联对象传给后端
    const { member, logs, ...formData } = t
    setForm(formData)
    setServices(t.services || [])
    setShowTicketModal(true)
  }

  const saveTicket = async () => {
    if (!form.client?.trim()) return alert('请填写客户名称')
    try {
      // 根据工单类型判断对应服务进度是否完成，自动标记状态
      const autoDone = shouldAutoDone(form.type, services, TYPE_SERVICE_MAP)
      const payload = { ...form, services, status: autoDone ? 'done' : (form.status || 'inprogress') }
      if (editMode) {
        await api(`/tickets/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
      } else {
        await api('/tickets', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
      }
      setShowTicketModal(false)
      setForm({})
      refreshAll()
    } catch (err) {
      alert('保存失败: ' + err.message)
    }
  }

  const deleteTicket = async (id) => {
    if (!confirm('确认删除此工单？')) return
    try {
      await api(`/tickets/${id}`, { method: 'DELETE' })
      refreshAll()
    } catch (err) {
      alert(err.message)
    }
  }

  // ===== 完成服务进度 =====
  const openCompleteModal = (ticketId, serviceName) => {
    setCompleteInfo({ ticketId, serviceName })
    setClinicCodeInput('')
    setShowCompleteModal(true)
  }

  const confirmCompleteService = async () => {
    if (!clinicCodeInput.trim()) return alert('请填写诊所编码')
    const { ticketId, serviceName } = completeInfo
    if (!ticketId) return

    try {
      // 获取当前工单数据
      const json = await api(`/tickets/${ticketId}`)
      const ticket = json.data
      const currentServices = ticket.services || []

      // 如果已经完成，不再重复
      if (currentServices.includes(serviceName)) {
        alert('该服务进度已完成')
        setShowCompleteModal(false)
        return
      }

      const newServices = [...currentServices, serviceName]
      const autoDone = shouldAutoDone(ticket.type, newServices, TYPE_SERVICE_MAP)
      const newStatus = autoDone ? 'done' : ticket.status

      await api(`/tickets/${ticketId}`, {
        method: 'PUT',
        body: JSON.stringify({
          services: newServices,
          status: newStatus,
          clinic_code: clinicCodeInput.trim(),
        })
      })

      setShowCompleteModal(false)
      refreshAll()
      // 如果抽屉打开的是同一个工单，刷新抽屉
      if (drawerTicket && drawerTicket.id === ticketId) {
        openDrawer(ticketId)
      }
    } catch (err) {
      alert('操作失败: ' + err.message)
    }
  }

  // ===== 详情抽屉 =====
  const openDrawer = async (id) => {
    try {
      const json = await api(`/tickets/${id}`)
      setDrawerTicket(json.data)
      setShowDrawer(true)
      setLogInput('')
    } catch (err) {
      alert(err.message)
    }
  }

  const addLog = async () => {
    if (!logInput.trim() || !drawerTicket) return
    try {
      await api(`/tickets/${drawerTicket.id}/logs`, {
        method: 'POST',
        body: JSON.stringify({ content: logInput.trim() })
      })
      // 同时更新工单的 note
      await api(`/tickets/${drawerTicket.id}`, {
        method: 'PUT',
        body: JSON.stringify({ note: logInput.trim() })
      })
      setLogInput('')
      openDrawer(drawerTicket.id) // 刷新
      refreshAll()
    } catch (err) {
      alert(err.message)
    }
  }

  // ===== 组员操作 =====
  const saveMember = async () => {
    if (!memberForm.name?.trim()) return alert('请填写姓名')
    try {
      await api('/members', {
        method: 'POST',
        body: JSON.stringify(memberForm)
      })
      setShowMemberModal(false)
      setMemberForm({ name: '', role: '全能', status: 'free' })
      refreshAll()
    } catch (err) {
      alert(err.message)
    }
  }

  const toggleMemberStatus = async (m) => {
    // 空闲 → 忙碌 → 离线 → 空闲
    const order = ['free', 'busy', 'offline']
    const idx = order.indexOf(m.status || 'free')
    const next = order[(idx + 1) % order.length]
    try {
      await api(`/members/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: next })
      })
      refreshAll()
    } catch (err) {
      alert(err.message)
    }
  }

  const removeMember = async (m) => {
    if (!confirm(`确认移除组员「${m.name}」？`)) return
    try {
      await api(`/members/${m.id}`, { method: 'DELETE' })
      refreshAll()
    } catch (err) {
      alert(err.message)
    }
  }

  // ===== 导出 =====
  const exportCSV = async () => {
    const res = await api(`/export?date=${getToday()}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `工单日报_${getToday()}.csv`
    a.click()
  }

  // ===== 登出 =====
  const handleLogout = () => {
    logout()
  }

  // ===== 渲染 =====
  if (!user) return <div style={{ textAlign: 'center', padding: 100 }}>加载中...</div>

  // 首次登录：创建 profile
  if (!profile) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h2>👋 欢迎首次登录</h2>
          <p style={{ marginBottom: 24 }}>请完善您的个人信息以开始使用</p>
          <div className="form-row">
            <label>姓名 <span style={{ color: 'red' }}>*</span></label>
            <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="请输入您的姓名" />
          </div>
          <div className="form-row">
            <label>主职方向</label>
            <select value={form.role || '全能'} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="全能">全能</option>
              <option value="数据导入">数据导入</option>
              <option value="培训">培训</option>
              <option value="医保对接">医保对接</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, padding: 10 }} onClick={handleCreateProfile}>进入看板</button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <a href="#" onClick={handleLogout} style={{ fontSize: 13, color: 'var(--text-muted)' }}>退出登录</a>
          </div>
        </div>
      </div>
    )
  }

  const isAdmin = profile.is_admin
  const todayStr = getToday()
  const todayDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })

  return (
    <>
      <Head><title>工单看板</title></Head>

      {/* 顶栏 */}
      <div className="topbar">
        <h1>🏥 实施工单看板</h1>
        <div className="right">
          <span>{clock}</span>
          <span>{todayDate}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {profile.name} {isAdmin && <span className="admin-badge" style={{ background: 'rgba(255,255,255,.2)', color: '#fbbf24', fontWeight: 600 }}>组长</span>}
          </span>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={exportCSV}>📥 导出日报</button>
          <button className="btn btn-sm" style={{ background: refreshing ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.15)', color: '#fff' }} onClick={() => refreshAll(true)} disabled={refreshing}>
            {refreshing ? '⏳' : '🔄'} 刷新
          </button>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={handleLogout}>退出</button>
        </div>
      </div>

      <div className="container">
        {/* 统计 */}
        <div className="stats-row">
          <div className="stat-card blue">
            <div className="label">今日工单</div>
            <div className="value">{stats.total}</div>
          </div>
          <div className="stat-card orange">
            <div className="label">进行中</div>
            <div className="value">{stats.inprogress}</div>
          </div>
          <div className="stat-card green">
            <div className="label">已完成</div>
            <div className="value">{stats.done}</div>
          </div>
          <div className="stat-card red">
            <div className="label">需跟进</div>
            <div className="value">{stats.urgent}</div>
          </div>
        </div>

        <div className="main-grid">
          {/* 侧边栏 */}
          <div>
            <div className="sidebar">
              <div className="sidebar-header">👥 组员列表</div>
              <div className="member-list">
                {members.map(m => {
                  const count = (memberStats.find(ms => ms.id === m.id)?.tickets || []).length
                  const statusConfig = {
                    free: { label: '空闲', bg: '#dcfce7', color: '#16a34a' },
                    busy: { label: '忙碌', bg: '#fef3c7', color: '#d97706' },
                    offline: { label: '离线', bg: '#f3f4f6', color: '#9ca3af' },
                  }
                  const sc = statusConfig[m.status] || statusConfig.free
                  return (
                    <div key={m.id} className={`member-item ${selectedMember === m.id ? 'active' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}
                        onClick={() => setSelectedMember(selectedMember === m.id ? '' : m.id)}>
                        <div className="avatar" style={{ background: m.color }}>{m.name[0]}</div>
                        <div className="member-info" style={{ minWidth: 0 }}>
                          <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.name} {m.is_admin && <span style={{ fontSize: 10, color: '#d97706' }}>★组长</span>}
                          </div>
                          <div className="count">{m.role} · {count}单</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {(isAdmin && !m.is_admin) || true ? (
                          <button
                            title="点击切换状态（空闲/忙碌/离线）"
                            style={{
                              background: sc.bg, color: sc.color, border: 'none', borderRadius: 10,
                              padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={(e) => { e.stopPropagation(); if (isAdmin && !m.is_admin) toggleMemberStatus(m) }}
                          >
                            {sc.label}
                          </button>
                        ) : (
                          <div className={`status-dot ${m.status === 'busy' ? 'dot-busy' : 'dot-free'}`} />
                        )}
                        {isAdmin && !m.is_admin && (
                          <button
                            title="删除组员"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 14, color: '#d1d5db', padding: 0, lineHeight: 1,
                            }}
                            onClick={(e) => { e.stopPropagation(); removeMember(m) }}
                            onMouseEnter={e => e.target.style.color = '#ef4444'}
                            onMouseLeave={e => e.target.style.color = '#d1d5db'}
                          >×</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {isAdmin && <button className="add-btn" onClick={() => setShowMemberModal(true)}>＋ 添加组员</button>}
              {isAdmin && <button className="add-btn" onClick={() => setShowSettingsModal(true)} style={{ background: '#f0f9ff', color: '#2563eb' }}>⚙ 设置</button>}
            </div>

            {/* 今日概览 */}
            <div className="today-section" style={{ marginTop: 16 }}>
              <h4>📊 今日概览</h4>
              <div className="member-timeline">
                {memberStats.map(m => (
                  <div key={m.id} className="mt-card">
                    <div className="mt-name">
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: m.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{m.name[0]}</span>
                      {m.name}
                    </div>
                    <div>
                      {m.tickets.length
                        ? m.tickets.map((t, i) => (
                          <span key={i} className="mt-tag" style={{ background: (TYPE_MAP[t.type] || {}).cls === 'tag-init' ? '#eff6ff' : (TYPE_MAP[t.type] || {}).cls === 'tag-insurance' ? '#fdf4ff' : '#f0fdf4', color: t.type === 'init' ? '#2563eb' : t.type === 'insurance' ? '#9333ea' : '#16a34a' }}>
                            {(TYPE_MAP[t.type] || {}).label || t.type}
                          </span>
                        ))
                        : <span style={{ color: '#9ca3af', fontSize: 12 }}>暂无工单</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 工单区 */}
          <div className="board">
            <div className="toolbar">
              <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)}>
                <option value="">全部组员</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">全部类型</option>
                {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">全部状态</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input placeholder="🔍 搜索客户/工单号..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 160 }} />
              <div className="spacer" />
              <button className="btn btn-primary" onClick={openNewTicket}>＋ 新建工单</button>
            </div>

            <div className="ticket-section">
              <div className="section-header">
                <span className="title">工单列表</span>
                <span className="badge">{filteredTickets.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>工单号</th>
                      <th>客户名称</th>
                      <th>类型</th>
                      <th>负责人</th>
                      <th>状态</th>
                      <th>服务进度</th>
                      <th>接单时间</th>
                      <th>备注</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map(t => {
                      const m = t.member || {}
                      const ti = TYPE_MAP[t.type] || { label: t.type, cls: 'tag-other' }
                      const si = STATUS_MAP[t.status] || { label: t.status, cls: 'tag-pending' }
                      const svc = t.services || []
                      const pct = Math.round(svc.length / 4 * 100)
                      const time = t.created_at ? new Date(t.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'
                      return (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600, color: '#4b5563' }}>{t.ticket_no || '-'}</td>
                          <td style={{ fontWeight: 600 }}>{t.client}</td>
                          <td><span className={`tag ${ti.cls}`}>{ti.label}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: m.color || '#6b7280', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{m.name ? m.name[0] : '?'}</div>
                              <span>{m.name || '未分配'}</span>
                            </div>
                          </td>
                          <td><span className={`tag ${si.cls}`}>{si.label}</span></td>
                          <td>
                            <div className="progress-steps">
                              {ALL_SERVICES.map((s, i) => {
                                const done = svc.includes(s)
                                return (
                                  <div
                                    key={s}
                                    title={`${done ? '已完成' : '未完成'}：${s}`}
                                    className={`progress-step ${done ? 'done' : ''}`}
                                    style={{ position: 'relative' }}
                                  >
                                    <span className="step-icon">{done ? '✓' : i + 1}</span>
                                    <span className="step-label">{s}</span>
                                    {!done && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openCompleteModal(t.id, s)
                                        }}
                                        style={{
                                          position: 'absolute', top: -4, right: -4,
                                          width: 18, height: 18, borderRadius: '50%',
                                          background: '#3b82f6', color: '#fff',
                                          border: 'none', cursor: 'pointer',
                                          fontSize: 11, lineHeight: '18px',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                        }}
                                        title={`完成「${s}」`}
                                      >+</button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{time}</td>
                          <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={t.note || ''}>{t.note || '-'}</td>
                          <td>
                            <div className="action-group">
                              <button className="btn btn-outline btn-sm" onClick={() => openDrawer(t.id)}>详情</button>
                              {(isAdmin || t.member_id === profile.id) && (
                                <button className="btn btn-outline btn-sm" onClick={() => openEditTicket(t)}>编辑</button>
                              )}
                              {isAdmin && (
                                <button className="btn btn-sm" style={{ background: '#f1f5f9', color: '#64748b', border: 'none' }} onClick={() => deleteTicket(t.id)}>删除</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {!filteredTickets.length && <div className="empty">暂无工单</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 新建/编辑工单 Modal */}
      {showTicketModal && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setShowTicketModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editMode ? '编辑工单' : '新建工单'}</h3>
              <button className="modal-close" onClick={() => setShowTicketModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-row">
                  <label>七鱼工单号</label>
                  <input value={form.ticket_no || ''} onChange={e => setForm({ ...form, ticket_no: e.target.value })} placeholder="如 QY20260407001" />
                </div>
                <div className="form-row">
                  <label>客户名称 *</label>
                  <input value={form.client || ''} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="诊所名称" />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-row">
                  <label>工单类型 *</label>
                  <select value={form.type || 'init'} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <label>负责人 *</label>
                  <select value={form.member_id || ''} onChange={e => setForm({ ...form, member_id: e.target.value })}>
                    <option value="">请选择</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-row">
                  <label>状态</label>
                  <select value={form.status || 'pending'} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <label>预计完成时间</label>
                  <input type="date" value={form.deadline || ''} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <label>诊所编码</label>
                <input value={form.clinic_code || ''} onChange={e => setForm({ ...form, clinic_code: e.target.value })} placeholder="完成服务进度时自动填写" readOnly style={{ background: '#f9fafb', color: '#6b7280' }} />
              </div>
              <div className="form-row">
                <label>备注 / 今日工作内容</label>
                <textarea value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="记录今天做了什么..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowTicketModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveTicket}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 添加组员 Modal */}
      {showMemberModal && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setShowMemberModal(false) }}>
          <div className="modal" style={{ width: 360 }}>
            <div className="modal-header">
              <h3>添加组员</h3>
              <button className="modal-close" onClick={() => setShowMemberModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <label>姓名 *</label>
                <input value={memberForm.name} onChange={e => setMemberForm({ ...memberForm, name: e.target.value })} placeholder="组员姓名" />
              </div>
              <div className="form-row">
                <label>主职方向</label>
                <select value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}>
                  <option value="全能">全能</option>
                  <option value="数据导入">数据导入</option>
                  <option value="培训">培训</option>
                  <option value="医保对接">医保对接</option>
                </select>
              </div>
              <div className="form-row">
                <label>当前状态</label>
                <select value={memberForm.status} onChange={e => setMemberForm({ ...memberForm, status: e.target.value })}>
                  <option value="free">空闲</option>
                  <option value="busy">忙碌</option>
                  <option value="offline">离线</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowMemberModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveMember}>添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 设置面板 */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettingsModal(false)}
          onSave={async (newSettings) => {
            try {
              await api('/settings', {
                method: 'PUT',
                body: JSON.stringify(newSettings)
              })
              setSettings(prev => ({ ...prev, ...newSettings }))
              setShowSettingsModal(false)
              refreshAll()
            } catch (err) {
              alert('保存失败: ' + err.message)
            }
          }}
        />
      )}

      {/* 完成服务进度弹窗 */}
      {showCompleteModal && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setShowCompleteModal(false) }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>✅ 完成服务进度</h3>
              <button className="modal-close" onClick={() => setShowCompleteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, fontSize: 14 }}>
                确认完成：<strong>{completeInfo.serviceName}</strong>
              </div>
              <div className="form-row">
                <label>诊所编码 <span style={{ color: 'red' }}>*</span></label>
                <input
                  value={clinicCodeInput}
                  onChange={e => setClinicCodeInput(e.target.value)}
                  placeholder="请输入诊所编码"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmCompleteService()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCompleteModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={confirmCompleteService}>确认完成</button>
            </div>
          </div>
        </div>
      )}

      {/* 工单详情抽屉 */}
      {showDrawer && drawerTicket && (
        <div className="drawer open">
          <div className="drawer-header">
            <h3>工单详情</h3>
            <button className="drawer-close" onClick={() => setShowDrawer(false)}>×</button>
          </div>
          <div className="drawer-body">
            <div className="detail-row"><span className="key">工单号</span><span className="val">{drawerTicket.ticket_no || '-'}</span></div>
            <div className="detail-row"><span className="key">客户</span><span className="val" style={{ fontSize: 15, fontWeight: 700 }}>{drawerTicket.client}</span></div>
            <div className="detail-row"><span className="key">类型</span><span className="val"><span className={`tag ${TYPE_MAP[drawerTicket.type]?.cls || 'tag-other'}`}>{TYPE_MAP[drawerTicket.type]?.label || drawerTicket.type}</span></span></div>
            <div className="detail-row"><span className="key">负责人</span><span className="val">{drawerTicket.member?.name || '未分配'}</span></div>
            <div className="detail-row"><span className="key">状态</span><span className="val"><span className={`tag ${STATUS_MAP[drawerTicket.status]?.cls || 'tag-pending'}`}>{STATUS_MAP[drawerTicket.status]?.label || drawerTicket.status}</span></span></div>
            <div className="detail-row"><span className="key">截止日期</span><span className="val">{drawerTicket.deadline || '未设置'}</span></div>
            <div className="detail-row"><span className="key">诊所编码</span><span className="val" style={{ fontFamily: 'monospace', fontSize: 14 }}>{drawerTicket.clinic_code || '未填写'}</span></div>
            <div className="detail-row"><span className="key">接单时间</span><span className="val">{drawerTicket.created_at ? new Date(drawerTicket.created_at).toLocaleString('zh-CN') : '-'}</span></div>

            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📋 服务进度</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {ALL_SERVICES.map(s => {
                const done = (drawerTicket.services || []).includes(s)
                return (
                  <div key={s} style={{ position: 'relative', display: 'inline-flex' }}>
                    <span
                      style={{
                        padding: '6px 14px',
                        borderRadius: 16,
                        border: done ? '1.5px solid #16a34a' : '1.5px solid #d1d5db',
                        background: done ? '#f0fdf4' : '#f9fafb',
                        color: done ? '#16a34a' : '#6b7280',
                        fontSize: 13,
                        fontWeight: done ? 600 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {done ? '✅' : '⬜'} {s}
                    </span>
                    {!done && (
                      <button
                        onClick={() => openCompleteModal(drawerTicket.id, s)}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#3b82f6', color: '#fff',
                          border: 'none', cursor: 'pointer',
                          fontSize: 13, lineHeight: '20px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                        title={`完成「${s}」`}
                      >+</button>
                    )}
                  </div>
                )
              })}
            </div>

            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📝 工作记录</div>
            <div className="timeline">
              {(drawerTicket.logs || []).length
                ? drawerTicket.logs.map((l, i) => (
                  <div key={i} className="timeline-item">
                    <div className="tl-dot">{i + 1}</div>
                    <div className="tl-content">
                      <div className="tl-time">{new Date(l.created_at).toLocaleString('zh-CN')}</div>
                      <div className="tl-note">{l.content}</div>
                    </div>
                  </div>
                ))
                : <div style={{ color: '#9ca3af', fontSize: 13 }}>暂无工作记录</div>
              }
            </div>

            <div className="log-input-area">
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>快速追加工作记录</div>
              <textarea rows={2} value={logInput} onChange={e => setLogInput(e.target.value)} placeholder="记录本次处理内容..." />
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={addLog}>记录</button>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              {(isAdmin || drawerTicket.member_id === profile.id) && (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setShowDrawer(false); openEditTicket(drawerTicket) }}>编辑工单</button>
              )}
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDrawer(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
