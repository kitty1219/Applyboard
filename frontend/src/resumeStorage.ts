import type { ResumeProfile } from './types'

const STORAGE_KEY = 'applyboard.resumes.v1'

function looksLikeResume(value: unknown): value is ResumeProfile {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.category === 'string' &&
    typeof row.usedCount === 'number' &&
    typeof row.lastUsed === 'string'
  )
}

export function loadResumesFromStorage(): ResumeProfile[] | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(looksLikeResume)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveResumesToStorage(resumes: ResumeProfile[]): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resumes))
  } catch {
    window.alert('简历文件保存失败，可能是浏览器本地存储空间不足。可以删除较大的旧简历后再试。')
  }
}
