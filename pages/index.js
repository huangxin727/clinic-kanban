import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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

// 表头搜索筛选组件
const ThSearchFilter = ({ value, onChange, label }) => {
  const [open, setOpen] = useState(false)
  const inputRef = React.useRef(null)
  const ref = React.useRef(null)
  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <th ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      <span
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus?.(), 0) }}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 4px', borderRadius: 4, borderBottom: value ? '2px solid #3b82f6' : '2px solid transparent', transition: 'border-color .15s' }}
      >
        <span>{value ? value : (label || '客户')}</span>
        {open
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="7" height="7" rx="1"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: value ? 1 : 0.4, flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
        }
      </span>
      {value && (
        <span onClick={e => { e.stopPropagation(); onChange('') }} style={{ marginLeft: 3, fontSize: 12, color: '#3b82f6', cursor: 'pointer', fontWeight: 700 }}>✕</span>
      )}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, minWidth: 160, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: '6px 8px' }}>
          <input
            ref={inputRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`搜索${label || '客户'}...`}
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none' }}
            autoFocus
          />
        </div>
      )}
    </th>
  )
}

// 表头日期筛选组件
const ThDateFilter = ({ value, onChange }) => {
  const inputRef = React.useRef(null)
  return (
    <th style={{ position: 'relative' }}>
      <label
        onClick={() => inputRef.current?.showPicker?.()}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 4px', borderRadius: 4, borderBottom: value ? '2px solid #3b82f6' : '2px solid transparent', transition: 'border-color .15s', fontSize: 'inherit', fontWeight: 'inherit' }}
      >
        <span style={{ opacity: value ? 1 : 0.5 }}>{value ? value.replace(/^\d{4}-/, '') : '时间'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
      </label>
      {value && (
        <span onClick={() => onChange('')} style={{ marginLeft: 3, fontSize: 12, color: '#3b82f6', cursor: 'pointer', fontWeight: 700 }}>✕</span>
      )}
      <input ref={inputRef} type="date" value={value} onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', bottom: -2, left: 0, opacity: 0, width: 0, height: 0, border: 'none', padding: 0 }}
      />
    </th>
  )
}

// 表头筛选组件 — 点击弹出下拉选择，选中后高亮显示，可点击 ✕ 清除
const ThFilter = ({ label, active, value, onChange, options, allLabel }) => {
  const [open, setOpen] = useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const selected = options.find(o => o.value === value)
  return (
    <th ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      <span
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 4px', borderRadius: 4, borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent', transition: 'border-color .15s' }}
      >
        {selected ? selected.label : label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.4, flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
      </span>
      {active && (
        <span
          onClick={e => { e.stopPropagation(); onChange('') }}
          style={{ marginLeft: 3, fontSize: 12, color: '#3b82f6', cursor: 'pointer', fontWeight: 700 }}
        >✕</span>
      )}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, minWidth: 120, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 4, maxHeight: 240, overflowY: 'auto' }}>
          <div
            onClick={() => { onChange(''); setOpen(false) }}
            style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: value ? '#6b7280' : '#3b82f6', background: !value ? '#eff6ff' : 'transparent', fontWeight: !value ? 600 : 400 }}
          >{allLabel}</div>
          {options.map(o => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: value === o.value ? '#3b82f6' : '#374151', background: value === o.value ? '#eff6ff' : 'transparent', fontWeight: value === o.value ? 600 : 400 }}
            >{o.label}</div>
          ))}
        </div>
      )}
    </th>
  )
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

  // 从 tickets + members 实时计算 stats 和 memberStats（不再依赖后端 refreshAll）
  const today = getToday()
  const dateTickets = useMemo(() => tickets.filter(t => {
    if (!t.created_at) return false
    const d = new Date(t.created_at)
    const local = new Date(d.getTime() - new Date().getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 10) === today
  }), [tickets, today])

  const stats = useMemo(() => ({
    total: dateTickets.length,
    inprogress: dateTickets.filter(t => t.status === 'inprogress').length,
    done: dateTickets.filter(t => t.status === 'done').length,
    urgent: dateTickets.filter(t => t.status === 'urgent').length,
  }), [dateTickets])

  const memberStats = useMemo(() => members.map(m => ({
    ...m,
    tickets: dateTickets.filter(t => t.member_id === m.id)
  })), [members, dateTickets])

  // member id → member 对象映射
  const memberMap = useMemo(() => {
    const map = {}
    members.forEach(m => { map[m.id] = m })
    return map
  }, [members])

  const [selectedMember, setSelectedMember] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDate, setFilterDate] = useState(getToday())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('pool')
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

  // 预加载音频 + 解锁播放（浏览器要求用户交互后才能播放音频）
  const notifyAudioRef = React.useRef(null)
  useEffect(() => {
    const audio = new Audio('/notify.wav')
    audio.load()
    notifyAudioRef.current = audio
    // 监听用户任意交互来解锁音频播放
    const unlock = () => {
      if (audio.paused) {
        audio.play().then(() => { audio.pause(); audio.currentTime = 0 }).catch(() => {})
      }
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
    }
    document.addEventListener('click', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  // 请求浏览器通知权限
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        // 授权后如果有待提醒的工单，立即发一次通知
        if (p === 'granted') {
          const now = Date.now()
          tickets.forEach(t => {
            if (!t.deadline || t.member_id || t.status === 'done') return
            const dl = new Date(t.deadline).getTime()
            const diffMin = (dl - now) / 60000
            if (diffMin <= 20) {
              const min = Math.abs(Math.round(diffMin))
              const msg = diffMin <= 0
                ? `【${t.client}】预约时间已过期 ${min} 分钟，尚未有人接单！`
                : `【${t.client}】预约时间还有 ${min} 分钟，尚未有人接单！`
              new Notification('⏰ 工单待接单提醒', {
                body: msg,
                icon: '/favicon.ico',
                tag: t.id + '_init',
                requireInteraction: true,
              })
            }
          })
        }
      })
    }
  }, [tickets])

  // 预约时间提醒：距预约时间≤20分钟且未接单 / 已接单未开始处理
  const remindedRef = React.useRef(new Map())
  const urgedRef = React.useRef(new Map()) // 已催促处理的记录（防重复提醒）
  const [remindAlerts, setRemindAlerts] = React.useState([]) // 页面内提醒弹窗队列
  const [toast, setToast] = React.useState(null) // 短暂 toast 提醒
  const showToast = React.useCallback((msg, duration = 2000) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }, [])
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      const newAlerts = []
      tickets.forEach(t => {
        if (!t.deadline) return
        if (t.status === 'done') return
        const dl = new Date(t.deadline).getTime()
        const diffMin = (dl - now) / 60000

        // 1) 未接单工单：距预约时间≤20分钟提醒组长分配
        if (!t.member_id && diffMin <= 20) {
          const min = Math.abs(Math.round(diffMin))
          const isOverdue = diffMin <= 0
          const msg = isOverdue
            ? `【${t.client}】预约时间已过期 ${min} 分钟，尚未有人接单！`
            : `【${t.client}】预约时间还有 ${min} 分钟，尚未有人接单！`
          // 每个工单最多提醒3次
          const count = (remindedRef.current.get(t.id) || 0)
          if (count < 3) {
            remindedRef.current.set(t.id, count + 1)
            newAlerts.push({ id: t.id, msg, isOverdue, client: t.client, deadline: t.deadline, type: 'unassigned' })
            // 播放提示音
            try { if (notifyAudioRef.current) { notifyAudioRef.current.currentTime = 0; notifyAudioRef.current.play().catch(() => {}) } } catch {}
            // 桌面通知（页面最小化时也能在桌面弹出）
            const notify = () => {
              const n = new Notification('⏰ 工单待接单提醒', {
                body: msg,
                icon: '/favicon.ico',
                tag: t.id + '_' + count,
                requireInteraction: true,
              })
              n.onclick = () => { window.focus(); n.close() }
            }
            if (typeof Notification !== 'undefined') {
              if (Notification.permission === 'granted') {
                notify()
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(p => { if (p === 'granted') notify() })
              }
            }
          }
        }

        // 2) 已接单未开始处理（pending）：距预约时间≤20分钟或已超过，催促负责人
        // 仅当当前登录用户就是该工单负责人时弹窗
        if (t.status === 'pending' && t.member_id && diffMin <= 5 && profile && t.member_id === profile.id) {
          const urgedCount = (urgedRef.current.get(t.id) || 0)
          if (urgedCount < 5) { // 最多催促5次
            const min = Math.abs(Math.round(diffMin))
            const isOverdue = diffMin <= 0
            const msg = isOverdue
              ? `【${t.client}】已超过预约时间 ${min} 分钟，请尽快开始处理！`
              : `【${t.client}】预约时间还有 ${min} 分钟，请尽快开始处理！`
            urgedRef.current.set(t.id, urgedCount + 1)
            newAlerts.push({ id: t.id, msg, isOverdue: true, client: t.client, deadline: t.deadline, type: 'urge' })
            // 播放提示音
            try { if (notifyAudioRef.current) { notifyAudioRef.current.currentTime = 0; notifyAudioRef.current.play().catch(() => {}) } } catch {}
            // 桌面通知
            const notify = () => {
              const n = new Notification('🚨 请尽快开始处理', {
                body: msg,
                icon: '/favicon.ico',
                tag: t.id + '_urge_' + urgedCount,
                requireInteraction: true,
              })
              n.onclick = () => { window.focus(); n.close() }
            }
            if (typeof Notification !== 'undefined') {
              if (Notification.permission === 'granted') {
                notify()
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(p => { if (p === 'granted') notify() })
              }
            }
          }
        }
      })
      if (newAlerts.length > 0) {
        setRemindAlerts(prev => [...prev, ...newAlerts])
        // 页面在后台时，标题闪烁提醒
        startTitleBlink()
      }
    }
    check()
    const timer = setInterval(check, 120000) // 每2分钟检测一次
    return () => clearInterval(timer)
  }, [tickets, profile])

  // 标题闪烁 + 图标闪烁：仅在页面后台时触发（Windows任务栏会自动高亮）
  const titleBlinkRef = React.useRef(null)
  const originTitle = React.useRef('工单看板')
  const originFaviconRef = React.useRef('/favicon.ico')
  const alertFaviconRef = React.useRef(null)
  React.useEffect(() => {
    // 保存原始 favicon
    const link = document.querySelector("link[rel*='icon']")
    if (link) originFaviconRef.current = link.href
    // 生成红色告警 favicon
    const canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    ctx.arc(16, 16, 14, 0, Math.PI * 2)
    ctx.fillStyle = '#dc2626'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', 16, 17)
    alertFaviconRef.current = canvas.toDataURL('image/png')
  }, [])

  const setFavicon = (href) => {
    let link = document.querySelector("link[rel*='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
  }

  const startTitleBlink = () => {
    if (titleBlinkRef.current) return
    // 先立即切换一次，让 Windows 任务栏开始高亮
    document.title = '🔔 工单待接单提醒！'
    setFavicon(alertFaviconRef.current)
    // 持续闪烁
    let show = true
    titleBlinkRef.current = setInterval(() => {
      if (document.hidden) {
        // 页面在后台时才切换（触发 Windows 任务栏高亮）
        show = !show
        if (show) {
          document.title = '🔔 工单待接单提醒！'
          setFavicon(alertFaviconRef.current)
        } else {
          document.title = '⏰ 请查看工单看板'
          setFavicon(originFaviconRef.current)
        }
      } else {
        // 页面在前台时只切换标题，不切 favicon
        show = !show
        document.title = show ? '🔔 工单待接单提醒！' : '⏰ 请查看工单看板'
      }
    }, 800)
  }
  // 用户聚焦页面时恢复标题和图标
  useEffect(() => {
    const onFocus = () => {
      if (titleBlinkRef.current) {
        clearInterval(titleBlinkRef.current)
        titleBlinkRef.current = null
        document.title = originTitle.current
        setFavicon(originFaviconRef.current)
        setRemindAlerts([])
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // 加载 profile
  const loadProfile = async (user) => {
    try {
      const json = await api('/auth/profile')
      if (json.data) {
        setProfile(json.data)
        // 组员默认只看自己的工单，管理员看全部
        if (!json.data.is_admin && json.data.id) {
          setSelectedMember(json.data.id)
        }
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
      const newTickets = d.tickets || []
      const newStats = d.stats || { total: 0, inprogress: 0, done: 0, urgent: 0 }
      // 保护：如果本地已有工单但刷新返回空列表且统计显示有工单，说明数据不完整，跳过本次更新
      const shouldSkip = newTickets.length === 0 && newStats.total > 0 && tickets.length > 0
      if (!shouldSkip) {
        safeSetTickets(newTickets)
      }
      safeSetMembers(d.members || [])
      if (d.settings) setSettings(d.settings)
      return d
    } catch (err) {
      console.error('刷新失败:', err)
    }
    if (showRefresh) setRefreshing(false)
  }, [tickets.length])

  // 轻量轮询变更检测（1秒），有变化直接返回增量数据
  // 兜底 15 秒强制全量刷新（防止极端情况遗漏）
  const lastTsRef = useRef('0')

  // 静默 poll：操作后触发一次 poll 拉取最新 ts，让定时 poll 自然同步
  // 不直接 setTickets/setMembers，避免全量数据覆盖导致页面闪烁
  const silentPoll = useCallback(async () => {
    try {
      const res = await api('/poll?ts=0')
      if (res.success && res.ts) {
        // 将 lastTsRef 设为 ts-1，这样下一次定时 poll 还能检测到变更
        // 避免 ts=latest 导致定时 poll 认为 changed=false 跳过更新
        lastTsRef.current = (parseInt(res.ts) - 1).toString()
      }
    } catch {}
  }, [])

  useEffect(() => {
    let pollTimer
    let forceTimer
    let alive = true

    const poll = async () => {
      try {
        const res = await api(`/poll?ts=${lastTsRef.current}`)
        if (alive && res.success && res.changed) {
          lastTsRef.current = res.ts
          if (res.tickets) safeSetTickets(res.tickets)
          if (res.members) safeSetMembers(res.members)
        } else if (alive && res.success && res.ts) {
          lastTsRef.current = res.ts
        }
      } catch {}
    }

    // 首次加载完成后启动轮询
    const init = async () => {
      await refreshAll()
      if (!alive) return
      // 用首次加载后的 ts 初始化 lastTs
      const initRes = await api('/poll')
      if (initRes?.success && initRes.ts) lastTsRef.current = initRes.ts
      pollTimer = setInterval(poll, 1000)
      forceTimer = setInterval(() => refreshAll(), 15000)
    }
    init()

    return () => {
      alive = false
      clearInterval(pollTimer)
      clearInterval(forceTimer)
    }
  }, [refreshAll])

  // 过滤工单（selectedMember 不在此过滤，在 UI 层按已接单/待接单分别处理）
  const filteredTickets = tickets.filter(t => {
    if (filterType && t.type !== filterType) return false
    if (filterStatus && t.status !== filterStatus) return false
    if (filterDate) {
      let ticketDate = t.ticket_date
      if (!ticketDate && t.created_at) {
        const d = new Date(t.created_at)
        ticketDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      }
      if (ticketDate !== filterDate) return false
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
    setForm({ type: 'init', status: 'pending', note: '' })
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
    if (savingTicket) return

    const autoDone = shouldAutoDone(form.type, services, TYPE_SERVICE_MAP)
    // 新建时若无负责人则状态为 pending（待接单），否则按表单状态
    const hasAssignee = !!(form.member_id)
    const status = editMode
      ? (autoDone ? 'done' : (form.status || 'inprogress'))
      : (hasAssignee ? (autoDone ? 'done' : (form.status || 'inprogress')) : 'pending')
    const payload = { ...form, services, ticket_date: getToday(), status }
    const now = new Date().toISOString()

    // 立即关闭弹窗 + 显示 loading
    setSavingTicket(true)
    setShowTicketModal(false)

    if (editMode) {
      // 等 API 返回后刷新，不再乐观更新
      api(`/tickets/${form.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      }).then(() => {
        setSavingTicket(false)
        showToast('✅ 工单已更新')
        silentPoll()
      }).catch(err => {
        alert('保存失败: ' + err.message)
        setSavingTicket(false)
        silentPoll()
      })
    } else {
      // 新建模式：等 POST 返回后刷新，不做乐观创建
      api('/tickets', {
        method: 'POST',
        body: JSON.stringify(payload)
      }).then((res) => {
        setSavingTicket(false)
        showToast('✅ 工单已创建')
        silentPoll()
      }).catch(err => {
        setSavingTicket(false)
        alert('保存失败: ' + err.message)
        silentPoll()
      })
    }

    setForm({})
    setEditMode(false)
    setServices([])
  }

  // ===== 接单（先发请求确认，避免多人同时接同一工单） =====
  const [acceptingId, setAcceptingId] = useState(null) // 正在接单的工单ID，防止重复点击
  const [startingId, setStartingId] = useState(null) // 正在开始处理的工单ID
  const deletingIdsRef = useRef(new Set()) // 正在删除中的工单ID集合
  // 通用操作锁：防止按钮重复点击，格式 "action:id" 或 "action"
  const actionLocksRef = useRef(new Set())
  const [actionLoading, setActionLoading] = useState('') // 当前正在执行的操作 key（用于 UI disabled）
  const lockAction = useCallback((key) => {
    actionLocksRef.current.add(key)
    setActionLoading(key)
  }, [])
  const unlockAction = useCallback((key) => {
    actionLocksRef.current.delete(key)
    setActionLoading(prev => prev === key ? '' : prev)
  }, [])

  const resolveTicketId = useCallback((t) => t.id, [])

  // 统一的 tickets 更新：自动处理删除中/创建中的工单
  // 加入引用相等性检查，避免轮询返回相同数据时触发无意义的重渲染
  const safeSetTickets = useCallback((updaterOrArray) => {
    setTickets(prev => {
      const newTickets = typeof updaterOrArray === 'function' ? updaterOrArray(prev) : updaterOrArray
      const delSet = deletingIdsRef.current
      // 过滤掉正在删除中的
      let result = delSet.size > 0 ? newTickets.filter(t => !delSet.has(t.id)) : newTickets

      // 引用相等性检查：避免 poll 返回相同数据时触发无意义的重渲染
      // 但如果有删除中的工单，跳过 same 检测，确保数据同步
      if (result === prev) return prev
      if (delSet.size > 0 || result.length !== prev.length) return result
      // 长度相同时按关键字段比较
      if (result.length === prev.length) {
        let same = true
        for (let i = 0; i < result.length; i++) {
          if (result[i].updated_at !== prev[i].updated_at || result[i].status !== prev[i].status || result[i].member_id !== prev[i].member_id) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return result
    })
  }, [])

  // 统一的 members 更新：引用比较，数据不变时不触发重渲染
  const safeSetMembers = useCallback((newMembers) => {
    setMembers(prev => {
      if (newMembers === prev) return prev
      if (newMembers.length !== prev.length) return newMembers
      let same = true
      for (let i = 0; i < newMembers.length; i++) {
        if (newMembers[i].status !== prev[i].status || newMembers[i].name !== prev[i].name || newMembers[i].role !== prev[i].role) {
          same = false
          break
        }
      }
      return same ? prev : newMembers
    })
  }, [])

  const acceptTicket = async (t) => {
    if (!profile) return alert('请先登录')
    if (acceptingId) return // 防止重复点击
    const member = members.find(m => m.id === profile.id)
    if (!member) return alert('未找到您的组员信息')
    // 清除该工单的提醒
    remindedRef.current.delete(t.id)
    setRemindAlerts(prev => prev.filter(a => a.id !== t.id))
    setAcceptingId(t.id)

    // 如果是乐观创建的工单，用真实 ID 替换 tempId
    const ticketId = resolveTicketId(t)

    const acceptData = { member_id: member.id, status: 'pending', accepted_at: new Date().toISOString() }

    try {
      const res = await api(`/tickets/${ticketId}`, {
        method: 'PUT',
        body: JSON.stringify(acceptData)
      })
      // 后端确认成功后刷新
      if (res.success) {
        showToast(`✅ 已接单：${t.client}`)
        // 关闭所有未关闭的提醒弹窗
        setRemindAlerts([])
        // 停止标题闪烁
        if (titleBlinkRef.current) {
          clearInterval(titleBlinkRef.current)
          titleBlinkRef.current = null
          document.title = originTitle.current
          setFavicon(originFaviconRef.current)
        }
        silentPoll()
      }
    } catch (err) {
      // 409 = 已被别人接走，提示并刷新列表
      const msg = err.message || ''
      if (msg.includes('已被其他人接走')) {
        alert('⚠️ 该工单已被其他人接走')
      } else {
        alert('接单失败: ' + err.message)
      }
      silentPoll()
    } finally {
      setAcceptingId(null)
    }
  }

  // ===== 开始处理 =====
  const startTicket = (t) => {
    // 仅管理员或工单负责人可以开始处理
    if (!isAdmin && t.member_id !== profile.id) {
      alert('只有负责人或管理员才能开始处理此工单')
      return
    }
    if (startingId) return // 防止重复点击
    const lockKey = `start:${t.id}`
    if (actionLocksRef.current.has(lockKey)) return
    const now = new Date().toISOString()
    const updates = { status: 'inprogress', started_at: now }
    // 如果是乐观创建的工单，用真实 ID 替换 tempId
    const ticketId = resolveTicketId(t)
    lockAction(lockKey)
    setStartingId(t.id)
    // 等 API 返回后确认状态已更新再提示
    api(`/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }).then(() => {
      unlockAction(lockKey)
      setStartingId(null)
      // 清除该工单的催促提醒
      urgedRef.current.delete(t.id)
      setRemindAlerts(prev => prev.filter(a => a.id !== t.id || a.type !== 'urge'))
      showToast(`🚀 开始处理：${t.client}`)
      silentPoll()
    }).catch(err => {
      unlockAction(lockKey)
      setStartingId(null)
      alert('操作失败: ' + err.message)
    })
  }

  const deleteTicket = async (id) => {
    if (!confirm('确认删除此工单？')) return
    const lockKey = `del:${id}`
    if (actionLocksRef.current.has(lockKey)) return
    // 全局删除锁：防止快速连续删除导致大量并发 refreshAll
    if (actionLocksRef.current.has('deleting')) return
    lockAction(lockKey)
    lockAction('deleting')
    // 如果删除的是当前抽屉里的工单，关闭抽屉
    if (drawerTicket && drawerTicket.id === id) {
      setShowDrawer(false)
      setDrawerTicket(null)
    }
    // 清除该工单的提醒
    remindedRef.current.delete(id)
    setRemindAlerts(prev => prev.filter(a => a.id !== id))
    // 标记为删除中，防止 poll 拉回
    deletingIdsRef.current.add(id)
    // 纯乐观更新：立即从本地移除
    safeSetTickets(prev => prev.filter(t => t.id !== id))
    // 后台异步删除
    try {
      await api(`/tickets/${id}`, { method: 'DELETE' })
      showToast('🗑️ 工单已删除')
    } catch (err) {
      deletingIdsRef.current.delete(id)
      unlockAction(lockKey)
      unlockAction('deleting')
      alert('删除失败: ' + err.message)
      silentPoll()
      return
    }
    // DELETE 成功后延迟清除 deletingIdsRef，确保 poll 有时间拿到删除后的后端数据
    setTimeout(() => {
      deletingIdsRef.current.delete(id)
      unlockAction(lockKey)
      unlockAction('deleting')
    }, 5000)
    // 不调 silentPoll，依赖乐观更新+定时poll自然同步，避免 poll 返回含已删除工单的数据覆盖乐观删除
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

    setCompletingTicket(true)

    api(`/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'done', clinic_code: clinicCodeInput.trim() })
    }).then(() => {
      setCompletingTicket(false)
      setShowCompleteModal(false)
      showToast('✅ 工单已完成')
      silentPoll()
    }).catch(err => {
      setCompletingTicket(false)
      alert('完成操作失败: ' + err.message)
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
    if (actionLocksRef.current.has(`urgent:${ticketId}`)) return
    lockAction(`urgent:${ticketId}`)
    setShowUrgentModal(false)
    // 等 API 返回后由 poll 自然同步状态
    api(`/tickets/${ticketId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'urgent', note: urgentNote.trim() })
    }).then(() => {
      unlockAction(`urgent:${ticketId}`)
      showToast('🚩 已标为需跟进')
      silentPoll()
    }).catch(err => {
      alert('操作失败: ' + err.message)
      unlockAction(`urgent:${ticketId}`)
    })
  }

  // 取消需跟进
  const openCancelUrgentModal = (ticketId) => {
    setCancelUrgentId(ticketId)
    setShowCancelUrgentModal(true)
  }

  const confirmCancelUrgent = () => {
    if (!cancelUrgentId) return
    if (actionLocksRef.current.has(`cancelUrgent:${cancelUrgentId}`)) return
    lockAction(`cancelUrgent:${cancelUrgentId}`)
    setShowCancelUrgentModal(false)
    // 等 API 返回后由 poll 自然同步状态
    api(`/tickets/${cancelUrgentId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'inprogress' })
    }).then(() => {
      unlockAction(`cancelUrgent:${cancelUrgentId}`)
      showToast('✅ 已取消需跟进')
      silentPoll()
    }).catch(err => {
      alert('操作失败: ' + err.message)
      unlockAction(`cancelUrgent:${cancelUrgentId}`)
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
    // 如果是乐观创建的工单，用真实 ID 请求后端数据
    const fetchId = id
    // 后台静默刷新完整数据（含 logs）
    try {
      const json = await api(`/tickets/${fetchId}`)
      if (json.data) setDrawerTicket(json.data)
    } catch (err) {
      // 静默失败，本地数据已经展示了
    }
  }

  const addLog = async () => {
    if (!logInput.trim() || !drawerTicket) return
    const lockKey = 'addLog'
    if (actionLocksRef.current.has(lockKey)) return
    lockAction(lockKey)
    try {
      const newContent = logInput.trim()
      // 1. 写入工作记录日志
      await api(`/tickets/${drawerTicket.id}/logs`, {
        method: 'POST',
        body: JSON.stringify({ content: newContent })
      })
      // 2. 刷新列表，拿到最新的工单数据
      const d = await refreshAll()
      // 3. 从刷新后的数据中取最新 note，追加新内容
      const latestTicket = (d?.tickets || []).find(t => t.id === drawerTicket.id)
      const existingNote = latestTicket?.note || ''
      const newNote = existingNote ? `${existingNote}\n${newContent}` : newContent
      await api(`/tickets/${drawerTicket.id}`, {
        method: 'PUT',
        body: JSON.stringify({ note: newNote })
      })
      setLogInput('')
      showToast('📝 工作记录已添加')
      // 4. 再次刷新，确保列表和抽屉数据一致
      await refreshAll()
      openDrawer(drawerTicket.id)
      unlockAction(lockKey)
    } catch (err) {
      unlockAction(lockKey)
      alert(err.message)
    }
  }

  // ===== 组员操作 =====
  const saveMember = async () => {
    if (!memberForm.name?.trim()) return alert('请填写姓名')
    if (!memberForm.email?.trim()) return alert('请填写登录邮箱')
    if (!memberForm.password || memberForm.password.length < 6) return alert('密码至少6位')
    if (actionLocksRef.current.has('saveMember')) return
    lockAction('saveMember')
    try {
      await api('/members', {
        method: 'POST',
        body: JSON.stringify(memberForm)
      })
      setShowMemberModal(false)
      setMemberForm({ name: '', role: '全能', status: 'free', email: '', password: '' })
      showToast('✅ 组员已添加')
      silentPoll()
      unlockAction('saveMember')
    } catch (err) {
      unlockAction('saveMember')
      alert(err.message)
    }
  }

  const toggleMemberStatus = async (m) => {
    // 空闲 → 忙碌 → 离线 → 空闲
    if (actionLocksRef.current.has(`toggle:${m.id}`)) return
    lockAction(`toggle:${m.id}`)
    const order = ['free', 'busy', 'offline']
    const idx = order.indexOf(m.status || 'free')
    const next = order[(idx + 1) % order.length]
    try {
      await api(`/members/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: next })
      })
      silentPoll()
      unlockAction(`toggle:${m.id}`)
    } catch (err) {
      unlockAction(`toggle:${m.id}`)
      alert(err.message)
    }
  }

  const removeMember = async (m) => {
    if (!confirm(`确认移除组员「${m.name}」？`)) return
    if (actionLocksRef.current.has(`removeMember:${m.id}`)) return
    lockAction(`removeMember:${m.id}`)
    try {
      await api(`/members/${m.id}`, { method: 'DELETE' })
      showToast(`🗑️ 已移除组员「${m.name}」`)
      silentPoll()
      unlockAction(`removeMember:${m.id}`)
    } catch (err) {
      unlockAction(`removeMember:${m.id}`)
      alert(err.message)
    }
  }

  // ===== 导出 =====
  const exportCSV = async () => {
    if (actionLocksRef.current.has('exportCSV')) return
    lockAction('exportCSV')
    try {
      const res = await api(`/export?date=${getToday()}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `工单日报_${getToday()}.csv`
      a.click()
    } catch (err) {
      alert('导出失败: ' + err.message)
    }
    unlockAction('exportCSV')
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
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={exportCSV} disabled={actionLoading === 'exportCSV'}>{actionLoading === 'exportCSV' ? '⏳ 导出中...' : '📥 导出日报'}</button>
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
              <input placeholder="🔍 搜索客户/工单号..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 'var(--font-sm)', color: 'var(--text)', outline: 'none', background: '#fff' }}>
                <option value="">全部类型</option>
                {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 'var(--font-sm)', color: 'var(--text)', outline: 'none', background: '#fff' }}>
                <option value="">全部状态</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {isAdmin && <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 'var(--font-sm)', color: 'var(--text)', outline: 'none', background: '#fff' }}>
                <option value="">全部负责人</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>}
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 'var(--font-sm)', color: 'var(--text)', outline: 'none', background: '#fff' }} />
              <div className="spacer" />
              <button className="btn btn-outline" onClick={() => setShowTimelineModal(true)} title="查看时间段工作表">📅 时间表</button>
              <button className="btn btn-primary" onClick={openNewTicket}>＋ 新建工单</button>
            </div>

            <div className="ticket-section">
              {/* Tab 标签切换 */}
              <div className="section-header" style={{ gap: 8 }}>
                <button
                  onClick={() => setActiveTab('pool')}
                  style={{ background: 'none', border: 'none', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: activeTab === 'pool' ? 700 : 400, color: activeTab === 'pool' ? '#2563eb' : '#6b7280', borderBottom: activeTab === 'pool' ? '2px solid #2563eb' : '2px solid transparent', transition: 'all .15s' }}
                >
                  {isAdmin ? '📋 工单池' : '📋 接单池'}
                  <span style={{ marginLeft: 4, background: activeTab === 'pool' ? '#2563eb' : '#e5e7eb', color: activeTab === 'pool' ? '#fff' : '#6b7280', fontSize: 11, padding: '0 6px', borderRadius: 8, fontWeight: 600 }}>
                    {filteredTickets.filter(t => !t.member_id).length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('list')}
                  style={{ background: 'none', border: 'none', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: activeTab === 'list' ? 700 : 400, color: activeTab === 'list' ? '#2563eb' : '#6b7280', borderBottom: activeTab === 'list' ? '2px solid #2563eb' : '2px solid transparent', transition: 'all .15s' }}
                >
                  {isAdmin ? '📝 工单列表' : '📝 工作列表'}
                  <span style={{ marginLeft: 4, background: activeTab === 'list' ? '#2563eb' : '#e5e7eb', color: activeTab === 'list' ? '#fff' : '#6b7280', fontSize: 11, padding: '0 6px', borderRadius: 8, fontWeight: 600 }}>
                    {isAdmin
                      ? filteredTickets.filter(t => !!t.member_id && (!selectedMember || t.member_id === selectedMember)).length
                      : filteredTickets.filter(t => t.member_id === profile.id).length}
                  </span>
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                {/* === 接单池 / 工单池 Tab === */}
                {activeTab === 'pool' && (() => {
                  const unassigned = filteredTickets.filter(t => !t.member_id)
                  return unassigned.length > 0 ? (
                    <table className="assigned-table">
                      <thead>
                        <tr>
                          <th>客户</th>
                          <th>类型</th>
                          {isAdmin && <th>负责人</th>}
                          <th>状态</th>
                          <th>预约时间</th>
                          <th>提示</th>
                          <th>备注</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unassigned.map(t => {
                          const ti = TYPE_MAP[t.type] || { label: t.type, cls: 'tag-other' }
                          const fmtDT = (iso) => { if (!iso) return '-'; const d = new Date(iso); return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` }
                          const dlTs = t.deadline ? new Date(t.deadline).getTime() : null
                          const diffMin = dlTs ? (dlTs - Date.now()) / 60000 : null
                          const isUrgentDl = diffMin !== null && diffMin > 0 && diffMin <= 20
                          const isOverdue = diffMin !== null && diffMin <= 0
                          // 预约时间列
                          const deadlineCell = t.deadline
                            ? <><span className={isOverdue ? 'meta-overdue' : isUrgentDl ? 'meta-urgent' : ''}>{fmtDT(t.deadline)}</span>{isOverdue && <span style={{ marginLeft: 4, color: '#dc2626', fontSize: 11 }}>已超{Math.abs(Math.round(diffMin))}分</span>}{isUrgentDl && <span style={{ marginLeft: 4, color: '#d97706', fontSize: 11 }}>剩{Math.round(diffMin)}分</span>}</>
                            : <span style={{ color: '#9ca3af' }}>未设置</span>
                          // 提示列：无预约→请尽快接单，过期→请尽快接单
                          const tipCell = !t.deadline
                            ? <span style={{ color: '#f59e0b', fontWeight: 600, background: '#fffbeb', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>⏰ 请尽快接单</span>
                            : isOverdue
                              ? <span style={{ color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>🔴 请尽快接单</span>
                              : isUrgentDl
                                ? <span style={{ color: '#d97706', fontWeight: 600, background: '#fffbeb', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>🟡 即将到期</span>
                                : <span style={{ color: '#9ca3af' }}>-</span>
                          return (
                            <tr key={t.id} className={isOverdue ? 'card-overdue' : isUrgentDl ? 'card-urgent' : ''}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{t.client}</div>
                                {t.ticket_no && <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.ticket_no}</div>}
                              </td>
                              <td><span className={`tag ${ti.cls}`}>{ti.label}</span></td>
                              {isAdmin && <td style={{ color: '#f59e0b', fontWeight: 500 }}>待接单</td>}
                              <td><span className="tag tag-pending">待处理</span></td>
                              <td style={{ fontSize: 13 }}>{deadlineCell}</td>
                              <td style={{ fontSize: 13 }}>{tipCell}</td>
                              <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }} title={t.note || ''}>{t.note || '-'}</td>
                              <td>
                                <div className="action-group">
                                  <button className="btn btn-primary btn-accept" disabled={acceptingId === t.id} onClick={() => acceptTicket(t)} style={{ fontSize: 12, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                                    {acceptingId === t.id ? '⏳ 接单中...' : '✋ 接单'}
                                  </button>
                                  <button className="btn-icon" title="详情" onClick={() => openDrawer(t.id)}><Icon type="detail"/></button>
                                  {isAdmin && <button className="btn-icon btn-icon-edit" title="编辑" onClick={() => openEditTicket(t)}><Icon type="edit"/></button>}
                                  {isAdmin && <button className="btn-icon btn-icon-danger" title="删除" onClick={() => deleteTicket(t.id)}><Icon type="delete"/></button>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px 0' }}>暂无待接单工单</div>
                })()}

                {/* === 工作列表 / 工单列表 Tab === */}
                {activeTab === 'list' && (() => {
                  const listTickets = isAdmin
                    ? filteredTickets.filter(t => !!t.member_id && (!selectedMember || t.member_id === selectedMember))
                    : filteredTickets.filter(t => t.member_id === profile.id)
                  return listTickets.length > 0 ? (
                    <table className="assigned-table">
                      <thead>
                        <tr>
                          <th>客户</th>
                          <th>类型</th>
                          {isAdmin && <th>负责人</th>}
                          <th>状态</th>
                          <th>预约时间</th>
                          <th>接单时间</th>
                          <th>处理时间</th>
                          <th>完成时间</th>
                          <th>备注</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listTickets.map(t => {
                          const m = t.member || memberMap[t.member_id] || {}
                          const ti = TYPE_MAP[t.type] || { label: t.type, cls: 'tag-other' }
                          const si = STATUS_MAP[t.status] || { label: t.status, cls: 'tag-pending' }
                          const fmtDT = (iso) => { if (!iso) return '-'; const d = new Date(iso); return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}` }
                          void clock
                          // 预约时间相关计算
                          const dlTs = t.deadline ? new Date(t.deadline).getTime() : null
                          const dlDiffMin = dlTs ? (dlTs - Date.now()) / 60000 : null
                          const isDlOverdue = dlDiffMin !== null && dlDiffMin <= 0 && t.status !== 'done'
                          const isDlUrgent = dlDiffMin !== null && dlDiffMin > 0 && dlDiffMin <= 20 && t.status !== 'done'
                          const dlMin = dlDiffMin !== null ? Math.abs(Math.round(dlDiffMin)) : null
                          // 预约时间列内容
                          const deadlineCell = t.deadline
                            ? <><span className={isDlOverdue ? 'meta-overdue' : isDlUrgent ? 'meta-urgent' : ''}>{fmtDT(t.deadline)}</span>{isDlOverdue && <span style={{ marginLeft: 4, color: '#dc2626', fontSize: 11 }}>已超{dlMin}分</span>}{isDlUrgent && <span style={{ marginLeft: 4, color: '#d97706', fontSize: 11 }}>剩{dlMin}分</span>}</>
                            : <span style={{ color: '#9ca3af' }}>-</span>
                          // 接单时间列内容
                          const acceptCell = t.accepted_at
                            ? <span style={{ color: '#16a34a' }}>{fmtDT(t.accepted_at)}</span>
                            : <span style={{ color: '#9ca3af' }}>-</span>
                          // 处理时间列：显示 started_at + 已用时
                          const calcProcessTime = () => {
                            if (!t.started_at) return null
                            const start = new Date(t.started_at).getTime()
                            const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now()
                            const diffMs = end - start
                            if (diffMs < 0) return null
                            const minutes = Math.floor(diffMs / 60000)
                            const hours = Math.floor(minutes / 60)
                            const mins = minutes % 60
                            if (hours >= 24) { const days = Math.floor(hours / 24); return `${days}天${hours%24}时${mins}分` }
                            if (hours > 0) return `${hours}时${mins}分`
                            return `${mins}分`
                          }
                          const processCell = t.started_at
                            ? <span style={{ color: '#2563eb', fontWeight: 500 }}>{calcProcessTime()}</span>
                            : <span style={{ color: t.status === 'pending' ? '#f59e0b' : '#9ca3af', fontWeight: t.status === 'pending' ? 600 : 400 }}>{t.status === 'pending' ? '未开始' : '-'}</span>
                          // 完成时间列
                          const completeCell = t.completed_at
                            ? <span style={{ color: '#16a34a' }}>{fmtDT(t.completed_at)}</span>
                            : <span style={{ color: '#9ca3af' }}>-</span>
                          // 行样式：到预约时间未完成标红
                          const rowCls = isDlOverdue ? 'card-overdue' : isDlUrgent ? 'card-urgent' : ''
                          return (
                            <tr key={t.id} className={rowCls}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{t.client}</div>
                                {t.ticket_no && <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.ticket_no}</div>}
                              </td>
                              <td><span className={`tag ${ti.cls}`}>{ti.label}</span></td>
                              {isAdmin && <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: m.color || '#6b7280', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{m.name ? m.name[0] : '?'}</div>
                                  <span>{m.name || '未分配'}</span>
                                </div>
                              </td>}
                              <td><span className={`tag ${si.cls}`}>{si.label}</span></td>
                              <td style={{ fontSize: 13 }}>{deadlineCell}</td>
                              <td style={{ fontSize: 13 }}>{acceptCell}</td>
                              <td style={{ fontSize: 13 }}>{processCell}</td>
                              <td style={{ fontSize: 13 }}>{completeCell}</td>
                              <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }} title={t.note || ''}>{t.note || '-'}</td>
                              <td>
                                <div className="action-group">
                                  {t.status === 'pending' && (isAdmin || t.member_id === profile.id) && (
                                    <button className="btn-icon" title={startingId === t.id ? '处理中...' : '开始处理'} style={{ color: startingId === t.id ? '#9ca3af' : '#2563eb' }} disabled={startingId === t.id} onClick={(e) => { e.stopPropagation(); startTicket(t) }}>
                                      {startingId === t.id
                                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                                    </button>
                                  )}
                                  {t.status !== 'done' && t.status !== 'urgent' && t.status !== 'pending' && (
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
                  ) : <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px 0' }}>暂无工单</div>
                })()}
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
              {/* 客户名称 — 突出显示 */}
              <div className="form-row">
                <label>客户名称 <span style={{ color: '#dc2626' }}>*</span></label>
                <input className="input-lg" value={form.client || ''} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="输入诊所名称" autoFocus />
              </div>
              {/* 基本信息两列 */}
              <div className="form-grid">
                <div className="form-row">
                  <label>工单类型</label>
                  <select value={form.type || 'init'} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <label>负责人 <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 12 }}>(可不填)</span></label>
                  <select value={form.member_id || ''} onChange={e => setForm({ ...form, member_id: e.target.value })}>
                    <option value="">待接单</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {form.member_id && (() => {
                    const m = members.find(m => m.id === form.member_id)
                    if (!m) return null
                    return <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{m.name[0]}</div>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{m.role}</span>
                    </div>
                  })()}
                </div>
              </div>
              {/* 时间和状态 */}
              <div className="form-grid">
                <div className="form-row">
                  <label>预约时间</label>
                  <input type="datetime-local" value={form.deadline || ''} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                </div>
                <div className="form-row">
                  <label>状态</label>
                  <select value={form.status || 'pending'} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              {/* 工单号 */}
              <div className="form-row">
                <label>七鱼工单号</label>
                <input value={form.ticket_no || ''} onChange={e => setForm({ ...form, ticket_no: e.target.value })} placeholder="如 QY20260407001" />
              </div>
              {/* 备注 */}
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
              <button className="btn btn-primary" onClick={saveMember} disabled={actionLoading === 'saveMember'}>{actionLoading === 'saveMember' ? '添加中...' : '添加'}</button>
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
            if (actionLocksRef.current.has('saveSettings')) return
            lockAction('saveSettings')
            try {
              await api('/settings', {
                method: 'PUT',
                body: JSON.stringify(newSettings)
              })
              setSettings(prev => ({ ...prev, ...newSettings }))
              setShowSettingsModal(false)
              showToast('✅ 设置已保存')
              silentPoll()
              unlockAction('saveSettings')
            } catch (err) {
              unlockAction('saveSettings')
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
              <button className="btn btn-primary" onClick={confirmCompleteTicket} disabled={completingTicket} style={{ minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {completingTicket ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 提交中...</> : '确认完成'}
              </button>
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
              <div className="dg-item"><span className="dg-label">负责人</span><span className="dg-value">{drawerTicket.member?.name || memberMap[drawerTicket.member_id]?.name || '未分配'}</span></div>
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
                <button className="btn btn-primary btn-sm" onClick={addLog} disabled={actionLoading === 'addLog'}>{actionLoading === 'addLog' ? '记录中...' : '记录'}</button>
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
                  disabled={completingTicket}
                >{completingTicket ? '完成中...' : '完成工单'}</button>
              )}
              {(isAdmin || drawerTicket.member_id === profile.id) && (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setShowDrawer(false); openEditTicket(drawerTicket) }}>编辑工单</button>
              )}
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowDrawer(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 提醒 */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10001,
          background: '#065f46', color: '#fff', padding: '10px 24px', borderRadius: 10,
          fontSize: 14, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          animation: 'slideInRight 0.3s ease-out',
        }}>
          {toast}
        </div>
      )}

      {/* 预约提醒弹窗（页面内） */}
      {remindAlerts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 10000, display: 'flex', flexDirection: 'column-reverse', gap: 10, maxWidth: 380 }}>
          {remindAlerts.map((a, i) => (
            <div key={a.id + i} style={{
              background: a.isOverdue ? '#fef2f2' : '#fffbeb',
              border: `2px solid ${a.isOverdue ? '#fca5a5' : '#fde68a'}`,
              borderRadius: 12,
              padding: '16px 20px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              animation: 'slideInRight 0.3s ease-out',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: a.isOverdue ? '#dc2626' : '#b45309' }}>
                  {a.type === 'urge' ? '🚨 催促处理' : (a.isOverdue ? '🔴 已过期' : '⏰ 即将到期')}
                </span>
                <button
                  onClick={() => setRemindAlerts(prev => prev.filter(x => !(x.id === a.id && prev.indexOf(x) === i)))}
                  style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1 }}
                >×</button>
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{a.msg}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
