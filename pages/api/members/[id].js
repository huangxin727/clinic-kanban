import { cachedHandler, getUser, getUserMember } from '@/lib/helpers'
import { updateById, removeById, findBy, KEYS } from '@/lib/db'

export default cachedHandler(async function handler(req, res) {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: '未授权' })

  const me = await findBy(KEYS.MEMBERS, 'user_id', user.id)
  if (!me) return res.status(401).json({ error: '未授权' })

  const { id } = req.query

  if (req.method === 'PUT') {
    const updates = {}
    if (req.body.name) updates.name = req.body.name
    if (req.body.role) updates.role = req.body.role
    if (req.body.status) updates.status = req.body.status
    if (req.body.color) updates.color = req.body.color

    const data = await updateById(KEYS.MEMBERS, id, updates)
    if (!data) return res.status(404).json({ error: '组员不存在' })
    return res.json({ success: true, data })
  }

  if (req.method === 'DELETE') {
    if (!me.is_admin) return res.status(403).json({ error: '仅组长可删除' })

    const ok = await removeById(KEYS.MEMBERS, id)
    if (!ok) return res.status(404).json({ error: '组员不存在' })
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
