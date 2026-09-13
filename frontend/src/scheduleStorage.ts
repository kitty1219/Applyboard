export const SCHEDULE_PERIODS = ['上午', '下午', '晚上'] as const
export const SCHEDULE_BLOCK_TYPES = ['面试', '笔试', '准备', '个人安排', '其他'] as const

export type SchedulePeriod = (typeof SCHEDULE_PERIODS)[number]
export type ScheduleBlockType = (typeof SCHEDULE_BLOCK_TYPES)[number]

export type ScheduleBlock = {
  id: string
  title: string
  date: string
  period: SchedulePeriod
  type: ScheduleBlockType
  exactTime?: string
  applicationId?: string
  note?: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'applyboard.schedule-blocks.v1'

export function looksLikeScheduleBlock(value: unknown): value is ScheduleBlock {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.title === 'string' &&
    typeof row.date === 'string' &&
    SCHEDULE_PERIODS.includes(row.period as SchedulePeriod) &&
    SCHEDULE_BLOCK_TYPES.includes(row.type as ScheduleBlockType) &&
    (row.exactTime === undefined || typeof row.exactTime === 'string') &&
    (row.applicationId === undefined || typeof row.applicationId === 'string') &&
    (row.note === undefined || typeof row.note === 'string') &&
    typeof row.createdAt === 'string' &&
    typeof row.updatedAt === 'string'
  )
}

export function loadScheduleBlocksFromStorage(): ScheduleBlock[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every(looksLikeScheduleBlock) ? parsed : []
  } catch {
    return []
  }
}

export function saveScheduleBlocksToStorage(blocks: ScheduleBlock[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks))
  } catch {
    window.alert('日程保存失败，可能是浏览器本地存储空间不足。')
  }
}
