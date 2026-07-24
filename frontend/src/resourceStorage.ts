export const RESOURCE_CATEGORIES = ['招聘平台', '企业官网', '校招信息'] as const

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

export type JobResource = {
  id: string
  name: string
  url: string
  category?: ResourceCategory
  note?: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'applyboard.job-resources.v1'

export const defaultJobResources: JobResource[] = [
  {
    id: 'resource-iguopin',
    name: '国聘',
    url: 'https://www.iguopin.com/',
    category: '招聘平台',
    note: '央企、国企及社会招聘信息',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
  {
    id: 'resource-zhaopin',
    name: '智联招聘',
    url: 'https://www.zhaopin.com/',
    category: '招聘平台',
    note: '综合招聘平台',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
  {
    id: 'resource-tencent',
    name: '腾讯招聘',
    url: 'https://careers.tencent.com/zh-cn/',
    category: '企业官网',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
  {
    id: 'resource-bytedance',
    name: '字节跳动校园招聘',
    url: 'https://jobs.bytedance.com/campus/',
    category: '企业官网',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
  {
    id: 'resource-alibaba',
    name: '阿里巴巴集团招聘',
    url: 'https://talent.alibaba.com/',
    category: '企业官网',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
  {
    id: 'resource-meituan',
    name: '美团招聘',
    url: 'https://zhaopin.meituan.com/web/position?hiringType=1_1',
    category: '企业官网',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
]

function looksLikeJobResource(value: unknown): value is JobResource {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.url === 'string' &&
    (row.category === undefined ||
      RESOURCE_CATEGORIES.includes(row.category as ResourceCategory)) &&
    (row.note === undefined || typeof row.note === 'string') &&
    typeof row.createdAt === 'string' &&
    typeof row.updatedAt === 'string'
  )
}

export function loadJobResourcesFromStorage(): JobResource[] | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(looksLikeJobResource)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveJobResourcesToStorage(resources: JobResource[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resources))
  } catch {
    window.alert('网址保存失败，可能是浏览器本地存储空间不足。')
  }
}
