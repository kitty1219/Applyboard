import type { Application } from './types'

const STORAGE_KEY = 'applyboard.applications.v1'

function looksLikeApplication(value: unknown): value is Application {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.company === 'string' &&
    typeof row.position === 'string' &&
    typeof row.link === 'string' &&
    typeof row.currentStage === 'string' &&
    typeof row.stageMeta === 'object' &&
    row.stageMeta !== null &&
    typeof row.createdAt === 'string' &&
    typeof row.updatedAt === 'string'
  )
}

/** 无本地存档时返回 null；存档为空数组则返回 [] */
export function loadApplicationsFromStorage(): Application[] | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return null
    }
    if (parsed.length === 0) {
      return []
    }
    if (!parsed.every(looksLikeApplication)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveApplicationsToStorage(applications: Application[]): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(applications))
  } catch {
    // 配额满或隐私模式等：静默失败，不影响当前会话操作
  }
}
