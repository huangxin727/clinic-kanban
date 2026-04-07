import { cachedHandler, getUserMember } from '@/lib/helpers'
import { getAll, addToList, updateById, removeById, KEYS, genId, findBy } from '@/lib/db'

export default cachedHandler(async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const data = await getAll(KEYS.MEMBERS)
    // 按创建时间排序
    data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return res.json({ success: true, data })
  }

  if (req.method === 'POST') {
    if (!member.is_admin) return res.status(403).json({ error: '仅组长可操作' })

    const { name, role, status, color, email } = req.body
    if (!name) return res.status(400).json({ error: '请填写姓名' })

    const newMember = {
      id: 'm_' + genId(),
      name,
      role: role || '全能',
      status: status || 'free',
      color: color || '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
      is_admin: false,
      created_at: new Date().toISOString(),
    }
    await addToList(KEYS.MEMBERS, newMember)
    return res.json({ success: true, data: newMember })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
