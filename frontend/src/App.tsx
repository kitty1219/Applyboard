import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { loadApplicationsFromStorage, saveApplicationsToStorage } from './applicationStorage'
import {
  deleteCloudApplication,
  deleteCloudResource,
  deleteCloudResume,
  loadCloudData,
  syncCloudData,
  type CloudData,
} from './cloudStorage'
import { mockApplications, mockResumes } from './mockData'
import ResourceLibraryPanel from './ResourceLibraryPanel'
import {
  defaultJobResources,
  loadJobResourcesFromStorage,
  saveJobResourcesToStorage,
} from './resourceStorage'
import { loadResumesFromStorage, saveResumesToStorage } from './resumeStorage'
import { isSupabaseConfigured, supabase } from './supabase'
import type { Application, ApplicationStage, MainStage, ResumeProfile, StageMeta, ViewMode } from './types'
import { MAIN_STAGE_OPTIONS, PROGRESS_AXIS_STEPS, STAGE_OPTIONS } from './types'
import {
  formatDateTime,
  getCurrentKeyTime,
  getCurrentStageLabel,
  getDetailedStageLabel,
  getMainStage,
  getPriorityItems,
  getProgressStepIndex,
  getRelevantTime,
  getRiskBadges,
  groupApplicationsByMainStage,
} from './utils'

type DrawerFormState = {
  company: string
  position: string
  link: string
  currentStage: ApplicationStage
  jdNote: string
  resumeVersion: string
  stageMeta: StageMeta
}

type ResumeUploadFormState = {
  name: string
  category: string
  note: string
  file: File | null
}

type ApplicationDetailFormState = {
  company: string
  position: string
  link: string
  resumeVersion: string
  jdNote: string
}

type StageFieldConfig = {
  key: keyof StageMeta
  label: string
  required?: boolean
}

type CanvasDragState = {
  pointerId: number | null
  startX: number
  startScrollLeft: number
}

type CreatedTimeFilter = 'all' | 'today' | '7days' | '30days' | 'custom'
type KeyTimeFilter = 'all' | 'today' | 'next3days' | 'next7days' | 'overdue' | 'unset' | 'custom'
type ListSortOption =
  | 'default'
  | 'updated-desc'
  | 'updated-asc'
  | 'keytime-asc'
  | 'keytime-desc'
  | 'progress-desc'
  | 'progress-asc'
  | 'risk-desc'
  | 'risk-asc'
type SortableListColumn = 'keytime' | 'risk' | 'progress' | 'updated'

const viewModes: ViewMode[] = ['看板视图', '列表视图']
const LIST_FILTER_REFERENCE_TIME = Date.now()
const listTableColumns: {
  title: string
  sortColumn?: SortableListColumn
  widthClass: string
}[] = [
  { title: '公司名称', widthClass: 'min-w-[140px]' },
  { title: '岗位名称', widthClass: 'min-w-[130px]' },
  { title: '招聘链接', widthClass: 'min-w-[78px]' },
  { title: '当前大阶段', widthClass: 'min-w-[90px]' },
  { title: '当前具体节点', widthClass: 'min-w-[100px]' },
  { title: '当前关键时间', sortColumn: 'keytime', widthClass: 'min-w-[135px]' },
  { title: '使用简历版本', widthClass: 'min-w-[145px]' },
  { title: '风险提醒', sortColumn: 'risk', widthClass: 'min-w-[90px]' },
  { title: '流程进度', sortColumn: 'progress', widthClass: 'min-w-[230px]' },
  { title: '最近更新时间', sortColumn: 'updated', widthClass: 'min-w-[100px]' },
  { title: '操作', widthClass: 'min-w-[90px]' },
]

const listSortCycle: Record<SortableListColumn, [ListSortOption, ListSortOption]> = {
  keytime: ['keytime-asc', 'keytime-desc'],
  risk: ['risk-desc', 'risk-asc'],
  progress: ['progress-desc', 'progress-asc'],
  updated: ['updated-desc', 'updated-asc'],
}

const toneClassMap: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200/70',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200/70',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200/70',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200/70',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70',
}

// Main-stage color accents (small, semantic color per stage)
const mainStageAccent: Record<string, { dot: string; chip: string; text: string }> = {
  待投递: { dot: 'bg-slate-400', chip: 'bg-slate-100', text: 'text-slate-700' },
  已投递: { dot: 'bg-sky-500', chip: 'bg-sky-50', text: 'text-sky-700' },
  笔试中: { dot: 'bg-amber-500', chip: 'bg-amber-50', text: 'text-amber-700' },
  面试中: { dot: 'bg-violet-500', chip: 'bg-violet-50', text: 'text-violet-700' },
  'Offer中': { dot: 'bg-emerald-500', chip: 'bg-emerald-50', text: 'text-emerald-700' },
  已结束: { dot: 'bg-slate-300', chip: 'bg-slate-50', text: 'text-slate-500' },
}

function getMainStageAccent(mainStage: string) {
  return mainStageAccent[mainStage] ?? mainStageAccent['待投递']
}

const priorityAccentBar: Record<string, string> = {
  rose: 'bg-rose-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  blue: 'bg-sky-400',
  slate: 'bg-slate-300',
}

function getDayStart(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

function getDayEnd(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1).getTime() - 1
}

function getDateInputStart(value: string): number | null {
  if (!value) {
    return null
  }
  return new Date(`${value}T00:00:00`).getTime()
}

function getDateInputEnd(value: string): number | null {
  if (!value) {
    return null
  }
  return new Date(`${value}T23:59:59.999`).getTime()
}

function isTimestampInRange(timestamp: number, start: number | null, end: number | null) {
  return (start === null || timestamp >= start) && (end === null || timestamp <= end)
}

function compareResumesByCreatedAt(first: ResumeProfile, second: ResumeProfile): number {
  const getCreatedTime = (resume: ResumeProfile) => {
    const value = resume.createdAt ?? resume.updatedAt ?? resume.lastUsed
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? 0 : time
  }

  const createdAtDifference = getCreatedTime(second) - getCreatedTime(first)
  return createdAtDifference || first.id.localeCompare(second.id)
}

function getRiskPriority(application: Application) {
  const tonePriority: Record<string, number> = {
    rose: 3,
    amber: 2,
    slate: 1,
    emerald: 0,
  }
  return Math.max(0, ...getRiskBadges(application).map((badge) => tonePriority[badge.tone] ?? 0))
}

function compareOptionalNumbers(
  first: number | null,
  second: number | null,
  direction: 'asc' | 'desc',
) {
  if (first === null && second === null) {
    return 0
  }
  if (first === null) {
    return 1
  }
  if (second === null) {
    return -1
  }
  return direction === 'asc' ? first - second : second - first
}

const IconSearch = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

const IconPlus = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const IconUpload = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
    <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </svg>
)

const IconClose = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

const IconTrash = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)

const IconExternal = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h6v6" />
    <path d="m10 14 11-11" />
    <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
  </svg>
)

const IconUser = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
)

const IconBriefcase = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </svg>
)

const IconSpark = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconFile = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h4" />
  </svg>
)

const initialFormState: DrawerFormState = {
  company: '',
  position: '',
  link: '',
  currentStage: '待投递',
  jdNote: '',
  resumeVersion: '',
  stageMeta: {},
}

const initialResumeUploadState: ResumeUploadFormState = {
  name: '',
  category: '',
  note: '',
  file: null,
}

function createApplicationDetailForm(application: Application): ApplicationDetailFormState {
  return {
    company: application.company,
    position: application.position,
    link: application.link,
    resumeVersion: application.resumeVersion ?? '',
    jdNote: application.jdNote ?? '',
  }
}

function getStageFieldConfigs(stage: ApplicationStage): StageFieldConfig[] {
  switch (stage) {
    case '待投递':
      return [{ key: 'applyDeadline', label: '投递截止时间', required: true }]
    case '已投递':
      return []
    case '测评中':
      return [{ key: 'assessmentDeadline', label: '测评截止时间', required: true }]
    case '笔试1':
      return [
        { key: 'test1Time', label: '笔试1时间' },
        { key: 'test1Deadline', label: '笔试1截止时间' },
      ]
    case '笔试2':
      return [
        { key: 'test2Time', label: '笔试2时间' },
        { key: 'test2Deadline', label: '笔试2截止时间' },
      ]
    case '一面':
      return [{ key: 'interview1Time', label: '一面时间', required: true }]
    case '二面':
      return [{ key: 'interview2Time', label: '二面时间', required: true }]
    case '三面':
      return [{ key: 'interview3Time', label: '三面时间', required: true }]
    case 'HR面':
      return [{ key: 'hrInterviewTime', label: 'HR面时间', required: true }]
    case 'Offer':
      return [{ key: 'offerConfirmTime', label: 'Offer确认时间' }]
    case '背调中':
      return [{ key: 'bgCheckDeadline', label: '背调截止时间' }]
    case '已通过':
    case '已淘汰':
    case '已放弃':
      return []
  }
}

function toInputValue(value?: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const pad = (input: number) => `${input}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function createApplicationFromForm(form: DrawerFormState): Application {
  const now = new Date().toISOString()

  return {
    id: `app-${crypto.randomUUID()}`,
    company: form.company.trim(),
    position: form.position.trim(),
    link: form.link.trim(),
    currentStage: form.currentStage,
    stageMeta: form.stageMeta,
    jdNote: form.jdNote.trim(),
    resumeVersion: form.resumeVersion.trim(),
    createdAt: now,
    updatedAt: now,
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('无法读取文件内容'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('无法读取文件内容'))
    reader.readAsDataURL(file)
  })
}

function formatFileSize(size?: number): string {
  if (!size) {
    return '未记录'
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function App() {
  const [initialLocalData] = useState(() => ({
    applications: loadApplicationsFromStorage(),
    resumes: loadResumesFromStorage(),
    resources: loadJobResourcesFromStorage(),
  }))
  const [viewMode, setViewMode] = useState<ViewMode>('看板视图')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMainStages, setSelectedMainStages] = useState<MainStage[]>([])
  const [createdTimeFilter, setCreatedTimeFilter] = useState<CreatedTimeFilter>('all')
  const [createdDateStart, setCreatedDateStart] = useState('')
  const [createdDateEnd, setCreatedDateEnd] = useState('')
  const [keyTimeFilter, setKeyTimeFilter] = useState<KeyTimeFilter>('all')
  const [keyDateStart, setKeyDateStart] = useState('')
  const [keyDateEnd, setKeyDateEnd] = useState('')
  const [selectedResumeVersions, setSelectedResumeVersions] = useState<string[]>([])
  const [listSortOption, setListSortOption] = useState<ListSortOption>('default')
  const boardScrollRef = useRef<HTMLDivElement | null>(null)
  const boardDragStateRef = useRef<CanvasDragState>({
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
  })
  const [isBoardDragging, setIsBoardDragging] = useState(false)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const listDragStateRef = useRef<CanvasDragState>({
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
  })
  const [isListDragging, setIsListDragging] = useState(false)
  const [applications, setApplications] = useState<Application[]>(
    () => initialLocalData.applications ?? mockApplications,
  )

  useEffect(() => {
    saveApplicationsToStorage(applications)
  }, [applications])
  const [resumes, setResumes] = useState<ResumeProfile[]>(
    () => initialLocalData.resumes ?? mockResumes,
  )

  useEffect(() => {
    saveResumesToStorage(resumes)
  }, [resumes])
  const [resources, setResources] = useState(
    () => initialLocalData.resources ?? defaultJobResources,
  )

  useEffect(() => {
    saveJobResourcesToStorage(resources)
  }, [resources])
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [isCloudReady, setIsCloudReady] = useState(false)
  const [isCloudLoading, setIsCloudLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle')
  const syncTimerRef = useRef<number | null>(null)
  const remoteReloadTimerRef = useRef<number | null>(null)
  const lastSyncedDataRef = useRef<{
    applications: Application[]
    resumes: ResumeProfile[]
    resources: typeof resources
  } | null>(null)
  const isApplyingCloudRef = useRef(false)
  const isSyncInFlightRef = useRef(false)
  const hasPendingLocalChangesRef = useRef(false)
  const localChangeVersionRef = useRef(0)
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve())
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isResumeUploadModalOpen, setIsResumeUploadModalOpen] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [selectedResume, setSelectedResume] = useState<ResumeProfile | null>(null)
  const [resumeUploadForm, setResumeUploadForm] = useState<ResumeUploadFormState>(initialResumeUploadState)
  const [isSavingResume, setIsSavingResume] = useState(false)
  const [formState, setFormState] = useState<DrawerFormState>(initialFormState)
  const [statusEditor, setStatusEditor] = useState<{
    applicationId: string | null
    stage: ApplicationStage
    stageMeta: StageMeta
  }>({
    applicationId: null,
    stage: '待投递',
    stageMeta: {},
  })

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setIsAuthLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setIsAuthLoading(false)
      if (!nextSession) {
        setIsCloudReady(false)
        setIsCloudLoading(false)
        setSyncStatus('idle')
        lastSyncedDataRef.current = null
        hasPendingLocalChangesRef.current = false
        localChangeVersionRef.current = 0
      }
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        setIsLoginModalOpen(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const sessionUserId = session?.user.id

  useEffect(() => {
    if (!sessionUserId) {
      return
    }

    let active = true
    const userId = sessionUserId

    async function initializeCloudData() {
      setIsCloudLoading(true)
      setIsCloudReady(false)
      setSyncStatus('syncing')

      try {
        const cloudData = await loadCloudData(userId)
        if (!active) {
          return
        }

        lastSyncedDataRef.current = cloudData
        setApplications(cloudData.applications)
        setResumes(cloudData.resumes)
        setResources(cloudData.resources)

        setSyncStatus('saved')
        setIsCloudReady(true)
      } catch (error) {
        if (active) {
          setSyncStatus('error')
          setAuthError(error instanceof Error ? error.message : '云端数据读取失败')
        }
      } finally {
        if (active) {
          setIsCloudLoading(false)
        }
      }
    }

    void initializeCloudData()
    return () => {
      active = false
    }
  }, [sessionUserId])

  useEffect(() => {
    if (!session || !isCloudReady) {
      return
    }

    if (isApplyingCloudRef.current) {
      isApplyingCloudRef.current = false
      return
    }

    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current)
    }

    hasPendingLocalChangesRef.current = true
    const snapshotVersion = localChangeVersionRef.current + 1
    localChangeVersionRef.current = snapshotVersion
    const snapshot = { applications, resumes, resources }
    syncTimerRef.current = window.setTimeout(() => {
      setSyncStatus('syncing')
      syncQueueRef.current = syncQueueRef.current
        .then(async () => {
          isSyncInFlightRef.current = true
          const previousData = lastSyncedDataRef.current ?? {
            applications: [],
            resumes: [],
            resources: [],
          }
          await syncCloudData(session.user.id, snapshot, previousData)
          lastSyncedDataRef.current = snapshot
        })
        .then(() => {
          if (localChangeVersionRef.current === snapshotVersion) {
            hasPendingLocalChangesRef.current = false
          }
          setSyncStatus('saved')
          void realtimeChannelRef.current?.send({
            type: 'broadcast',
            event: 'refresh',
            payload: {},
          })
        })
        .catch((error: unknown) => {
          setSyncStatus('error')
          setAuthError(error instanceof Error ? error.message : '云端同步失败')
        })
        .finally(() => {
          isSyncInFlightRef.current = false
        })
    }, 700)

    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current)
      }
    }
  }, [applications, isCloudReady, resources, resumes, session])

  useEffect(() => {
    if (!session || !isCloudReady) {
      return
    }

    let active = true
    const userId = session.user.id

    function scheduleCloudReload() {
      if (remoteReloadTimerRef.current !== null) {
        window.clearTimeout(remoteReloadTimerRef.current)
      }
      remoteReloadTimerRef.current = window.setTimeout(() => {
        if (isSyncInFlightRef.current || hasPendingLocalChangesRef.current) {
          return
        }

        void loadCloudData(userId)
          .then((cloudData) => {
            if (!active) {
              return
            }
            isApplyingCloudRef.current = true
            hasPendingLocalChangesRef.current = false
            lastSyncedDataRef.current = cloudData
            setApplications(cloudData.applications)
            setResumes(cloudData.resumes)
            setResources(cloudData.resources)
            setSyncStatus('saved')
          })
          .catch((error: unknown) => {
            if (active) {
              setSyncStatus('error')
              setAuthError(error instanceof Error ? error.message : '实时数据刷新失败')
            }
          })
      }, 450)
    }

    const filter = `user_id=eq.${userId}`
    const channel = supabase
      .channel(`applyboard-${userId}`, { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'refresh' }, scheduleCloudReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'applications', filter }, scheduleCloudReload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applications', filter }, scheduleCloudReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'resumes', filter }, scheduleCloudReload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'resumes', filter }, scheduleCloudReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_resources', filter }, scheduleCloudReload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'job_resources', filter }, scheduleCloudReload)
      .subscribe()
    realtimeChannelRef.current = channel

    return () => {
      active = false
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null
      }
      if (remoteReloadTimerRef.current !== null) {
        window.clearTimeout(remoteReloadTimerRef.current)
      }
      void supabase.removeChannel(channel)
    }
  }, [isCloudReady, session])

  async function handleSignIn(email: string, password: string) {
    setIsAuthBusy(true)
    setAuthError('')
    setAuthMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setIsAuthBusy(false)
    if (error) {
      setAuthError(error.message)
      return
    }
    setAuthMessage('登录成功，正在读取云端数据。')
  }

  async function handleSignUp(email: string, password: string) {
    setIsAuthBusy(true)
    setAuthError('')
    setAuthMessage('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    setIsAuthBusy(false)
    if (error) {
      setAuthError(error.message)
      return
    }
    setAuthMessage(
      data.session ? '注册并登录成功。' : '注册成功，请前往邮箱点击验证链接后再登录。',
    )
  }

  async function handleResetPassword(email: string) {
    if (!email) {
      setAuthError('请先填写邮箱地址。')
      return
    }
    setIsAuthBusy(true)
    setAuthError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setIsAuthBusy(false)
    if (error) {
      setAuthError(error.message)
      return
    }
    setAuthMessage('密码重置邮件已发送，请检查邮箱。')
  }

  async function handleSignOut() {
    setIsAuthBusy(true)
    setAuthError('')
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    setIsAuthBusy(false)
    if (error) {
      setAuthError(error.message)
      return
    }
    setIsLoginModalOpen(false)
    setAuthMessage('')
  }

  async function handleUpdatePassword(password: string) {
    setIsAuthBusy(true)
    setAuthError('')
    const { error } = await supabase.auth.updateUser({ password })
    setIsAuthBusy(false)
    if (error) {
      setAuthError(error.message)
      return
    }
    setIsPasswordRecovery(false)
    setAuthMessage('密码已更新。')
  }

  const filteredApplications = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) {
      return applications
    }

    return applications.filter((application) =>
      [application.company, application.position, application.jdNote, application.resumeVersion]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [applications, searchTerm])

  const displayedResumes = useMemo(
    () => [...resumes].sort(compareResumesByCreatedAt),
    [resumes],
  )

  const availableResumeVersions = useMemo(
    () =>
      Array.from(
        new Set(applications.map((application) => application.resumeVersion?.trim() || '未指定')),
      ).sort((first, second) => first.localeCompare(second, 'zh-CN')),
    [applications],
  )

  const activeListFilterCount =
    (selectedMainStages.length > 0 ? 1 : 0) +
    (createdTimeFilter !== 'all' ? 1 : 0) +
    (keyTimeFilter !== 'all' ? 1 : 0) +
    (selectedResumeVersions.length > 0 ? 1 : 0)

  const listApplications = useMemo(() => {
    const now = LIST_FILTER_REFERENCE_TIME
    const referenceDate = new Date(LIST_FILTER_REFERENCE_TIME)
    const todayStart = getDayStart(referenceDate)
    const todayEnd = getDayEnd(referenceDate)

    const result = filteredApplications.filter((application) => {
      if (
        selectedMainStages.length > 0 &&
        !selectedMainStages.includes(getMainStage(application.currentStage))
      ) {
        return false
      }

      const createdAt = new Date(application.createdAt).getTime()
      if (createdTimeFilter === 'today' && !isTimestampInRange(createdAt, todayStart, todayEnd)) {
        return false
      }
      if (createdTimeFilter === '7days' && createdAt < todayStart - 6 * 24 * 60 * 60 * 1000) {
        return false
      }
      if (createdTimeFilter === '30days' && createdAt < todayStart - 29 * 24 * 60 * 60 * 1000) {
        return false
      }
      if (
        createdTimeFilter === 'custom' &&
        !isTimestampInRange(
          createdAt,
          getDateInputStart(createdDateStart),
          getDateInputEnd(createdDateEnd),
        )
      ) {
        return false
      }

      const relevantTime = getRelevantTime(application)
      const keyTimestamp = relevantTime ? new Date(relevantTime).getTime() : null
      if (keyTimeFilter === 'unset' && keyTimestamp !== null) {
        return false
      }
      if (keyTimeFilter !== 'all' && keyTimeFilter !== 'unset' && keyTimestamp === null) {
        return false
      }
      if (
        keyTimeFilter === 'today' &&
        keyTimestamp !== null &&
        !isTimestampInRange(keyTimestamp, todayStart, todayEnd)
      ) {
        return false
      }
      if (
        keyTimeFilter === 'next3days' &&
        keyTimestamp !== null &&
        !isTimestampInRange(keyTimestamp, now, todayEnd + 2 * 24 * 60 * 60 * 1000)
      ) {
        return false
      }
      if (
        keyTimeFilter === 'next7days' &&
        keyTimestamp !== null &&
        !isTimestampInRange(keyTimestamp, now, todayEnd + 6 * 24 * 60 * 60 * 1000)
      ) {
        return false
      }
      if (keyTimeFilter === 'overdue' && keyTimestamp !== null && keyTimestamp >= now) {
        return false
      }
      if (
        keyTimeFilter === 'custom' &&
        keyTimestamp !== null &&
        !isTimestampInRange(
          keyTimestamp,
          getDateInputStart(keyDateStart),
          getDateInputEnd(keyDateEnd),
        )
      ) {
        return false
      }

      const resumeVersion = application.resumeVersion?.trim() || '未指定'
      return (
        selectedResumeVersions.length === 0 ||
        selectedResumeVersions.includes(resumeVersion)
      )
    })

    if (listSortOption === 'default') {
      return result
    }

    return [...result].sort((first, second) => {
      switch (listSortOption) {
        case 'updated-desc':
          return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
        case 'updated-asc':
          return new Date(first.updatedAt).getTime() - new Date(second.updatedAt).getTime()
        case 'keytime-asc':
        case 'keytime-desc': {
          const firstTime = getRelevantTime(first)
          const secondTime = getRelevantTime(second)
          return compareOptionalNumbers(
            firstTime ? new Date(firstTime).getTime() : null,
            secondTime ? new Date(secondTime).getTime() : null,
            listSortOption === 'keytime-asc' ? 'asc' : 'desc',
          )
        }
        case 'progress-desc':
          return getProgressStepIndex(second.currentStage) - getProgressStepIndex(first.currentStage)
        case 'progress-asc':
          return getProgressStepIndex(first.currentStage) - getProgressStepIndex(second.currentStage)
        case 'risk-desc':
          return getRiskPriority(second) - getRiskPriority(first)
        case 'risk-asc':
          return getRiskPriority(first) - getRiskPriority(second)
        default:
          return 0
      }
    })
  }, [
    createdDateEnd,
    createdDateStart,
    createdTimeFilter,
    filteredApplications,
    keyDateEnd,
    keyDateStart,
    keyTimeFilter,
    listSortOption,
    selectedMainStages,
    selectedResumeVersions,
  ])

  function clearListFilters() {
    setSelectedMainStages([])
    setCreatedTimeFilter('all')
    setCreatedDateStart('')
    setCreatedDateEnd('')
    setKeyTimeFilter('all')
    setKeyDateStart('')
    setKeyDateEnd('')
    setSelectedResumeVersions([])
  }

  function toggleMainStage(stage: MainStage) {
    setSelectedMainStages((current) =>
      current.includes(stage) ? current.filter((item) => item !== stage) : [...current, stage],
    )
  }

  function toggleResumeVersion(version: string) {
    setSelectedResumeVersions((current) =>
      current.includes(version)
        ? current.filter((item) => item !== version)
        : [...current, version],
    )
  }

  function cycleListSort(column: SortableListColumn) {
    const [primarySort, secondarySort] = listSortCycle[column]
    setListSortOption((current) => {
      if (current === primarySort) {
        return secondarySort
      }
      if (current === secondarySort) {
        return 'default'
      }
      return primarySort
    })
  }

  function getListSortDirection(column: SortableListColumn): 'asc' | 'desc' | null {
    if (!listSortOption.startsWith(`${column}-`)) {
      return null
    }
    return listSortOption.endsWith('-asc') ? 'asc' : 'desc'
  }

  const groupedApplications = useMemo(
    () => groupApplicationsByMainStage(filteredApplications),
    [filteredApplications],
  )

  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedApplicationId) ?? null,
    [applications, selectedApplicationId],
  )

  const priorityItems = useMemo(
    () => getPriorityItems(filteredApplications),
    [filteredApplications],
  )
  const topPriorityItem = priorityItems[0] ?? null

  const dashboardStats = useMemo(
    () => [
      { label: '申请总数', value: `${filteredApplications.length}` },
      {
        label: '进行中',
        value: `${filteredApplications.filter((item) => getMainStage(item.currentStage) !== '已结束').length}`,
      },
      {
        label: '高优先提醒',
        value: `${priorityItems.filter((item) => item.level === '高').length}`,
      },
    ],
    [filteredApplications, priorityItems],
  )

  const currentStatusDraft =
    selectedApplication && statusEditor.applicationId === selectedApplication.id
      ? statusEditor.stage
      : selectedApplication?.currentStage ?? '待投递'
  const currentStatusStageMeta =
    selectedApplication && statusEditor.applicationId === selectedApplication.id
      ? statusEditor.stageMeta
      : selectedApplication?.stageMeta ?? {}
  const dynamicFields = getStageFieldConfigs(formState.currentStage)
  const statusDynamicFields = getStageFieldConfigs(currentStatusDraft)

  function updateFormField<Key extends keyof DrawerFormState>(
    key: Key,
    value: DrawerFormState[Key],
  ) {
    setFormState((current) => ({ ...current, [key]: value }))
  }

  function updateStageMeta(key: keyof StageMeta, value: string) {
    setFormState((current) => ({
      ...current,
      stageMeta: {
        ...current.stageMeta,
        [key]: value ? new Date(value).toISOString() : undefined,
      },
    }))
  }

  function updateStatusEditorMeta(key: keyof StageMeta, value: string) {
    setStatusEditor((current) => ({
      ...current,
      stageMeta: {
        ...current.stageMeta,
        [key]: value ? new Date(value).toISOString() : undefined,
      },
    }))
  }

  function openCreateDrawer() {
    setFormState(initialFormState)
    setIsDrawerOpen(true)
  }

  function openApplicationDetail(applicationId: string) {
    setSelectedApplicationId(applicationId)
    const targetApplication = applications.find((application) => application.id === applicationId)
    if (targetApplication) {
      setStatusEditor({
        applicationId,
        stage: targetApplication.currentStage,
        stageMeta: targetApplication.stageMeta,
      })
    }
  }

  function updateApplicationStage(
    applicationId: string,
    nextStage: ApplicationStage,
    nextStageMeta: StageMeta,
  ) {
    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              currentStage: nextStage,
              stageMeta: nextStageMeta,
              updatedAt: new Date().toISOString(),
            }
          : application,
      ),
    )
  }

  function updateApplicationDetails(
    applicationId: string,
    nextDetails: ApplicationDetailFormState,
  ) {
    const company = nextDetails.company.trim()
    const position = nextDetails.position.trim()
    const link = nextDetails.link.trim()
    const resumeVersion = nextDetails.resumeVersion.trim()
    const jdNote = nextDetails.jdNote.trim()

    if (!company || !position || !link) {
      window.alert('公司名称、岗位名称和招聘链接不能为空。')
      return
    }

    const now = new Date().toISOString()
    const previousApplication = applications.find((application) => application.id === applicationId)

    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              company,
              position,
              link,
              resumeVersion,
              jdNote,
              updatedAt: now,
            }
          : application,
      ),
    )

    if (resumeVersion && previousApplication?.resumeVersion !== resumeVersion) {
      setResumes((current) =>
        current.map((resume) =>
          resume.name === resumeVersion
            ? {
                ...resume,
                usedCount: resume.usedCount + 1,
                lastUsed: now,
                updatedAt: now,
              }
            : resume,
        ),
      )
    }
  }

  async function flushPendingCloudChanges() {
    if (!sessionUserId) {
      return
    }
    if (!isCloudReady) {
      throw new Error('云端数据仍在加载，请稍后再试。')
    }

    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    await syncQueueRef.current

    const snapshot = { applications, resumes, resources }
    const previousData = lastSyncedDataRef.current ?? {
      applications: [],
      resumes: [],
      resources: [],
    }
    await syncCloudData(sessionUserId, snapshot, previousData)
    lastSyncedDataRef.current = snapshot
    hasPendingLocalChangesRef.current = false
  }

  async function handleDeleteApplication(applicationId: string) {
    const confirmed = window.confirm('确定删除这条申请吗？删除后无法恢复。')
    if (!confirmed) {
      return
    }

    try {
      setSyncStatus('syncing')
      if (sessionUserId) {
        await flushPendingCloudChanges()
        await deleteCloudApplication(sessionUserId, applicationId)
      }
      setApplications((current) => current.filter((application) => application.id !== applicationId))
      setSelectedApplicationId((current) => (current === applicationId ? null : current))
      setStatusEditor((current) =>
        current.applicationId === applicationId
          ? { applicationId: null, stage: '待投递', stageMeta: {} }
          : current,
      )
      void realtimeChannelRef.current?.send({
        type: 'broadcast',
        event: 'refresh',
        payload: {},
      })
      setSyncStatus(sessionUserId ? 'saved' : 'idle')
    } catch (error) {
      setSyncStatus('error')
      const message = error instanceof Error ? error.message : '未知错误'
      window.alert(`删除失败，申请仍然保留。${message}`)
    }
  }

  async function handleDeleteResource(resourceId: string): Promise<boolean> {
    try {
      setSyncStatus('syncing')
      if (sessionUserId) {
        await flushPendingCloudChanges()
        await deleteCloudResource(sessionUserId, resourceId)
      }
      setResources((current) => current.filter((resource) => resource.id !== resourceId))
      void realtimeChannelRef.current?.send({
        type: 'broadcast',
        event: 'refresh',
        payload: {},
      })
      setSyncStatus(sessionUserId ? 'saved' : 'idle')
      return true
    } catch (error) {
      setSyncStatus('error')
      const message = error instanceof Error ? error.message : '未知错误'
      window.alert(`删除失败，网址仍然保留。${message}`)
      return false
    }
  }

  function handleRestoreDemoData() {
    const confirmed = window.confirm(
      '将申请列表恢复为内置示例数据，本地已保存的修改会被覆盖。确定继续？',
    )
    if (!confirmed) {
      return
    }
    setApplications(structuredClone(mockApplications))
    setSelectedApplicationId(null)
    setStatusEditor({ applicationId: null, stage: '待投递', stageMeta: {} })
    setIsDrawerOpen(false)
    setFormState(initialFormState)
    setSearchTerm('')
  }

  function shouldIgnoreCanvasDragTarget(target: EventTarget | null) {
    return target instanceof Element && target.closest('button, a, input, select, textarea, label')
  }

  function startCanvasDragging(
    event: React.PointerEvent<HTMLDivElement>,
    scrollRef: React.RefObject<HTMLDivElement | null>,
    dragStateRef: React.MutableRefObject<CanvasDragState>,
    setDragging: React.Dispatch<React.SetStateAction<boolean>>,
  ) {
    if (event.pointerType === 'touch' || shouldIgnoreCanvasDragTarget(event.target)) {
      return
    }
    const container = scrollRef.current
    if (!container) {
      return
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    }
    setDragging(true)
    container.setPointerCapture(event.pointerId)
  }

  function moveCanvasDragging(
    event: React.PointerEvent<HTMLDivElement>,
    scrollRef: React.RefObject<HTMLDivElement | null>,
    dragStateRef: React.MutableRefObject<CanvasDragState>,
    isDragging: boolean,
  ) {
    if (!isDragging || dragStateRef.current.pointerId !== event.pointerId) {
      return
    }
    const container = scrollRef.current
    if (!container) {
      return
    }
    const deltaX = event.clientX - dragStateRef.current.startX
    container.scrollLeft = dragStateRef.current.startScrollLeft - deltaX
  }

  function stopCanvasDragging(
    pointerId: number | undefined,
    scrollRef: React.RefObject<HTMLDivElement | null>,
    dragStateRef: React.MutableRefObject<CanvasDragState>,
    setDragging: React.Dispatch<React.SetStateAction<boolean>>,
  ) {
    const container = scrollRef.current
    if (container && typeof pointerId === 'number' && container.hasPointerCapture(pointerId)) {
      container.releasePointerCapture(pointerId)
    }
    dragStateRef.current.pointerId = null
    setDragging(false)
  }

  function handleBoardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startCanvasDragging(event, boardScrollRef, boardDragStateRef, setIsBoardDragging)
  }

  function handleBoardPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    moveCanvasDragging(event, boardScrollRef, boardDragStateRef, isBoardDragging)
  }

  function stopBoardDragging(pointerId?: number) {
    stopCanvasDragging(pointerId, boardScrollRef, boardDragStateRef, setIsBoardDragging)
  }

  function handleListPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startCanvasDragging(event, listScrollRef, listDragStateRef, setIsListDragging)
  }

  function handleListPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    moveCanvasDragging(event, listScrollRef, listDragStateRef, isListDragging)
  }

  function stopListDragging(pointerId?: number) {
    stopCanvasDragging(pointerId, listScrollRef, listDragStateRef, setIsListDragging)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const newApplication = createApplicationFromForm(formState)
    setApplications((current) => [newApplication, ...current])
    if (newApplication.resumeVersion) {
      setResumes((current) =>
        current.map((resume) =>
          resume.name === newApplication.resumeVersion
            ? {
                ...resume,
                usedCount: resume.usedCount + 1,
                lastUsed: newApplication.createdAt,
                updatedAt: newApplication.createdAt,
              }
            : resume,
        ),
      )
    }
    setSelectedApplicationId(newApplication.id)
    setStatusEditor({
      applicationId: newApplication.id,
      stage: newApplication.currentStage,
      stageMeta: newApplication.stageMeta,
    })
    setIsDrawerOpen(false)
    setViewMode('看板视图')
    setFormState(initialFormState)
  }

  async function handleResumeUploadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!resumeUploadForm.file) {
      window.alert('请先选择一个简历文件。')
      return
    }

    setIsSavingResume(true)
    try {
      const now = new Date().toISOString()
      const fileDataUrl = await readFileAsDataUrl(resumeUploadForm.file)
      const newResume: ResumeProfile = {
        id: `resume-${crypto.randomUUID()}`,
        name: resumeUploadForm.name.trim() || resumeUploadForm.file.name.replace(/\.[^.]+$/, ''),
        category: resumeUploadForm.category.trim() || '未分类',
        usedCount: 0,
        lastUsed: now,
        fileName: resumeUploadForm.file.name,
        fileType: resumeUploadForm.file.type || 'application/octet-stream',
        fileSize: resumeUploadForm.file.size,
        fileDataUrl,
        note: resumeUploadForm.note.trim(),
        createdAt: now,
        updatedAt: now,
      }

      setResumes((current) => [newResume, ...current])
      setSelectedResume(newResume)
      setResumeUploadForm(initialResumeUploadState)
      setIsResumeUploadModalOpen(false)
    } catch {
      window.alert('简历读取失败，请重新选择文件再试。')
    } finally {
      setIsSavingResume(false)
    }
  }

  async function handleDeleteResume(resumeId: string) {
    const resumeToDelete = resumes.find((resume) => resume.id === resumeId)
    if (!resumeToDelete) {
      return
    }

    const hasSameNameRemaining = resumes.some(
      (resume) =>
        resume.id !== resumeId &&
        resume.name.trim() === resumeToDelete.name.trim(),
    )
    const confirmed = window.confirm(
      hasSameNameRemaining
        ? '确定删除这份简历吗？还有一份同名简历，因此申请条目中的简历名称会保留。'
        : '确定删除这份简历吗？使用它的申请条目将改为“未指定”。',
    )
    if (!confirmed) {
      return
    }

    if (sessionUserId && !isCloudReady) {
      window.alert('云端数据仍在加载，请稍后再删除。')
      return
    }

    try {
      setSyncStatus('syncing')
      let result = { storageDeleted: true }
      if (sessionUserId) {
        await flushPendingCloudChanges()
        result = await deleteCloudResume(sessionUserId, resumeToDelete)
      }
      const now = new Date().toISOString()

      setResumes((current) => current.filter((resume) => resume.id !== resumeId))
      setSelectedResume((current) => (current?.id === resumeId ? null : current))

      if (!hasSameNameRemaining) {
        setApplications((current) =>
          current.map((application) =>
            application.resumeVersion?.trim() === resumeToDelete.name.trim()
              ? { ...application, resumeVersion: '', updatedAt: now }
              : application,
          ),
        )
        setSelectedResumeVersions((current) =>
          current.filter((version) => version.trim() !== resumeToDelete.name.trim()),
        )
      }

      void realtimeChannelRef.current?.send({
        type: 'broadcast',
        event: 'refresh',
        payload: {},
      })
      setSyncStatus(sessionUserId ? 'saved' : 'idle')
      if (!result.storageDeleted) {
        window.alert('简历记录已删除，但云端文件清理失败。请稍后重试或联系我处理。')
      }
    } catch (error) {
      setSyncStatus('error')
      const message = error instanceof Error ? error.message : '未知错误'
      window.alert(`删除失败，简历仍然保留。${message}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-5 py-6 lg:px-8">
        <header className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-6 py-5 card-soft">
          <div className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-200/40 via-violet-200/30 to-transparent blur-2xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="brand-badge hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white sm:inline-flex">
                <IconBriefcase />
              </div>
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  </span>
                  ApplyBoard
                </div>
                <div>
                  <h1 className="text-display text-slate-900">求职申请管理平台</h1>
                  <p className="mt-1 text-body text-slate-500">
                    统一管理申请进度、关键信息与提醒事项，帮助你更清晰地推进每一个岗位流程。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <label className="group flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-500 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/15 hover:border-slate-300 md:min-w-[200px] md:flex-1">
                <IconSearch className="shrink-0 text-slate-400 group-focus-within:text-indigo-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索公司、岗位或备注"
                  className="min-w-0 flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
                />
              </label>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <IconUser className="shrink-0 text-slate-500" />
                  {isAuthLoading
                    ? '检查登录'
                    : session
                      ? syncStatus === 'syncing'
                        ? '同步中…'
                        : syncStatus === 'error'
                          ? '同步失败'
                          : session.user.email?.split('@')[0] ?? '我的账号'
                      : '登录'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  批量导入
                </button>
                <button
                  type="button"
                  onClick={openCreateDrawer}
                  className="btn-primary inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[13px] font-medium"
                >
                  <IconPlus />
                  新增申请
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-5 grid items-start gap-4 lg:grid-cols-[1.7fr_1fr_1fr]">
          <PanelCard
            title="优先处理区"
            description="系统根据当前流程节点与关键时间自动生成提醒"
            icon={<IconSpark />}
            iconTone="indigo"
            stackHeaderOnNarrow
            extra={
              <div className="grid w-full grid-cols-3 gap-1.5 sm:shrink-0">
                {dashboardStats.map((item, idx) => {
                  const toneStyles = [
                    { bg: 'bg-indigo-50/70', num: 'text-indigo-700', dot: 'bg-indigo-500' },
                    { bg: 'bg-emerald-50/70', num: 'text-emerald-700', dot: 'bg-emerald-500' },
                    { bg: 'bg-rose-50/70', num: 'text-rose-700', dot: 'bg-rose-500' },
                  ][idx]
                  return (
                    <div
                      key={item.label}
                      className={`relative overflow-hidden rounded-lg border border-slate-200/70 ${toneStyles.bg} px-3 py-1.5 text-center`}
                    >
                      <div className={`tabular text-lg font-semibold leading-6 ${toneStyles.num}`}>{item.value}</div>
                      <div className="mt-0 flex items-center justify-center gap-1 text-[10.5px] text-slate-500">
                        <span className={`h-1 w-1 rounded-full ${toneStyles.dot}`} />
                        {item.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            }
          >
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch]">
              {topPriorityItem ? (
                <div className="relative shrink-0 overflow-hidden rounded-lg border border-rose-100 bg-gradient-to-br from-rose-50/80 via-white to-white px-3.5 py-3">
                  <span className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-rose-500 to-rose-300" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-rose-600">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                      </span>
                      当前最紧急
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${toneClassMap[topPriorityItem.tone]}`}>
                      P1 · {topPriorityItem.level}优先
                    </span>
                  </div>
                  <div className="mt-1.5 text-body-md font-semibold text-slate-900">
                    {topPriorityItem.text}
                  </div>
                </div>
              ) : null}

              <div className="grid shrink-0 content-start gap-2.5 sm:grid-cols-2">
                {priorityItems.length > 0 ? (
                  priorityItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className="group relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_4px_12px_-4px_rgba(79,70,229,0.15)]"
                    >
                      <span className={`absolute left-0 top-0 h-full w-0.5 ${priorityAccentBar[item.tone] ?? 'bg-slate-300'}`} />
                      <div className="flex items-center justify-between gap-2">
                        <div className="tabular text-micro font-semibold text-slate-400">#{String(index + 1).padStart(2, '0')}</div>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${toneClassMap[item.tone]}`}>
                          {item.level}优先
                        </span>
                      </div>
                      <div className="mt-1.5 text-body-md font-medium text-slate-900">{item.text}</div>
                    </button>
                  ))
                ) : (
                  <EmptyState text="当前没有需要优先处理的提醒。" />
                )}
              </div>
            </div>
          </PanelCard>

          <ResourceLibraryPanel
            resources={resources}
            onResourcesChange={setResources}
            onDeleteResource={handleDeleteResource}
          />

          <PanelCard
            title="简历管理"
            description="展示不同简历版本及其最近使用情况"
            icon={<IconFile />}
            iconTone="violet"
            extra={
              <button
                type="button"
                onClick={() => setIsResumeUploadModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-micro font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <IconUpload className="text-slate-500" />
                上传简历
              </button>
            }
          >
            <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1">
              {displayedResumes.length > 0 ? (
                displayedResumes.map((resume) => (
                  <button
                    key={resume.id}
                    type="button"
                    onClick={() => setSelectedResume(resume)}
                    className="group relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_4px_12px_-4px_rgba(139,92,246,0.18)]"
                  >
                    <span className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-violet-400 to-violet-200 opacity-0 transition group-hover:opacity-100" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-body-md font-semibold text-slate-900">{resume.name}</div>
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                          {resume.category}方向
                        </div>
                        {resume.fileName ? (
                          <div className="mt-1 truncate text-[11px] text-slate-400">{resume.fileName}</div>
                        ) : null}
                      </div>
                      <span className="tabular shrink-0 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        {resume.usedCount} 次
                      </span>
                    </div>
                    <div className="tabular mt-2 text-[11px] text-slate-400">最近使用：{formatDateTime(resume.lastUsed)}</div>
                  </button>
                ))
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[13px] leading-6 text-slate-500">
                  还没有保存简历，点击右上角上传第一份。
                </div>
              )}
            </div>
          </PanelCard>
        </section>

        <section className="mt-5 flex items-center justify-between gap-4">
          <div className="inline-flex rounded-lg border border-indigo-200/40 bg-indigo-50/40 p-0.5 shadow-[0_1px_2px_rgba(79,70,229,0.06)]">
            {viewModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition ${
                  viewMode === mode
                    ? 'bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 text-white shadow-[0_1px_2px_rgba(79,70,229,0.35),0_1px_3px_rgba(124,58,237,0.2)]'
                    : 'text-indigo-700/80 hover:bg-white/50 hover:text-indigo-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            共 <span className="tabular font-semibold text-slate-900">{filteredApplications.length}</span> 条申请
          </div>
        </section>

        <main className="mt-3 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 card-soft lg:p-4">
          {viewMode === '看板视图' ? (
            <div
              ref={boardScrollRef}
              onPointerDown={handleBoardPointerDown}
              onPointerMove={handleBoardPointerMove}
              onPointerUp={(event) => stopBoardDragging(event.pointerId)}
              onPointerCancel={(event) => stopBoardDragging(event.pointerId)}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'mouse') {
                  return
                }
                stopBoardDragging(event.pointerId)
              }}
              className={`h-[min(84vh,1040px)] overflow-x-auto overflow-y-hidden pb-3 ${
                isBoardDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
              }`}
            >
              <div className="grid h-full min-w-[1260px] grid-cols-6 items-start gap-3">
                {groupedApplications.map((group) => {
                  const accent = getMainStageAccent(group.stage)
                  return (
                    <div key={group.stage} className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200/70 bg-slate-50/60 p-2.5">
                      <div className="mb-2.5 flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${accent.dot} shadow-[0_0_0_3px_rgba(255,255,255,1)]`} />
                          <div className="text-[13px] font-semibold tracking-tight text-slate-900">{group.stage}</div>
                        </div>
                        <span className={`tabular rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${accent.chip} ${accent.text}`}>
                          {group.items.length}
                        </span>
                      </div>

                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                        {group.items.length > 0 ? (
                          group.items.map((application) => (
                            <ApplicationCard
                              key={application.id}
                              application={application}
                              onClick={() => openApplicationDetail(application.id)}
                              onUpdateStatus={() => openApplicationDetail(application.id)}
                            />
                          ))
                        ) : (
                          <EmptyState text="暂无岗位" compact />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <details className="group relative">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 5h16M7 12h10M10 19h4" />
                      </svg>
                      筛选
                      {activeListFilterCount > 0 ? (
                        <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                          {activeListFilterCount}
                        </span>
                      ) : null}
                    </summary>
                    <div className="absolute left-0 top-full z-40 mt-2 w-[min(720px,calc(100vw-4rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                      <div className="grid gap-5 md:grid-cols-2">
                        <fieldset>
                          <legend className="mb-2 text-[12px] font-semibold text-slate-800">大阶段</legend>
                          <div className="flex flex-wrap gap-2">
                            {MAIN_STAGE_OPTIONS.map((stage) => (
                              <label
                                key={stage}
                                className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px] transition ${
                                  selectedMainStages.includes(stage)
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedMainStages.includes(stage)}
                                  onChange={() => toggleMainStage(stage)}
                                  className="sr-only"
                                />
                                {stage}
                              </label>
                            ))}
                          </div>
                        </fieldset>

                        <fieldset>
                          <legend className="mb-2 text-[12px] font-semibold text-slate-800">简历版本</legend>
                          <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                            {availableResumeVersions.map((version) => (
                              <label
                                key={version}
                                className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px] transition ${
                                  selectedResumeVersions.includes(version)
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedResumeVersions.includes(version)}
                                  onChange={() => toggleResumeVersion(version)}
                                  className="sr-only"
                                />
                                {version}
                              </label>
                            ))}
                          </div>
                        </fieldset>

                        <fieldset>
                          <legend className="mb-2 text-[12px] font-semibold text-slate-800">创建时间</legend>
                          <select
                            value={createdTimeFilter}
                            onChange={(event) => setCreatedTimeFilter(event.target.value as CreatedTimeFilter)}
                            className="input-base py-1.5"
                          >
                            <option value="all">全部时间</option>
                            <option value="today">今天</option>
                            <option value="7days">近 7 天</option>
                            <option value="30days">近 30 天</option>
                            <option value="custom">自定义区间</option>
                          </select>
                          {createdTimeFilter === 'custom' ? (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <input
                                type="date"
                                aria-label="创建时间开始日期"
                                value={createdDateStart}
                                onChange={(event) => setCreatedDateStart(event.target.value)}
                                className="input-base py-1.5"
                              />
                              <input
                                type="date"
                                aria-label="创建时间结束日期"
                                value={createdDateEnd}
                                onChange={(event) => setCreatedDateEnd(event.target.value)}
                                className="input-base py-1.5"
                              />
                            </div>
                          ) : null}
                        </fieldset>

                        <fieldset>
                          <legend className="mb-2 text-[12px] font-semibold text-slate-800">关键时间</legend>
                          <select
                            value={keyTimeFilter}
                            onChange={(event) => setKeyTimeFilter(event.target.value as KeyTimeFilter)}
                            className="input-base py-1.5"
                          >
                            <option value="all">全部时间</option>
                            <option value="today">今天</option>
                            <option value="next3days">未来 3 天</option>
                            <option value="next7days">未来 7 天</option>
                            <option value="overdue">已逾期</option>
                            <option value="unset">未设置</option>
                            <option value="custom">自定义区间</option>
                          </select>
                          {keyTimeFilter === 'custom' ? (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <input
                                type="date"
                                aria-label="关键时间开始日期"
                                value={keyDateStart}
                                onChange={(event) => setKeyDateStart(event.target.value)}
                                className="input-base py-1.5"
                              />
                              <input
                                type="date"
                                aria-label="关键时间结束日期"
                                value={keyDateEnd}
                                onChange={(event) => setKeyDateEnd(event.target.value)}
                                className="input-base py-1.5"
                              />
                            </div>
                          ) : null}
                        </fieldset>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-[11px] text-slate-400">筛选条件会即时应用，仅影响列表展示</span>
                        <button
                          type="button"
                          onClick={clearListFilters}
                          disabled={activeListFilterCount === 0}
                          className="text-[12px] font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          清空筛选
                        </button>
                      </div>
                    </div>
                  </details>

                  {selectedMainStages.length > 0 ? (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-700">
                      大阶段：{selectedMainStages.length} 项
                    </span>
                  ) : null}
                  {createdTimeFilter !== 'all' ? (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-700">已筛选创建时间</span>
                  ) : null}
                  {keyTimeFilter !== 'all' ? (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-700">已筛选关键时间</span>
                  ) : null}
                  {selectedResumeVersions.length > 0 ? (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-700">
                      简历：{selectedResumeVersions.length} 项
                    </span>
                  ) : null}
                  {activeListFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={clearListFilters}
                      className="text-[11px] font-medium text-slate-500 hover:text-indigo-700"
                    >
                      清空
                    </button>
                  ) : null}
                </div>

                <span className="whitespace-nowrap text-[11px] text-slate-500">
                  {activeListFilterCount > 0
                    ? `筛选出 ${listApplications.length} 条 / 共 ${filteredApplications.length} 条`
                    : `共 ${listApplications.length} 条`}
                </span>
              </div>
              <div
                ref={listScrollRef}
                onPointerDown={handleListPointerDown}
                onPointerMove={handleListPointerMove}
                onPointerUp={(event) => stopListDragging(event.pointerId)}
                onPointerCancel={(event) => stopListDragging(event.pointerId)}
                onPointerLeave={(event) => {
                  if (event.pointerType !== 'mouse') {
                    return
                  }
                  stopListDragging(event.pointerId)
                }}
                className={`h-[min(84vh,1040px)] overflow-auto ${
                  isListDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
                }`}
              >
                <table className="min-w-[1328px] divide-y divide-slate-200 text-left">
                  <thead className="bg-slate-50/80">
                    <tr className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {listTableColumns.map(({ title, sortColumn, widthClass }) => {
                        const sortDirection = sortColumn ? getListSortDirection(sortColumn) : null
                        return (
                        <th
                          key={title}
                          aria-sort={
                            sortDirection === 'asc'
                              ? 'ascending'
                              : sortDirection === 'desc'
                                ? 'descending'
                                : undefined
                          }
                          className={`${widthClass} whitespace-nowrap px-3 py-3 font-medium ${
                            title === '操作'
                              ? 'sticky right-0 z-10 border-l border-slate-200 bg-slate-50'
                              : ''
                          }`}
                        >
                          {sortColumn ? (
                            <button
                              type="button"
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => cycleListSort(sortColumn)}
                              title={
                                sortDirection === null
                                  ? `点击按${title}排序`
                                  : `当前为${sortDirection === 'asc' ? '升序' : '降序'}，再次点击切换排序方向`
                              }
                              className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1 py-0.5 transition ${
                                sortDirection
                                  ? 'bg-indigo-50 text-indigo-700'
                                  : 'hover:bg-slate-100 hover:text-slate-700'
                              }`}
                            >
                              {title}
                              <span
                                className={`text-[12px] leading-none ${
                                  sortDirection
                                    ? 'font-semibold text-indigo-600'
                                    : 'text-slate-300 group-hover:text-slate-500'
                                }`}
                                aria-hidden="true"
                              >
                                {sortDirection === 'asc' ? '↑' : sortDirection === 'desc' ? '↓' : '↕'}
                              </span>
                            </button>
                          ) : (
                            title
                          )}
                        </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {listApplications.map((application) => (
                      <tr
                        key={application.id}
                        className="group cursor-pointer align-top transition hover:bg-slate-50/60"
                        onClick={() => openApplicationDetail(application.id)}
                      >
                        <td className="px-3 py-3.5 text-sm font-medium text-slate-900">{application.company}</td>
                        <td className="px-3 py-3.5">
                          <div className="group relative inline-flex max-w-[210px]">
                            <span className="line-clamp-2 text-sm leading-5 text-slate-700">
                              {application.position}
                            </span>
                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg bg-slate-900 p-3 text-xs leading-5 text-white shadow-xl group-hover:block">
                              <div className="font-medium">{application.position}</div>
                              {application.jdNote ? (
                                <div className="mt-2 border-t border-white/15 pt-2 text-slate-300">
                                  {application.jdNote}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <a
                            href={application.link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          >
                            查看
                            <IconExternal className="text-slate-400" />
                          </a>
                        </td>
                        <td className="px-3 py-3.5">
                          {(() => {
                            const accent = getMainStageAccent(getMainStage(application.currentStage))
                            return (
                              <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${accent.chip} ${accent.text}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                                {getMainStage(application.currentStage)}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">
                            {getDetailedStageLabel(application)}
                          </span>
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3.5 text-[13px] text-slate-600">{getCurrentKeyTime(application)}</td>
                        <td className="px-3 py-3.5 text-[13px] text-slate-600">{application.resumeVersion || '未指定'}</td>
                        <td className="px-3 py-3.5">
                          <div className="flex max-w-[180px] flex-wrap gap-1">
                            {getRiskBadges(application).length > 0 ? (
                              getRiskBadges(application).map((badge) => (
                                <span
                                  key={badge.label}
                                  className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneClassMap[badge.tone]}`}
                                >
                                  {badge.label}
                                </span>
                              ))
                            ) : (
                              <span className="text-[13px] text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <ProgressMiniAxis currentStage={application.currentStage} />
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3.5 text-[13px] text-slate-500">{formatDateTime(application.updatedAt)}</td>
                        <td className="sticky right-0 min-w-[90px] whitespace-nowrap border-l border-slate-100 bg-white px-3 py-3.5 group-hover:bg-slate-50">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openApplicationDetail(application.id)
                            }}
                            className="btn-primary inline-flex shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-medium"
                          >
                            更新状态
                          </button>
                        </td>
                      </tr>
                    ))}
                    {listApplications.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-6 py-16 text-center">
                          <div className="text-sm font-medium text-slate-600">没有符合条件的申请</div>
                          <button
                            type="button"
                            onClick={clearListFilters}
                            className="mt-2 text-[12px] font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            清空筛选条件
                          </button>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        <footer className="mt-10 flex justify-center pb-2 pt-1">
          <button
            type="button"
            onClick={handleRestoreDemoData}
            className="text-[11px] text-slate-400/90 transition hover:text-slate-600 hover:underline hover:decoration-slate-300 hover:underline-offset-2"
          >
            恢复示例数据
          </button>
        </footer>
      </div>

      <ApplicationDrawer
        open={isDrawerOpen}
        title="新增申请"
        formState={formState}
        dynamicFields={dynamicFields}
        resumes={resumes}
        onClose={() => setIsDrawerOpen(false)}
        onSubmit={handleSubmit}
        onFieldChange={updateFormField}
        onStageMetaChange={updateStageMeta}
      />

      <ApplicationDetailPanel
        application={selectedApplication}
        resumes={resumes}
        statusDraft={currentStatusDraft}
        statusStageMeta={currentStatusStageMeta}
        statusDynamicFields={statusDynamicFields}
        onStatusDraftChange={(stage) =>
          setStatusEditor({
            applicationId: selectedApplication?.id ?? null,
            stage,
            stageMeta: currentStatusStageMeta,
          })
        }
        onStatusStageMetaChange={updateStatusEditorMeta}
        onSaveStage={(applicationId) =>
          updateApplicationStage(applicationId, currentStatusDraft, currentStatusStageMeta)
        }
        onSaveDetails={updateApplicationDetails}
        onDelete={handleDeleteApplication}
        onClose={() => setSelectedApplicationId(null)}
      />

      <ImportPlaceholderModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={(data) => {
          setApplications((current) => mergeImportedItems(current, data.applications))
          setResumes((current) => mergeImportedItems(current, data.resumes))
          setResources((current) => mergeImportedItems(current, data.resources))
          setIsImportModalOpen(false)
        }}
      />

      <ResumeUploadModal
        open={isResumeUploadModalOpen}
        formState={resumeUploadForm}
        isSaving={isSavingResume}
        onClose={() => {
          if (!isSavingResume) {
            setIsResumeUploadModalOpen(false)
          }
        }}
        onSubmit={handleResumeUploadSubmit}
        onFieldChange={(key, value) =>
          setResumeUploadForm((current) => ({ ...current, [key]: value }))
        }
      />

      <AuthModal
        open={isLoginModalOpen}
        session={session}
        isBusy={isAuthBusy || isCloudLoading}
        isPasswordRecovery={isPasswordRecovery}
        error={authError}
        message={authMessage}
        isConfigured={isSupabaseConfigured}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onResetPassword={handleResetPassword}
        onUpdatePassword={handleUpdatePassword}
        onSignOut={handleSignOut}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <ResumePreviewModal
        resume={selectedResume}
        onClose={() => setSelectedResume(null)}
        onDelete={handleDeleteResume}
      />
    </div>
  )
}

function PanelCard({
  title,
  description,
  extra,
  icon,
  iconTone = 'indigo',
  children,
  stackHeaderOnNarrow,
}: {
  title: string
  description: string
  extra?: React.ReactNode
  icon?: React.ReactNode
  iconTone?: 'indigo' | 'amber' | 'violet' | 'emerald' | 'rose'
  children: React.ReactNode
  /** 仅窄屏：标题与右侧区域上下排列，避免与统计块抢宽度；sm 及以上与原先一致 */
  stackHeaderOnNarrow?: boolean
}) {
  const iconToneMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  }

  return (
    <section
      className={
        stackHeaderOnNarrow
          ? 'flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white card-soft h-[min(520px,85vh)] sm:h-[300px]'
          : 'flex h-[300px] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white card-soft'
      }
    >
      <div
        className={
          stackHeaderOnNarrow
            ? 'flex flex-col gap-3 border-b border-slate-100 px-4 pb-3 pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3'
            : 'flex items-start justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-4'
        }
      >
        <div
          className={
            stackHeaderOnNarrow
              ? 'flex w-full min-w-0 items-start gap-2.5 sm:flex-1'
              : 'flex min-w-0 flex-1 items-start gap-2.5'
          }
        >
          {icon ? (
            <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${iconToneMap[iconTone]}`}>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-slate-900">{title}</h2>
            <p className="mt-0.5 text-caption text-slate-500">{description}</p>
          </div>
        </div>
        {stackHeaderOnNarrow ? (
          <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{extra}</div>
        ) : (
          extra
        )}
      </div>
      <div
        className={
          stackHeaderOnNarrow
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3'
            : 'min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-3'
        }
      >
        {children}
      </div>
    </section>
  )
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-center text-[13px] text-slate-400 ${
        compact ? 'px-4 py-6' : 'px-4 py-8'
      }`}
    >
      {text}
    </div>
  )
}

function ApplicationCard({
  application,
  onClick,
  onUpdateStatus,
}: {
  application: Application
  onClick: () => void
  onUpdateStatus: () => void
}) {
  const riskBadges = getRiskBadges(application)
  const accent = getMainStageAccent(getMainStage(application.currentStage))

  return (
    <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_6px_16px_-6px_rgba(79,70,229,0.18)]">
      <span className={`absolute left-0 top-0 h-full w-0.5 ${accent.dot} opacity-60`} />
      <button type="button" onClick={onClick} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold tracking-tight text-slate-900">{application.company}</div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-slate-600">{application.position}</div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${accent.chip} ${accent.text}`}>
            <span className={`h-1 w-1 rounded-full ${accent.dot}`} />
            {getCurrentStageLabel(application)}
          </span>
        </div>
        <div className="tabular mt-2.5 rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-[11px] leading-4 text-slate-500">
          {getCurrentKeyTime(application)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {riskBadges.length > 0 ? (
            riskBadges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${toneClassMap[badge.tone]}`}
              >
                {badge.label}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/70 bg-emerald-50">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              推进中
            </span>
          )}
        </div>
      </button>

      <div className="mt-2.5 flex justify-end gap-1.5 border-t border-slate-100 pt-2.5">
        {application.link.trim() ? (
          <a
            href={application.link}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            aria-label={`打开${application.company}的岗位链接`}
            className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-medium leading-tight text-slate-500 transition hover:border-sky-200 hover:bg-sky-50/50 hover:text-sky-700"
          >
            岗位链接
            <IconExternal className="h-2.5 w-2.5" />
          </a>
        ) : null}
        <button
          type="button"
          onClick={onUpdateStatus}
          className="inline-flex rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-medium leading-tight text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700"
        >
          更新状态
        </button>
      </div>
    </div>
  )
}

function ProgressMiniAxis({ currentStage }: { currentStage: ApplicationStage }) {
  const currentIndex = getProgressStepIndex(currentStage)
  const isTerminated = currentStage === '已淘汰' || currentStage === '已放弃'

  return (
    <div className="w-[240px]">
      <div className="flex items-center gap-1">
        {PROGRESS_AXIS_STEPS.map((step, index) => {
          const active = index <= currentIndex
          const isCurrent = index === currentIndex
          return (
            <div key={step} className="flex min-w-0 flex-1 items-center gap-1">
              <div
                title={step}
                className={`shrink-0 rounded-full transition ${
                  isCurrent
                    ? isTerminated
                      ? 'h-2.5 w-2.5 bg-slate-500 ring-[3px] ring-slate-400/20'
                      : 'h-2.5 w-2.5 bg-indigo-600 ring-[3px] ring-indigo-600/20'
                    : active
                      ? isTerminated
                        ? 'h-2 w-2 bg-slate-400'
                        : 'h-2 w-2 bg-indigo-500'
                      : 'h-2 w-2 bg-slate-200'
                }`}
              />
              {index < PROGRESS_AXIS_STEPS.length - 1 ? (
                <div
                  className={`h-[2px] flex-1 rounded-full ${
                    active
                      ? index < currentIndex
                        ? isTerminated
                          ? 'bg-slate-400'
                          : 'bg-indigo-500'
                        : isTerminated
                          ? 'bg-gradient-to-r from-slate-400 to-slate-200'
                          : 'bg-gradient-to-r from-indigo-500 to-slate-200'
                      : 'bg-slate-200'
                  }`}
                />
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="tabular mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
        <span className="text-slate-400">当前</span>
        <span className={`font-medium ${isTerminated ? 'text-slate-600' : 'text-indigo-600'}`}>
          {currentStage}
        </span>
      </div>
    </div>
  )
}

function ApplicationDrawer({
  open,
  title,
  formState,
  dynamicFields,
  resumes,
  onClose,
  onSubmit,
  onFieldChange,
  onStageMetaChange,
}: {
  open: boolean
  title: string
  formState: DrawerFormState
  dynamicFields: StageFieldConfig[]
  resumes: ResumeProfile[]
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onFieldChange: <Key extends keyof DrawerFormState>(key: Key, value: DrawerFormState[Key]) => void
  onStageMetaChange: (key: keyof StageMeta, value: string) => void
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[440px] border-l border-slate-200 bg-white elevated transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <div className="text-[15px] font-semibold text-slate-900">{title}</div>
              <div className="mt-0.5 text-[12px] text-slate-500">支持动态字段展示，保存后立即写入本地状态</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <IconClose />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <Field label="公司名称" required>
              <input
                value={formState.company}
                onChange={(event) => onFieldChange('company', event.target.value)}
                required
                placeholder="例如：美团"
                className="input-base"
              />
            </Field>

            <Field label="岗位名称" required>
              <input
                value={formState.position}
                onChange={(event) => onFieldChange('position', event.target.value)}
                required
                placeholder="例如：策略运营实习生"
                className="input-base"
              />
            </Field>

            <Field label="招聘链接" required>
              <input
                value={formState.link}
                onChange={(event) => onFieldChange('link', event.target.value)}
                required
                placeholder="请填写岗位原始链接"
                className="input-base"
              />
            </Field>

            <Field label="当前具体进度" required>
              <select
                value={formState.currentStage}
                onChange={(event) =>
                  onFieldChange('currentStage', event.target.value as ApplicationStage)
                }
                className="input-base"
              >
                {STAGE_OPTIONS.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </Field>

            <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                阶段关键时间
              </div>
              <div className="space-y-3.5">
                {dynamicFields.length > 0 ? (
                  dynamicFields.map((field) => (
                    <Field key={field.key} label={field.label} required={field.required}>
                      <input
                        type="datetime-local"
                        value={toInputValue(formState.stageMeta[field.key])}
                        onChange={(event) => onStageMetaChange(field.key, event.target.value)}
                        required={field.required}
                        className="input-base tabular"
                      />
                    </Field>
                  ))
                ) : (
                  <div className="text-[13px] text-slate-500">该阶段暂不需要补充额外时间信息。</div>
                )}
              </div>
            </section>

            <Field label="岗位备注 / JD 摘要">
              <textarea
                value={formState.jdNote}
                onChange={(event) => onFieldChange('jdNote', event.target.value)}
                rows={4}
                placeholder="可填写面试重点、JD 摘要、业务方向等信息"
                className="input-base resize-none"
              />
            </Field>

            <Field label="使用简历版本">
              <input
                list="resume-version-options"
                value={formState.resumeVersion}
                onChange={(event) => onFieldChange('resumeVersion', event.target.value)}
                placeholder="例如：产品经理版 V3"
                className="input-base"
              />
              <datalist id="resume-version-options">
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.name} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="btn-primary rounded-lg px-3.5 py-2 text-[13px] font-medium"
            >
              保存申请
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-[12px] font-medium text-slate-600">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </div>
      {children}
    </label>
  )
}

function ApplicationDetailPanel({
  application,
  resumes,
  statusDraft,
  statusStageMeta,
  statusDynamicFields,
  onStatusDraftChange,
  onStatusStageMetaChange,
  onSaveStage,
  onSaveDetails,
  onDelete,
  onClose,
}: {
  application: Application | null
  resumes: ResumeProfile[]
  statusDraft: ApplicationStage
  statusStageMeta: StageMeta
  statusDynamicFields: StageFieldConfig[]
  onStatusDraftChange: (stage: ApplicationStage) => void
  onStatusStageMetaChange: (key: keyof StageMeta, value: string) => void
  onSaveStage: (applicationId: string) => void
  onSaveDetails: (applicationId: string, nextDetails: ApplicationDetailFormState) => void
  onDelete: (applicationId: string) => void
  onClose: () => void
}) {
  const [detailForm, setDetailForm] = useState<ApplicationDetailFormState | null>(null)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) {
        setDetailForm(application ? createApplicationDetailForm(application) : null)
      }
    })
    return () => {
      active = false
    }
  }, [application])

  function updateDetailField<Key extends keyof ApplicationDetailFormState>(
    key: Key,
    value: ApplicationDetailFormState[Key],
  ) {
    setDetailForm((current) => (current ? { ...current, [key]: value } : current))
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/15 backdrop-blur-[1px] transition-opacity duration-200 ${application ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-full max-w-[500px] border-l border-slate-200 bg-[#fafafa] elevated transition-transform duration-300 ease-out ${application ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {application ? (
          <div className="flex h-full flex-col">
            <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-indigo-50/60 via-white to-white px-6 py-4">
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-200/30 to-transparent blur-2xl" />
              <div className="relative flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-micro font-semibold uppercase tracking-[0.08em] text-indigo-600">申请详情</div>
                  <div className="text-title-lg mt-1.5 truncate text-slate-900">{application.position}</div>
                  <div className="mt-0.5 truncate text-body text-slate-500">{application.company}</div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭"
                  className="ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <section className="rounded-xl border border-slate-200 bg-white p-4 card-soft">
                {(() => {
                  const accent = getMainStageAccent(getMainStage(application.currentStage))
                  return (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent.chip} ${accent.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                        {getMainStage(application.currentStage)}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {getCurrentStageLabel(application)}
                      </span>
                    </div>
                  )
                })()}
                <div className="tabular mt-3 text-body text-slate-600">{getCurrentKeyTime(application)}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {getRiskBadges(application).length > 0 ? (
                    getRiskBadges(application).map((badge) => (
                      <span
                        key={badge.label}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneClassMap[badge.tone]}`}
                      >
                        {badge.label}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/70 bg-emerald-50">
                      <span className="h-1 w-1 rounded-full bg-emerald-500" />
                      推进中
                    </span>
                  )}
                </div>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <ProgressMiniAxis currentStage={application.currentStage} />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 card-soft">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-title text-slate-900">修改求职状态</div>
                    <div className="mt-0.5 text-caption text-slate-500">
                      选择新的流程节点后保存，系统会自动更新最近更新时间。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSaveStage(application.id)}
                    className="btn-primary shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium"
                  >
                    保存状态
                  </button>
                </div>

                <div className="mt-4 grid gap-2.5 md:grid-cols-[1fr_auto] md:items-end">
                  <Field label="当前具体进度">
                    <select
                      value={statusDraft}
                      onChange={(event) => onStatusDraftChange(event.target.value as ApplicationStage)}
                      className="input-base"
                    >
                      {STAGE_OPTIONS.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 md:min-w-[130px] md:text-center">
                    <span className="text-slate-400">大阶段</span> · {getMainStage(statusDraft)}
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <span className="h-1 w-1 rounded-full bg-slate-400" />
                    阶段关键时间
                  </div>
                  <div className="space-y-3.5">
                    {statusDynamicFields.length > 0 ? (
                      statusDynamicFields.map((field) => (
                        <Field key={field.key} label={field.label} required={field.required}>
                          <input
                            type="datetime-local"
                            value={toInputValue(statusStageMeta[field.key])}
                            onChange={(event) =>
                              onStatusStageMetaChange(field.key, event.target.value)
                            }
                            required={field.required}
                            className="input-base tabular"
                          />
                        </Field>
                      ))
                    ) : (
                      <div className="text-[13px] text-slate-500">该阶段暂不需要补充额外时间信息。</div>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 card-soft">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-title text-slate-900">编辑申请信息</div>
                    <div className="mt-0.5 text-caption text-slate-500">
                      公司、岗位、链接、简历版本和备注都可以随时更新。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => detailForm && onSaveDetails(application.id, detailForm)}
                    className="btn-primary shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium"
                  >
                    保存信息
                  </button>
                </div>

                {detailForm ? (
                  <div className="mt-4 grid gap-3">
                    <Field label="公司名称" required>
                      <input
                        value={detailForm.company}
                        onChange={(event) => updateDetailField('company', event.target.value)}
                        className="input-base"
                      />
                    </Field>
                    <Field label="岗位名称" required>
                      <input
                        value={detailForm.position}
                        onChange={(event) => updateDetailField('position', event.target.value)}
                        className="input-base"
                      />
                    </Field>
                    <Field label="招聘链接" required>
                      <input
                        value={detailForm.link}
                        onChange={(event) => updateDetailField('link', event.target.value)}
                        className="input-base"
                      />
                    </Field>
                    <Field label="使用简历版本">
                      <input
                        list="detail-resume-version-options"
                        value={detailForm.resumeVersion}
                        onChange={(event) => updateDetailField('resumeVersion', event.target.value)}
                        placeholder="未指定"
                        className="input-base"
                      />
                      <datalist id="detail-resume-version-options">
                        {resumes.map((resume) => (
                          <option key={resume.id} value={resume.name} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="岗位备注 / JD 摘要">
                      <textarea
                        value={detailForm.jdNote}
                        onChange={(event) => updateDetailField('jdNote', event.target.value)}
                        rows={5}
                        placeholder="暂无备注"
                        className="input-base resize-none"
                      />
                    </Field>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <InfoItem label="创建时间" value={formatDateTime(application.createdAt)} />
                      <InfoItem label="最近更新时间" value={formatDateTime(application.updatedAt)} />
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 card-soft">
                <SectionTitle>阶段时间字段</SectionTitle>
                <div className="mt-3 grid gap-2">
                  {Object.entries(application.stageMeta).length > 0 ? (
                    Object.entries(application.stageMeta).map(([key, value]) => (
                      <InfoItem key={key} label={key} value={formatDateTime(value)} />
                    ))
                  ) : (
                    <div className="text-[13px] text-slate-500">当前阶段暂无额外时间字段。</div>
                  )}
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3">
              <button
                type="button"
                onClick={() => onDelete(application.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-[13px] font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
              >
                <IconTrash className="shrink-0" />
                删除申请
              </button>
              <p className="text-right text-[11px] leading-4 text-slate-400">
                删除后将从看板与列表中移除
              </p>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      <span className="h-1 w-1 rounded-full bg-indigo-400" />
      {children}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="tabular break-words text-body text-slate-700">{value}</div>
    </div>
  )
}

function ImportPlaceholderModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean
  onClose: () => void
  onImport: (data: CloudData) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  async function importData() {
    if (!file) {
      setError('请先选择 JSON 数据文件。')
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>
      const applications = parsed['applyboard.applications.v1']
      const resumes = parsed['applyboard.resumes.v1']
      const resources = parsed['applyboard.job-resources.v1']
      if (!Array.isArray(applications) || !Array.isArray(resumes) || !Array.isArray(resources)) {
        throw new Error('文件中缺少可导入的 ApplyBoard 数据。')
      }

      const confirmed = window.confirm(
        `将尝试导入 ${applications.length} 条申请、${resumes.length} 份简历和 ${resources.length} 条网址。现有内容不会被覆盖，确定继续？`,
      )
      if (!confirmed) {
        return
      }

      onImport({
        applications: applications as Application[],
        resumes: resumes as ResumeProfile[],
        resources: resources as typeof resources,
      })
      setFile(null)
      setError('')
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '数据文件读取失败。')
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 backdrop-blur-[2px] px-4 transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 elevated transition-all duration-200 ${open ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="text-[15px] font-semibold tracking-tight text-slate-900">批量导入</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-6 text-slate-600">
          选择 ApplyBoard JSON 数据文件，批量添加申请、简历和网址。现有内容会保留，重复记录不会再次导入。
        </p>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setError('')
          }}
          className="mt-4 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-2.5 file:py-1.5 file:text-[12px] file:font-medium file:text-indigo-700"
        />
        {error ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {error}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void importData()}
            className="btn-primary rounded-lg px-3.5 py-2 text-[13px] font-medium"
          >
            开始导入
          </button>
        </div>
      </div>
    </div>
  )
}

function AuthModal({
  open,
  session,
  isBusy,
  isPasswordRecovery,
  error,
  message,
  isConfigured,
  onSignIn,
  onSignUp,
  onResetPassword,
  onUpdatePassword,
  onSignOut,
  onClose,
}: {
  open: boolean
  session: Session | null
  isBusy: boolean
  isPasswordRecovery: boolean
  error: string
  message: string
  isConfigured: boolean
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
  onResetPassword: (email: string) => Promise<void>
  onUpdatePassword: (password: string) => Promise<void>
  onSignOut: () => Promise<void>
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPasswordRecovery) {
      await onUpdatePassword(password)
      setPassword('')
      return
    }
    if (mode === 'sign-in') {
      await onSignIn(email.trim(), password)
    } else {
      await onSignUp(email.trim(), password)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 backdrop-blur-[2px] px-4 transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 elevated transition-all duration-200 ${open ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-900">
              {isPasswordRecovery ? '设置新密码' : session ? '账号' : mode === 'sign-in' ? '登录 ApplyBoard' : '注册 ApplyBoard'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose />
          </button>
        </div>

        {!isConfigured ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12px] leading-5 text-rose-700">
            Supabase 环境变量尚未配置，暂时无法登录。
          </div>
        ) : session && !isPasswordRecovery ? (
          <div className="mt-4">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-3">
              <div className="text-[11px] text-emerald-600">当前账号</div>
              <div className="mt-0.5 break-all text-[13px] font-medium text-emerald-900">
                {session.user.email}
              </div>
            </div>
            {error ? (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600"
              >
                关闭
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onSignOut()}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[13px] font-medium text-rose-700 disabled:opacity-50"
              >
                退出当前设备
              </button>
            </div>
          </div>
        ) : (
          <form className="mt-4" onSubmit={submit}>
            {!isPasswordRecovery ? (
              <label className="block">
                <span className="text-[12px] font-medium text-slate-600">邮箱</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input-base mt-1 w-full"
                  placeholder="you@example.com"
                />
              </label>
            ) : null}
            <label className={`block ${isPasswordRecovery ? '' : 'mt-3'}`}>
              <span className="text-[12px] font-medium text-slate-600">
                {isPasswordRecovery ? '新密码' : '密码'}
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={isPasswordRecovery ? 'new-password' : mode === 'sign-up' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input-base mt-1 w-full"
                placeholder="至少 8 位"
              />
            </label>
            {message ? (
              <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-[12px] leading-5 text-indigo-700">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
                {error}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              {!isPasswordRecovery ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onResetPassword(email.trim())}
                  className="text-[12px] text-slate-500 transition hover:text-indigo-600 disabled:opacity-50"
                >
                  忘记密码
                </button>
              ) : <span />}
              <button
                type="submit"
                disabled={isBusy || !isConfigured}
                className="btn-primary rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-50"
              >
                {isBusy ? '请稍候…' : isPasswordRecovery ? '保存新密码' : mode === 'sign-in' ? '登录' : '注册'}
              </button>
            </div>
            {!isPasswordRecovery ? (
              <div className="mt-4 border-t border-slate-100 pt-4 text-center text-[12px] text-slate-500">
                {mode === 'sign-in' ? '还没有账号？' : '已有账号？'}
                <button
                  type="button"
                  onClick={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')}
                  className="ml-1 font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {mode === 'sign-in' ? '免费注册' : '返回登录'}
                </button>
              </div>
            ) : null}
          </form>
        )}

        {!isConfigured ? (
          <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary rounded-lg px-3.5 py-2 text-[13px] font-medium"
          >
            关闭
          </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function mergeImportedItems<T extends { id: string }>(current: T[], imported: T[]): T[] {
  const knownIds = new Set(current.map((item) => item.id))
  const newItems: T[] = []

  imported.forEach((item) => {
    if (!item.id || knownIds.has(item.id)) {
      return
    }
    knownIds.add(item.id)
    newItems.push(item)
  })

  return [...current, ...newItems]
}

function ResumeUploadModal({
  open,
  formState,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: {
  open: boolean
  formState: ResumeUploadFormState
  isSaving: boolean
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onFieldChange: <Key extends keyof ResumeUploadFormState>(
    key: Key,
    value: ResumeUploadFormState[Key],
  ) => void
}) {
  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 backdrop-blur-[2px] px-4 transition-opacity duration-200 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        className={`w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 elevated transition-all duration-200 ${open ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-slate-900">上传简历</div>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              文件会保存在当前浏览器本地，可预览、下载并关联到申请记录。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            disabled={isSaving}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconClose />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="简历文件" required>
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required
              onChange={(event) => onFieldChange('file', event.target.files?.[0] ?? null)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-2.5 file:py-1.5 file:text-[12px] file:font-medium file:text-violet-700 hover:border-slate-300"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="简历名称">
              <input
                value={formState.name}
                onChange={(event) => onFieldChange('name', event.target.value)}
                placeholder={formState.file?.name.replace(/\.[^.]+$/, '') || '例如：产品经理版 V3'}
                className="input-base"
              />
            </Field>
            <Field label="方向分类">
              <input
                value={formState.category}
                onChange={(event) => onFieldChange('category', event.target.value)}
                placeholder="例如：产品 / 数据 / 运营"
                className="input-base"
              />
            </Field>
          </div>

          <Field label="备注">
            <textarea
              value={formState.note}
              onChange={(event) => onFieldChange('note', event.target.value)}
              rows={3}
              placeholder="可记录适合投递的岗位类型、修改重点等"
              className="input-base resize-none"
            />
          </Field>

          {formState.file ? (
            <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 text-[12px] text-violet-800">
              已选择：{formState.file.name} · {formatFileSize(formState.file.size)}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-primary rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? '保存中...' : '保存简历'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ResumePreviewModal({
  resume,
  onClose,
  onDelete,
}: {
  resume: ResumeProfile | null
  onClose: () => void
  onDelete: (resumeId: string) => void
}) {
  const canPreviewPdf = resume?.fileDataUrl && resume.fileType?.includes('pdf')

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 backdrop-blur-[2px] px-4 transition-opacity duration-200 ${resume ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 elevated transition-all duration-200 ${resume ? 'translate-y-0 scale-100' : 'translate-y-2 scale-[0.98]'}`}
        onClick={(event) => event.stopPropagation()}
      >
        {resume ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">简历预览</div>
                <div className="mt-1.5 text-lg font-semibold tracking-tight text-slate-900">{resume.name}</div>
                <div className="tabular mt-0.5 text-[13px] text-slate-500">
                  {resume.category}方向 · 使用 {resume.usedCount} 次
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <IconClose />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] text-slate-400">文件名称</div>
                <div className="mt-0.5 break-words text-[13px] font-medium text-slate-800">
                  {resume.fileName || '示例简历'}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] text-slate-400">文件大小</div>
                <div className="tabular mt-0.5 text-[13px] font-medium text-slate-800">
                  {formatFileSize(resume.fileSize)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="text-[11px] text-slate-400">最近使用</div>
                <div className="tabular mt-0.5 text-[13px] font-medium text-slate-800">
                  {formatDateTime(resume.lastUsed)}
                </div>
              </div>
            </div>

            {resume.note ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-[13px] leading-6 text-slate-600">
                {resume.note}
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {canPreviewPdf ? (
                <iframe
                  title={resume.name}
                  src={resume.fileDataUrl}
                  className="h-[52vh] min-h-[360px] w-full bg-white"
                />
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100">
                    <IconFile />
                  </div>
                  <div className="mt-3 text-[14px] font-semibold text-slate-900">
                    {resume.fileDataUrl ? '该文件类型暂不支持内嵌预览' : '这是一条内置示例简历'}
                  </div>
                  <p className="mt-1 max-w-sm text-[13px] leading-6 text-slate-500">
                    PDF 可以直接预览；Word 文件已保存，可通过下载按钮打开查看。
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onDelete(resume.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-[13px] font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
              >
                <IconTrash />
                删除简历
              </button>
              {resume.fileDataUrl ? (
                <a
                  href={resume.fileDataUrl}
                  download={resume.fileName || `${resume.name}.pdf`}
                  className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium"
                >
                  <IconUpload className="rotate-180" />
                  下载文件
                </a>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default App
