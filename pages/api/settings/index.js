import { getUserMember } from '@/lib/helpers'
import { getAll, addToList, updateById, removeById, findBy, KEYS, genId } from '@/lib/db'

// 默认配置（首次使用时初始化）
const DEFAULT_TYPES = [
  { id: 'init', label: '数据初始化', service: '数据初始化', cls: 'tag-init' },
  { id: 'training', label: '培训', service: '系统培训', cls: 'tag-training' },
  { id: 'insurance', label: '医保对接', service: '医保对接', cls: 'tag-insurance' },
  { id: 'followup', label: '跟进', service: '上线验收', cls: 'tag-followup' },
  { id: 'other', label: '其他', service: '', cls: 'tag-other' },
]

const DEFAULT_SERVICES = ['数据初始化', '医保对接', '系统培训', '上线验收']

// 配置存储 key
const SETTINGS_KEY = 'kanban:settings'

// 获取或初始化配置
async function getSettings() {
  let settings = await findBy(SETTINGS_KEY, 'id', 'default')
  if (!settings) {
    settings = {
      id: 'default',
      types: DEFAULT_TYPES,
      services: DEFAULT_SERVICES,
    }
    await addToList(SETTINGS_KEY, settings)
  }
  return settings
}

export default async function handler(req, res) {
  const member = await getUserMember(req)
  if (!member) return res.status(401).json({ error: '未授权' })

  if (req.method === 'GET') {
    const settings = await getSettings()
    return res.json({ success: true, data: settings })
  }

  if (req.method === 'PUT') {
    if (!member.is_admin) return res.status(403).json({ error: '仅组长可修改' })

    const { types, services } = req.body
    const settings = await getSettings()

    // 更新类型
    if (types) {
      // 校验：每个类型必须有 id 和 label
      const validTypes = types.filter(t => t.id && t.label)
      settings.types = validTypes
    }

    // 更新服务进度
    if (Array.isArray(services)) {
      settings.services = services.filter(s => s.trim())
    }

    const data = await updateById(SETTINGS_KEY, 'default', settings)
    return res.json({ success: true, data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
