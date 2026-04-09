import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { api, getToday, isLoggedIn, getCurrentUser, logout } from '@/lib/client'

// 迁移旧版 localStorage token 到 sessionStorage（首次访问时）
if (typeof window !== 'undefined') {
  const oldToken = localStorage.getItem('kanban_token')
  const oldUser = localStorage.getItem('kanban_user')
  if (oldToken && !sessionStorage.getItem('kanban_token')) {
    sessionStorage.setItem('kanban_token', oldToken)
    if (oldUser) sessionStorage.setItem('kanban_user', oldUser)
  }
  // 清理 localStorage
  localStorage.removeItem('kanban_token')
  localStorage.removeItem('kanban_user')
}

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

// 根据工单类型和服务内容判断是否应自动完成
function shouldAutoDone(type, services, typeServiceMap) {
  const target = typeServiceMap[type]
  if (!target) return false
  return Array.isArray(services) && services.includes(target)
}

// SVG 图标组件
const Icon = ({ type, size = 16 }) => {
  const icons = {
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    detail: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    edit: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    delete: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
    flag: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  }
  return icons[type] || null
}

// 时间段工作表组件
function TimelineModal({ members, tickets, typeMap, statusMap, onClose }) {
  const today = getToday()

  // 筛选今日工单（ticket_date 匹配本地日期）
  const todayTickets = tickets.filter(t => t.ticket_date === today)

  // 按成员分组
  const groupedByMember = {}
  members.forEach(m => { groupedByMember[m.id] = [] })
  todayTickets.forEach(t => {
    if (t.member_id && groupedByMember[t.member_id]) {
      groupedByMember[t.member_id].push(t)
    }
  })

  // 每个成员按接单时间排序
  Object.keys(groupedByMember).forEach(mid => {
    groupedByMember[mid].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  })

  // 用本地时间判断工单所在小时
  const getHour = (dateStr) => {
    if (!dateStr) return -1
    return new Date(dateStr).getHours()
  }

  // 生成时间段（8:00 - 22:00）
  const currentHour = new Date().getHours()
  const hours = []
  for (let h = 8; h <= 22; h++) {
    hours.push(h)
  }
  const nowHour = currentHour

  return (
    <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: '96vw', width: '96vw', maxHeight: '95vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: 24 }}>📅 今日工作时间段表</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 16, color: '#6b7280', marginBottom: 16 }}>
            {today} · 显示每位成员今日各时段的工作安排
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 24 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 2, padding: '14px 24px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', minWidth: 160, fontWeight: 600, fontSize: 22 }}>成员</th>
                  {hours.map(h => (
                    <th key={h} style={{ padding: '12px 10px', borderBottom: '2px solid #e5e7eb', minWidth: 120, fontWeight: 600, fontSize: 18, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {h}:00-{h === 22 ? '23:59' : (h + 1) + ':00'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const mTickets = groupedByMember[m.id] || []
                  return (
                    <tr key={m.id}>
                      <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, padding: '14px 24px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontSize: 22 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ width: 16, height: 16, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                          {m.name}
                        </span>
                      </td>
                      {hours.map(h => {
                        const isCurrentHour = h === nowHour
                        // 当前时段：显示在这个时段开始或之前开始且未完成的工单
                        let hourTickets = []
                        if (isCurrentHour) {
                          hourTickets = mTickets.filter(t => {
                            const startH = getHour(t.created_at)
                            // 在当前时段开始，或在更早时段开始且仍未完成
                            return (startH === h) || (startH < h && t.status !== 'done')
                          })
                        }

                        return (
                          <td key={h} style={{
                            padding: 8,
                            borderBottom: '1px solid #f3f4f6',
                            textAlign: 'center',
                            verticalAlign: 'top',
                          }}>
                            {isCurrentHour && hourTickets.length > 0 ? hourTickets.map(t => (
                              <div key={t.id} style={{
                                padding: '8px 12px',
                                marginBottom: 4,
                                borderRadius: 8,
                                fontSize: 20,
                                lineHeight: 1.4,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                background: t.status === 'done' ? '#f0fdf4' : t.status === 'inprogress' ? '#eff6ff' : '#f9fafb',
                                color: t.status === 'done' ? '#16a34a' : t.status === 'inprogress' ? '#2563eb' : '#6b7280',
                                fontWeight: 500,
                              }} title={`${(typeMap[t.type] || {}).label || t.type} - ${t.client}`}>
                                {(typeMap[t.type] || {}).label || t.type}
                                {t.client && <div style={{ fontSize: 16, fontWeight: 400, marginTop: 3, opacity: 0.85 }}>{t.client}</div>}
                              </div>
                            )) : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
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
    if (!newServiceName.trim()) return alert('请填写服务内容名称')
    if (services.includes(newServiceName.trim())) return alert('该服务内容已存在')
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
            <div style={{ fontWeight: 600, marginBottom: 10 }}>工单类型</div>
            {types.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 10px', background: '#f9fafb', borderRadius: 8 }}>
                <input
                  value={t.label}
                  onChange={e => updateType(t.id, 'label', e.target.value)}
                  style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px' }}
                  placeholder="类型名称"
                />
                <select
                  value={t.cls || 'tag-other'}
                  onChange={e => updateType(t.id, 'cls', e.target.value)}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px' }}
                >
                  {clsOptions.map(c => <option key={c} value={c}>{c.replace('tag-', '')}</option>)}
                </select>
                <select
                  value={t.service || ''}
                  onChange={e => updateType(t.id, 'service', e.target.value)}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', minWidth: 100 }}
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
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}
                onKeyDown={e => e.key === 'Enter' && addType()}
              />
              <select
                value={newTypeService}
                onChange={e => setNewTypeService(e.target.value)}
                style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}
              >
                <option value="">无对应进度</option>
                {services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-outline" style={{ padding: '6px 14px' }} onClick={addType}>添加</button>
            </div>
          </div>

          {/* 服务内容 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>服务内容</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {services.map(s => (
                <span key={s} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: 12
                }}>
                  {s}
                  <button
                    onClick={() => removeService(s)}
                    style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
              {!services.length && <span style={{ color: '#9ca3af' }}>暂无服务内容</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newServiceName}
                onChange={e => setNewServiceName(e.target.value)}
                placeholder="新服务内容名称"
                style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}
                onKeyDown={e => e.key === 'Enter' && addService()}
              />
              <button className="btn btn-outline" style={{ padding: '6px 14px' }} onClick={addService}>添加</button>
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
  const [filterTimeField, setFilterTimeField] = useState('')
  const [filterTimeStart, setFilterTimeStart] = useState('')
  const [filterTimeEnd, setFilterTimeEnd] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clock, setClock] = useState('')

  // 显示modal
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [savingTicket, setSavingTicket] = useState(false)
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [drawerTicket, setDrawerTicket] = useState(null)
  const [editMode, setEditMode] = useState(false)

  // 完成服务内容弹窗
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeInfo, setCompleteInfo] = useState({ ticketId: null, serviceName: null })
  const [clinicCodeInput, setClinicCodeInput] = useState('')
  const [completingTicket, setCompletingTicket] = useState(false)

  // 需跟进弹窗
  const [showUrgentModal, setShowUrgentModal] = useState(false)
  const [urgentInfo, setUrgentInfo] = useState({ ticketId: null })
  const [urgentNote, setUrgentNote] = useState('')
  const [showCancelUrgentModal, setShowCancelUrgentModal] = useState(false)
  const [cancelUrgentId, setCancelUrgentId] = useState(null)

  // 时间表弹窗
  const [showTimelineModal, setShowTimelineModal] = useState(false)

  // 表单
  const [form, setForm] = useState({})
  const [services, setServices] = useState([])
  const [logInput, setLogInput] = useState('')

  // 成员表单
  const [memberForm, setMemberForm] = useState({ name: '', role: '全能', status: 'free', email: '', password: '' })

  // 动态配置（类型 + 服务内容）
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
    // profile 和数据并行加载
    loadProfile(getCurrentUser())
    refreshAll()
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

  // 刷新所有数据（单次请求聚合接口）
  const refreshAll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const res = await api(`/init?date=${getToday()}&tz=${-new Date().getTimezoneOffset()/60}`)
      const d = res.data || {}
      setTickets(d.tickets || [])
      setMembers(d.members || [])
      setStats(d.stats || { total: 0, inprogress: 0, done: 0, urgent: 0 })
      setMemberStats(d.memberStats || [])
      if (d.settings) setSettings(d.settings)
    } catch (err) {
      console.error('刷新失败:', err)
    }
    if (showRefresh) setRefreshing(false)
  }, [])

  // 自动轮询刷新（10秒）
  useEffect(() => {
    const timer = setInterval(() => refreshAll(), 10000)
    return () => clearInterval(timer)
  }, [refreshAll])

  // 过滤工单
  const filteredTickets = tickets.filter(t => {
    if (selectedMember && t.member_id !== selectedMember) return false
    if (filterType && t.type !== filterType) return false
    if (filterStatus && t.status !== filterStatus) return false
    if (filterTimeField && filterTimeStart) {
      const fieldMap = { created_at: t.created_at, completed_at: t.completed_at, deadline: t.deadline }
      const val = fieldMap[filterTimeField]
      if (!val) return false
      const start = new Date(filterTimeStart).getTime()
      const end = filterTimeEnd ? new Date(filterTimeEnd + 'T23:59:59').getTime() : start + 86400000
      const ts = new Date(val).getTime()
      if (ts < start || ts > end) return false
    }
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

  const saveTicket = () => {
    if (!form.client?.trim()) return alert('请填写客户名称')

    const autoDone = shouldAutoDone(form.type, services, TYPE_SERVICE_MAP)
    const payload = { ...form, services, ticket_date: getToday(), status: autoDone ? 'done' : (form.status || 'inprogress') }
    const now = new Date().toISOString()

    // 立即关闭弹窗
    setShowTicketModal(false)

    if (editMode) {
      // 编辑模式：乐观更新本地列表
      setTickets(prev => prev.map(t => {
        if (t.id === form.id) {
          return { ...t, ...payload, updated_at: now }
        }
        return t
      }))
      // 如果抽屉打开着同一个工单，同步更新
      setDrawerTicket(prev => prev && prev.id === form.id ? { ...prev, ...payload, updated_at: now } : prev)

      // 后台异步提交
      api(`/tickets/${form.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      }).then(() => refreshAll()).catch(err => {
        alert('保存失败: ' + err.message)
        refreshAll()
      })
    } else {
      // 新建模式：乐观插入本地列表顶部
      const tempId = 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      const currentMember = members.find(m => m.id === (payload.member_id || profile?.id))
      const newTicket = {
        ...payload,
        id: tempId,
        created_at: now,
        updated_at: now,
        member: currentMember ? { id: currentMember.id, name: currentMember.name, role: currentMember.role, color: currentMember.color } : null,
      }
      setTickets(prev => [newTicket, ...prev])

      // 后台异步提交
      api('/tickets', {
        method: 'POST',
        body: JSON.stringify(payload)
      }).then(() => refreshAll()).catch(err => {
        alert('保存失败: ' + err.message)
        refreshAll()
      })
    }

    setForm({})
    setEditMode(false)
    setServices([])
  }

  const deleteTicket = (id) => {
    if (!confirm('确认删除此工单？')) return
    // 如果删除的是当前抽屉里的工单，关闭抽屉
    if (drawerTicket && drawerTicket.id === id) {
      setShowDrawer(false)
      setDrawerTicket(null)
    }
    // 乐观更新：立即从本地移除
    setTickets(prev => prev.filter(t => t.id !== id))
    // 后台异步删除，失败回滚
    api(`/tickets/${id}`, { method: 'DELETE' }).then(() => refreshAll()).catch(err => {
      alert('删除失败: ' + err.message)
      refreshAll()
    })
  }

  // ===== 完成工单 =====
  const openCompleteModal = (ticketId) => {
    setCompleteInfo({ ticketId })
    setClinicCodeInput('')
    setShowCompleteModal(true)
  }

  const confirmCompleteTicket = () => {
    if (!clinicCodeInput.trim()) return alert('请填写诊所编码')
    if (completingTicket) return
    const { ticketId } = completeInfo
    if (!ticketId) return

    const needReopenDrawer = drawerTicket && drawerTicket.id === ticketId
    const now = new Date().toISOString()

    // 立即关闭弹窗 + 乐观更新本地状态
    setShowCompleteModal(false)
    setTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        return { ...t, status: 'done', clinic_code: clinicCodeInput.trim(), completed_at: now }
      }
      return t
    }))
    if (needReopenDrawer) {
      setDrawerTicket(prev => prev && prev.id === ticketId
        ? { ...prev, status: 'done', clinic_code: clinicCodeInput.trim(), completed_at: now }
        : prev
      )
    }

    // 后台异步提交，失败回滚并提示
    api(`/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'done', clinic_code: clinicCodeInput.trim() })
    }).then(() => {
      refreshAll()
    }).catch(err => {
      alert('完成操作失败: ' + err.message)
      // 回滚本地状态
      setTickets(prev => prev.map(t => {
        if (t.id === ticketId) {
          const { completed_at: _, ...rest } = t
          return { ...rest, status: t._prevStatus || 'inprogress', clinic_code: t._prevClinicCode || '' }
        }
        return t
      }))
      refreshAll()
    })
  }

  // 标为需跟进（打开弹窗填写备注）
  const openUrgentModal = (ticketId) => {
    setUrgentInfo({ ticketId })
    setUrgentNote('')
    setShowUrgentModal(true)
  }

  const confirmMarkUrgent = () => {
    const { ticketId } = urgentInfo
    if (!ticketId) return
    const needReopenDrawer = drawerTicket && drawerTicket.id === ticketId
    // 乐观更新本地状态
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'urgent', note: urgentNote.trim() } : t))
    if (needReopenDrawer) {
      setDrawerTicket(prev => prev && prev.id === ticketId ? { ...prev, status: 'urgent', note: urgentNote.trim() } : prev)
    }
    setShowUrgentModal(false)
    // 后台异步提交
    api(`/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'urgent', note: urgentNote.trim() })
    }).then(() => refreshAll()).catch(err => {
      alert('操作失败: ' + err.message)
      refreshAll()
    })
  }

  // 取消需跟进（弹窗确认后切回进行中）
  const openCancelUrgentModal = (ticketId) => {
    setCancelUrgentId(ticketId)
    setShowCancelUrgentModal(true)
  }

  const confirmCancelUrgent = () => {
    if (!cancelUrgentId) return
    const needReopenDrawer = drawerTicket && drawerTicket.id === cancelUrgentId
    setTickets(prev => prev.map(t => t.id === cancelUrgentId ? { ...t, status: 'inprogress' } : t))
    if (needReopenDrawer) {
      setDrawerTicket(prev => prev && prev.id === cancelUrgentId ? { ...prev, status: 'inprogress' } : prev)
    }
    setShowCancelUrgentModal(false)
    api(`/tickets/${cancelUrgentId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'inprogress' })
    }).then(() => refreshAll()).catch(err => {
      alert('操作失败: ' + err.message)
      refreshAll()
    })
  }

  // ===== 详情抽屉 =====
  const openDrawer = async (id) => {
    // 先用本地数据立即打开抽屉（秒开）
    const localTicket = tickets.find(t => t.id === id)
    if (localTicket) {
      setDrawerTicket(localTicket)
      setShowDrawer(true)
      setLogInput('')
    }
    // 后台静默刷新完整数据（含 logs）
    try {
      const json = await api(`/tickets/${id}`)
      setDrawerTicket(json.data)
    } catch (err) {
      // 静默失败，本地数据已经展示了
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
      // 先刷新列表，再刷新抽屉，避免竞态
      await refreshAll()
      openDrawer(drawerTicket.id)
    } catch (err) {
      alert(err.message)
    }
  }

  // ===== 组员操作 =====
  const saveMember = async () => {
    if (!memberForm.name?.trim()) return alert('请填写姓名')
    if (!memberForm.email?.trim()) return alert('请填写登录邮箱')
    if (!memberForm.password || memberForm.password.length < 6) return alert('密码至少6位')
    try {
      await api('/members', {
        method: 'POST',
        body: JSON.stringify(memberForm)
      })
      setShowMemberModal(false)
      setMemberForm({ name: '', role: '全能', status: 'free', email: '', password: '' })
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

  // 骨架屏
  if (loading) {
    const sk = { background: '#e5e7eb', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }
    return (
      <>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        <div className="topbar">
          <h1>🏥 实施工单看板</h1>
          <div className="right"><span>加载中...</span></div>
        </div>
        <div className="container">
          <div className="stats-row">
            {[1,2,3,4].map(i => <div key={i} className="stat-card blue" style={{ height: 72 }}><div style={{...sk, height: 20, width: '40%', margin: '16px 0 8px' }}/><div style={{...sk, height: 24, width: '30%', margin: '0 auto' }}/></div>)}
          </div>
          <div className="main-grid">
            <div>
              <div className="sidebar">
                <div className="sidebar-header">👥 组员列表</div>
                <div className="member-list">
                  {[1,2,3].map(i => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}><div style={{...sk, width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}/><div style={{ flex: 1 }}><div style={{...sk, height: 16, width: '60%', marginBottom: 6 }}/><div style={{...sk, height: 12, width: '40%' }}/></div></div>)}
                </div>
              </div>
            </div>
            <div className="board">
              <div className="toolbar">
                {[1,2,3,4].map(i => <div key={i} style={{...sk, height: 36, width: 100, borderRadius: 6 }}/>)}
                <div className="spacer" />
                <div style={{...sk, height: 36, width: 100 }}/>
              </div>
              <div className="ticket-section">
                <div className="section-header"><span className="title">工单列表</span><span className="badge">-</span></div>
                {[1,2,3,4,5].map(i => <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}><div style={{...sk, height: 14, width: 120 }}/><div style={{...sk, height: 14, width: 80 }}/><div style={{...sk, height: 14, flex: 1 }}/><div style={{...sk, height: 14, width: 60 }}/></div>)}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // 如果 profile 不存在，直接退出（需要组长先创建成员账号）
  if (!profile) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h2>⚠️ 账号未关联</h2>
          <p style={{ marginBottom: 24, color: 'var(--text-muted)' }}>请联系组长确认您的账号已正确创建</p>
          <a href="#" onClick={handleLogout} className="btn btn-outline">退出登录</a>
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
        {/* 统计 - 当前登录账号的今日工单 */}
        {(() => {
          const myStats = memberStats.find(ms => ms.id === profile?.id)
          const myTickets = myStats?.tickets || []
          return (
            <div className="stats-row">
              <div className="stat-card blue">
                <div className="label">我的今日工单</div>
                <div className="value">{myTickets.length}</div>
              </div>
              <div className="stat-card orange">
                <div className="label">进行中</div>
                <div className="value">{myTickets.filter(t => t.status === 'inprogress').length}</div>
              </div>
              <div className="stat-card green">
                <div className="label">已完成</div>
                <div className="value">{myTickets.filter(t => t.status === 'done').length}</div>
              </div>
              <div className="stat-card red">
                <div className="label">需跟进</div>
                <div className="value">{myTickets.filter(t => t.status === 'urgent').length}</div>
              </div>
            </div>
          )
        })()}

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
                            {m.name} {m.is_admin && <span style={{ fontSize: 'var(--font-xxs)', color: '#d97706' }}>★组长</span>}
                          </div>
                          <div className="count">{m.role} · {count}单</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isAdmin ? (
                          <button
                            title="点击切换状态（空闲/忙碌/离线）"
                            style={{
                              background: sc.bg, color: sc.color, border: 'none', borderRadius: 10,
                              padding: '2px 8px', fontWeight: 600, cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={(e) => { e.stopPropagation(); if (isAdmin) toggleMemberStatus(m) }}
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
                              color: '#d1d5db', padding: 0, lineHeight: 1,
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
                        : <span style={{ color: '#9ca3af' }}>暂无工单</span>
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
              <select value={filterTimeField} onChange={e => setFilterTimeField(e.target.value)} title="时间筛选">
                <option value="">时间筛选</option>
                <option value="created_at">创建时间</option>
                <option value="completed_at">完成时间</option>
                <option value="deadline">预约时间</option>
              </select>
              {filterTimeField && (
                <>
                  <input type="date" value={filterTimeStart} onChange={e => setFilterTimeStart(e.target.value)} title="开始日期" />
                  <span style={{ color: 'var(--text-muted)' }}>至</span>
                  <input type="date" value={filterTimeEnd} onChange={e => setFilterTimeEnd(e.target.value)} title="结束日期" />
                </>
              )}
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
              {(selectedMember || filterType || filterStatus || filterTimeField || filterTimeStart || search) && (
                <button className="btn btn-sm" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }} onClick={() => { setSelectedMember(''); setFilterType(''); setFilterStatus(''); setFilterTimeField(''); setFilterTimeStart(''); setFilterTimeEnd(''); setSearch('') }}>↺ 重置筛选</button>
              )}
              <div className="spacer" />
              <button className="btn btn-outline" onClick={() => setShowTimelineModal(true)} title="查看时间段工作表">📅 时间表</button>
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
                      <th>诊所编码</th>
                      <th>新建时间</th>
                      <th>完成时间</th>
                      <th>预约时间</th>
                      <th>备注</th>
                      <th>消耗时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map(t => {
                      const m = t.member || {}
                      const ti = TYPE_MAP[t.type] || { label: t.type, cls: 'tag-other' }
                      const si = STATUS_MAP[t.status] || { label: t.status, cls: 'tag-pending' }
                      const fmtDT = (iso) => { if (!iso) return '-' ; const d = new Date(iso); return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` }
                      const time = fmtDT(t.created_at)
                      const doneTime = fmtDT(t.completed_at)
                      const deadlineStr = t.deadline ? (() => { const d = new Date(t.deadline); return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` })() : '-'
                      // 计算消耗时间
                      const calcDuration = () => {
                        if (!t.created_at) return '-'
                        const start = new Date(t.created_at).getTime()
                        const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now()
                        const diffMs = end - start
                        if (diffMs < 0) return '-'
                        const minutes = Math.floor(diffMs / 60000)
                        const hours = Math.floor(minutes / 60)
                        const mins = minutes % 60
                        if (hours >= 24) {
                          const days = Math.floor(hours / 24)
                          const remainHours = hours % 24
                          return `${days}天${remainHours}时${mins}分`
                        }
                        if (hours > 0) return `${hours}时${mins}分`
                        return `${mins}分`
                      }
                      const duration = calcDuration()
                      return (
                        <tr key={t.id}>
                          <td>{t.ticket_no || '-'}</td>
                          <td title={t.client}>{t.client}</td>
                          <td><span className={`tag ${ti.cls}`}>{ti.label}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: m.color || '#6b7280', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{m.name ? m.name[0] : '?'}</div>
                              <span>{m.name || '未分配'}</span>
                            </div>
                          </td>
                          <td><span className={`tag ${si.cls}`}>{si.label}</span></td>
                          <td>{t.clinic_code || '-'}</td>
                          <td>{time}</td>
                          <td style={{ color: t.completed_at ? '#16a34a' : undefined }}>{doneTime}</td>
                          <td>{deadlineStr}</td>
                          <td style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }} title={t.note || ''}>{t.note || '-'}</td>
                          <td>
                            {t.status === 'done' && t.completed_at ? (
                              <span style={{ fontWeight: 500, color: '#6b7280', whiteSpace: 'nowrap' }}>{duration}</span>
                            ) : '-'}
                          </td>
                          <td>
                            <div className="action-group">
                              {t.status !== 'done' && t.status !== 'urgent' && (
                                <button className="btn-icon btn-icon-warning" title="标为需跟进" onClick={(e) => { e.stopPropagation(); openUrgentModal(t.id) }}><Icon type="flag"/></button>
                              )}
                              {t.status === 'urgent' && (
                                <button className="btn-icon btn-icon-warning" title="取消需跟进" onClick={(e) => { e.stopPropagation(); openCancelUrgentModal(t.id) }}><Icon type="flag"/></button>
                              )}
                              {t.status !== 'done' && (
                                <button className="btn-icon btn-icon-success" title="完成" onClick={(e) => { e.stopPropagation(); openCompleteModal(t.id, null) }}><Icon type="check"/></button>
                              )}
                              <button className="btn-icon" title="详情" onClick={() => openDrawer(t.id)}><Icon type="detail"/></button>
                              {(isAdmin || t.member_id === profile.id) && (
                                <button className="btn-icon btn-icon-edit" title="编辑" onClick={() => openEditTicket(t)}><Icon type="edit"/></button>
                              )}
                              {isAdmin && (
                                <button className="btn-icon btn-icon-danger" title="删除" onClick={() => deleteTicket(t.id)}><Icon type="delete"/></button>
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
                  <label>预约时间</label>
                  <input type="datetime-local" value={form.deadline || ''} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <label>诊所编码</label>
                <input value={form.clinic_code || ''} onChange={e => setForm({ ...form, clinic_code: e.target.value })} placeholder="完成服务内容时自动填写" readOnly style={{ background: '#f9fafb', color: '#6b7280' }} />
              </div>
              <div className="form-row">
                <label>备注 / 今日工作内容</label>
                <textarea value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="记录今天做了什么..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowTicketModal(false)} disabled={savingTicket}>取消</button>
              <button className="btn btn-primary" onClick={saveTicket} disabled={savingTicket}>{savingTicket ? '保存中...' : '保存'}</button>
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
                <label>登录邮箱 *</label>
                <input type="email" value={memberForm.email} onChange={e => setMemberForm({ ...memberForm, email: e.target.value })} placeholder="用于登录的邮箱" />
              </div>
              <div className="form-row">
                <label>登录密码 *</label>
                <input type="password" value={memberForm.password} onChange={e => setMemberForm({ ...memberForm, password: e.target.value })} placeholder="至少6位密码" />
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

      {/* 完成工单弹窗 */}
      {showCompleteModal && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setShowCompleteModal(false) }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>✅ 完成工单</h3>
              <button className="modal-close" onClick={() => setShowCompleteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0f9ff', borderRadius: 8 }}>
                确认将此工单标记为<strong>已完成</strong>
              </div>
              <div className="form-row">
                <label>诊所编码 <span style={{ color: 'red' }}>*</span></label>
                <input
                  value={clinicCodeInput}
                  onChange={e => setClinicCodeInput(e.target.value)}
                  placeholder="请输入诊所编码"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmCompleteTicket()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCompleteModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={confirmCompleteTicket}>确认完成</button>
            </div>
          </div>
        </div>
      )}

      {/* 需跟进弹窗 */}
      {showUrgentModal && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setShowUrgentModal(false) }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>🚩 标为需跟进</h3>
              <button className="modal-close" onClick={() => setShowUrgentModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff7ed', borderRadius: 8 }}>
                确认将此工单标记为<strong style={{ color: '#ea580c' }}>需跟进</strong>
              </div>
              <div className="form-row">
                <label>跟进内容</label>
                <textarea
                  rows={3}
                  value={urgentNote}
                  onChange={e => setUrgentNote(e.target.value)}
                  placeholder="请填写需要跟进的内容..."
                  autoFocus
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowUrgentModal(false)}>取消</button>
              <button className="btn btn-primary" style={{ background: '#ea580c', borderColor: '#ea580c' }} onClick={confirmMarkUrgent}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 取消需跟进弹窗 */}
      {showCancelUrgentModal && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setShowCancelUrgentModal(false) }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>取消需跟进</h3>
              <button className="modal-close" onClick={() => setShowCancelUrgentModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '10px 14px', background: '#f9fafb', borderRadius: 8 }}>
                确认将此工单从<strong style={{ color: '#ea580c' }}>需跟进</strong>切回<strong>进行中</strong>？
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCancelUrgentModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={confirmCancelUrgent}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 时间段工作表弹窗 */}
      {showTimelineModal && (
        <TimelineModal
          members={members}
          tickets={tickets}
          typeMap={TYPE_MAP}
          statusMap={STATUS_MAP}
          onClose={() => setShowTimelineModal(false)}
        />
      )}

      {/* 工单详情抽屉 */}
      {showDrawer && drawerTicket && (
        <div className="drawer open">
          <div className="drawer-header">
            <h3>工单详情</h3>
            <button className="drawer-close" onClick={() => setShowDrawer(false)}>×</button>
          </div>
          <div className="drawer-body">
            <div className="detail-grid">
              <div className="dg-item"><span className="dg-label">工单号</span><span className="dg-value">{drawerTicket.ticket_no || '-'}</span></div>
              <div className="dg-item"><span className="dg-label">客户</span><span className="dg-value" style={{ fontWeight: 700 }}>{drawerTicket.client}</span></div>
              <div className="dg-item"><span className="dg-label">类型</span><span className="dg-value"><span className={`tag ${TYPE_MAP[drawerTicket.type]?.cls || 'tag-other'}`}>{TYPE_MAP[drawerTicket.type]?.label || drawerTicket.type}</span></span></div>
              <div className="dg-item"><span className="dg-label">负责人</span><span className="dg-value">{drawerTicket.member?.name || '未分配'}</span></div>
              <div className="dg-item"><span className="dg-label">状态</span><span className="dg-value"><span className={`tag ${STATUS_MAP[drawerTicket.status]?.cls || 'tag-pending'}`}>{STATUS_MAP[drawerTicket.status]?.label || drawerTicket.status}</span></span></div>
              <div className="dg-item"><span className="dg-label">预约时间</span><span className="dg-value">{drawerTicket.deadline ? new Date(drawerTicket.deadline).toLocaleString('zh-CN') : '未设置'}</span></div>
              <div className="dg-item"><span className="dg-label">诊所编码</span><span className="dg-value">{drawerTicket.clinic_code || '未填写'}</span></div>
              <div className="dg-item"><span className="dg-label">新建时间</span><span className="dg-value">{drawerTicket.created_at ? new Date(drawerTicket.created_at).toLocaleString('zh-CN') : '-'}</span></div>
              {drawerTicket.status === 'done' && drawerTicket.completed_at && (
                <div className="dg-item"><span className="dg-label">完成时间</span><span className="dg-value" style={{ color: '#16a34a' }}>{new Date(drawerTicket.completed_at).toLocaleString('zh-CN')}</span></div>
              )}
              {drawerTicket.status === 'done' && drawerTicket.completed_at && drawerTicket.created_at && (() => {
                const diffMs = new Date(drawerTicket.completed_at).getTime() - new Date(drawerTicket.created_at).getTime()
                if (diffMs < 0) return null
                const minutes = Math.floor(diffMs / 60000)
                const hours = Math.floor(minutes / 60)
                const mins = minutes % 60
                let duration = ''
                if (hours >= 24) { duration = `${Math.floor(hours / 24)}天${hours % 24}时${mins}分` }
                else if (hours > 0) { duration = `${hours}时${mins}分` }
                else { duration = `${mins}分` }
                return <div className="dg-item"><span className="dg-label">消耗时间</span><span className="dg-value" style={{ fontWeight: 600, color: '#2563eb' }}>{duration}</span></div>
              })()}
              {drawerTicket.note && (
                <div className="dg-item dg-full"><span className="dg-label">备注</span><span className="dg-value" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{drawerTicket.note}</span></div>
              )}
            </div>

            <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>📋 服务内容</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {(() => {
                const typeService = TYPE_SERVICE_MAP[drawerTicket.type]
                const ticketServices = drawerTicket.services || []
                if (!typeService) {
                  return <span style={{ color: '#9ca3af' }}>该类型未配置服务内容</span>
                }
                const done = ticketServices.includes(typeService)
                return (
                  <span
                    style={{
                      padding: '6px 14px',
                      borderRadius: 16,
                      border: done ? '1.5px solid #16a34a' : '1.5px solid #d1d5db',
                      background: done ? '#f0fdf4' : '#f9fafb',
                      color: done ? '#16a34a' : '#6b7280',
                    }}
                  >
                    {done ? '✅' : '⬜'} {typeService}
                  </span>
                )
              })()}
            </div>

            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

            <div style={{ fontWeight: 600, marginBottom: 8 }}>📝 工作记录</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(drawerTicket.logs || []).length
                ? drawerTicket.logs.map((l, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>{new Date(l.created_at).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12: false })}</span>
                    <span style={{ color: '#2563eb', fontWeight: 600, flexShrink: 0 }}>#{i + 1}</span>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} title={l.content}>{l.content}</span>
                  </div>
                ))
                : <div style={{ color: '#9ca3af' }}>暂无工作记录</div>
              }
            </div>

            <div className="log-input-area">
              <div style={{ color: '#6b7280', marginBottom: 6 }}>快速追加工作记录</div>
              <textarea rows={2} value={logInput} onChange={e => setLogInput(e.target.value)} placeholder="记录本次处理内容..." />
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={addLog}>记录</button>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              {drawerTicket.status !== 'done' && drawerTicket.status !== 'urgent' && (
                <button
                  className="btn btn-outline"
                  style={{ flex: 1, color: '#ea580c', borderColor: '#ea580c' }}
                  onClick={() => openUrgentModal(drawerTicket.id)}
                >标为需跟进</button>
              )}
              {drawerTicket.status === 'urgent' && (
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => openCancelUrgentModal(drawerTicket.id)}
                >取消需跟进</button>
              )}
              {drawerTicket.status !== 'done' && (
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => openCompleteModal(drawerTicket.id)}
                >完成工单</button>
              )}
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
