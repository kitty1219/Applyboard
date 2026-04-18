import { useMemo, useState } from 'react'
import { mockApplications, mockEmails, mockResumes } from './mockData'
import type { Application, ApplicationStage, ResumeProfile, StageMeta, ViewMode } from './types'
import { PROGRESS_AXIS_STEPS, STAGE_OPTIONS } from './types'
import {
  classifyEmail,
  formatDateTime,
  getCurrentKeyTime,
  getCurrentStageLabel,
  getDetailedStageLabel,
  getMainStage,
  getPriorityItems,
  getProgressStepIndex,
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

type StageFieldConfig = {
  key: keyof StageMeta
  label: string
  required?: boolean
}

const viewModes: ViewMode[] = ['看板视图', '列表视图']

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

const IconBell = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
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

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('看板视图')
  const [searchTerm, setSearchTerm] = useState('')
  const [applications, setApplications] = useState<Application[]>(mockApplications)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isEmailUploadModalOpen, setIsEmailUploadModalOpen] = useState(false)
  const [isResumeUploadModalOpen, setIsResumeUploadModalOpen] = useState(false)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [selectedResume, setSelectedResume] = useState<ResumeProfile | null>(null)
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
  const sortedEmails = useMemo(
    () =>
      [...mockEmails].sort((a, b) => {
        if (a.isRead !== b.isRead) {
          return a.isRead ? 1 : -1
        }

        return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      }),
    [],
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const newApplication = createApplicationFromForm(formState)
    setApplications((current) => [newApplication, ...current])
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
                  登录
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

          <PanelCard
            title="邮件提醒"
            description="基于邮箱邮件和关键词规则识别疑似通知"
            icon={<IconBell />}
            iconTone="amber"
            extra={
              <button
                type="button"
                onClick={() => setIsEmailUploadModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-micro font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <IconUpload className="text-slate-500" />
                上传邮箱
              </button>
            }
          >
            <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1">
              {sortedEmails.map((email) => {
                const tag = classifyEmail(email)
                return (
                  <div
                    key={email.id}
                    className={`relative shrink-0 overflow-hidden rounded-lg border p-3 transition hover:-translate-y-0.5 ${
                      email.isRead
                        ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_2px_6px_rgba(15,23,42,0.05)]'
                        : 'border-amber-200 bg-gradient-to-br from-amber-50/70 to-white hover:shadow-[0_4px_12px_-4px_rgba(245,158,11,0.2)]'
                    }`}
                  >
                    {!email.isRead ? (
                      <span className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-amber-500 to-amber-300" />
                    ) : null}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {!email.isRead ? (
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                            </span>
                          ) : null}
                          <div className="text-body-md font-semibold text-slate-900">{email.companyHint}</div>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            email.isRead ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70'
                          }`}>
                            {email.isRead ? '已查看' : '未查看'}
                          </span>
                        </div>
                        <div className="mt-1 text-caption text-slate-600">
                          疑似 <span className="font-medium text-slate-700">{email.companyHint}</span>
                          {tag.label}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsEmailUploadModalOpen(true)}
                        className="shrink-0 whitespace-nowrap rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-medium leading-tight text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700"
                      >
                        查看邮件
                      </button>
                    </div>
                    <div className="tabular mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="truncate">{email.from}</span>
                      <span>·</span>
                      <span>{formatDateTime(email.receivedAt)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </PanelCard>

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
              {mockResumes.map((resume) => (
                <button
                  key={resume.id}
                  type="button"
                  onClick={() => setSelectedResume(resume)}
                  className="group relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_4px_12px_-4px_rgba(139,92,246,0.18)]"
                >
                  <span className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-violet-400 to-violet-200 opacity-0 transition group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-body-md font-semibold text-slate-900">{resume.name}</div>
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                        {resume.category}方向
                      </div>
                    </div>
                    <span className="tabular shrink-0 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {resume.usedCount} 次
                    </span>
                  </div>
                  <div className="tabular mt-2 text-[11px] text-slate-400">最近使用：{formatDateTime(resume.lastUsed)}</div>
                </button>
              ))}
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
            <div className="h-full overflow-x-auto">
              <div className="grid min-w-[1260px] grid-cols-6 gap-3">
                {groupedApplications.map((group) => {
                  const accent = getMainStageAccent(group.stage)
                  return (
                    <div key={group.stage} className="flex flex-col rounded-lg border border-slate-200/70 bg-slate-50/60 p-2.5">
                      <div className="mb-2.5 flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${accent.dot} shadow-[0_0_0_3px_rgba(255,255,255,1)]`} />
                          <div className="text-[13px] font-semibold tracking-tight text-slate-900">{group.stage}</div>
                        </div>
                        <span className={`tabular rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${accent.chip} ${accent.text}`}>
                          {group.items.length}
                        </span>
                      </div>

                      <div className="space-y-2">
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
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[1400px] divide-y divide-slate-200 text-left">
                  <thead className="bg-slate-50/80">
                    <tr className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {[
                        '公司名称',
                        '岗位名称',
                        '招聘链接',
                        '当前大阶段',
                        '当前具体节点',
                        '当前关键时间',
                        '使用简历版本',
                        '风险提醒',
                        '流程进度',
                        '最近更新时间',
                        '操作',
                      ].map((title) => (
                        <th key={title} className="px-4 py-3 font-medium">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredApplications.map((application) => (
                      <tr
                        key={application.id}
                        className="cursor-pointer align-top transition hover:bg-slate-50/60"
                        onClick={() => openApplicationDetail(application.id)}
                      >
                        <td className="px-4 py-3.5 text-sm font-medium text-slate-900">{application.company}</td>
                        <td className="px-4 py-3.5">
                          <div className="group relative inline-flex max-w-[220px]">
                            <span className="line-clamp-1 text-sm text-slate-700">
                              {application.position}
                            </span>
                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-lg bg-slate-900 p-3 text-xs leading-5 text-white shadow-xl group-hover:block">
                              {application.jdNote || '暂无备注'}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <a
                            href={application.link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          >
                            查看
                            <IconExternal className="text-slate-400" />
                          </a>
                        </td>
                        <td className="px-4 py-3.5">
                          {(() => {
                            const accent = getMainStageAccent(getMainStage(application.currentStage))
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${accent.chip} ${accent.text}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                                {getMainStage(application.currentStage)}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">
                            {getDetailedStageLabel(application)}
                          </span>
                        </td>
                        <td className="tabular px-4 py-3.5 text-[13px] text-slate-600">{getCurrentKeyTime(application)}</td>
                        <td className="px-4 py-3.5 text-[13px] text-slate-600">{application.resumeVersion || '未指定'}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex max-w-[180px] flex-wrap gap-1">
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
                              <span className="text-[13px] text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <ProgressMiniAxis currentStage={application.currentStage} />
                        </td>
                        <td className="tabular px-4 py-3.5 text-[13px] text-slate-500">{formatDateTime(application.updatedAt)}</td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openApplicationDetail(application.id)
                            }}
                            className="btn-primary inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium"
                          >
                            更新状态
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      <ApplicationDrawer
        open={isDrawerOpen}
        title="新增申请"
        formState={formState}
        dynamicFields={dynamicFields}
        onClose={() => setIsDrawerOpen(false)}
        onSubmit={handleSubmit}
        onFieldChange={updateFormField}
        onStageMetaChange={updateStageMeta}
      />

      <ApplicationDetailPanel
        application={selectedApplication}
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
        onClose={() => setSelectedApplicationId(null)}
      />

      <ImportPlaceholderModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <FeaturePlaceholderModal
        open={isEmailUploadModalOpen}
        title="上传邮箱"
        description="当前版本仅保留邮箱接入入口，后续可支持绑定 163 邮箱、QQ 邮箱和企业邮箱，并同步邮件抓取。"
        note="规划方向：当前版本使用关键词与规则匹配识别邮件类型，后续可升级为 AI 识别，自动判断面试、笔试、面试结果和 Offer 类邮件。"
        confirmText="稍后再说"
        onClose={() => setIsEmailUploadModalOpen(false)}
      />

      <FeaturePlaceholderModal
        open={isResumeUploadModalOpen}
        title="上传简历 PDF"
        description="当前版本仅保留简历 PDF 上传入口，后续版本可支持上传、解析与版本管理。"
        note="规划方向：支持上传 PDF、提取基本信息、记录版本备注，并和岗位申请进行关联。"
        confirmText="我知道了"
        onClose={() => setIsResumeUploadModalOpen(false)}
      />

      <FeaturePlaceholderModal
        open={isLoginModalOpen}
        title="用户登录"
        description="当前版本仅保留登录入口展示，不实现真实账号体系与身份校验。"
        note="规划方向：后续可接入手机号、邮箱验证码或第三方账号登录，并保存个人求职数据。"
        confirmText="关闭"
        onClose={() => setIsLoginModalOpen(false)}
      />

      <ResumePreviewModal
        resume={selectedResume}
        onClose={() => setSelectedResume(null)}
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

      <div className="mt-2.5 flex justify-end border-t border-slate-100 pt-2.5">
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
                    ? 'h-2.5 w-2.5 bg-indigo-600 ring-[3px] ring-indigo-600/20'
                    : active
                      ? 'h-2 w-2 bg-indigo-500'
                      : 'h-2 w-2 bg-slate-200'
                }`}
              />
              {index < PROGRESS_AXIS_STEPS.length - 1 ? (
                <div
                  className={`h-[2px] flex-1 rounded-full ${
                    active
                      ? index < currentIndex
                        ? 'bg-indigo-500'
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
        <span className="font-medium text-indigo-600">{currentStage}</span>
      </div>
    </div>
  )
}

function ApplicationDrawer({
  open,
  title,
  formState,
  dynamicFields,
  onClose,
  onSubmit,
  onFieldChange,
  onStageMetaChange,
}: {
  open: boolean
  title: string
  formState: DrawerFormState
  dynamicFields: StageFieldConfig[]
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
                value={formState.resumeVersion}
                onChange={(event) => onFieldChange('resumeVersion', event.target.value)}
                placeholder="例如：产品经理版 V3"
                className="input-base"
              />
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
  statusDraft,
  statusStageMeta,
  statusDynamicFields,
  onStatusDraftChange,
  onStatusStageMetaChange,
  onSaveStage,
  onClose,
}: {
  application: Application | null
  statusDraft: ApplicationStage
  statusStageMeta: StageMeta
  statusDynamicFields: StageFieldConfig[]
  onStatusDraftChange: (stage: ApplicationStage) => void
  onStatusStageMetaChange: (key: keyof StageMeta, value: string) => void
  onSaveStage: (applicationId: string) => void
  onClose: () => void
}) {
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

              <section className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 card-soft">
                <SectionTitle>基础信息</SectionTitle>
                <div className="mt-1 grid gap-2">
                  <InfoItem label="公司名称" value={application.company} />
                  <InfoItem label="岗位名称" value={application.position} />
                  <InfoItem label="招聘链接" value={application.link} />
                  <InfoItem label="使用简历版本" value={application.resumeVersion || '未指定'} />
                  <InfoItem label="创建时间" value={formatDateTime(application.createdAt)} />
                  <InfoItem label="最近更新时间" value={formatDateTime(application.updatedAt)} />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 card-soft">
                <SectionTitle>岗位备注 / JD 摘要</SectionTitle>
                <p className="mt-2 text-[13px] leading-6 text-slate-600">
                  {application.jdNote || '暂无备注'}
                </p>
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
}: {
  open: boolean
  onClose: () => void
}) {
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
          当前版本仅保留批量导入入口与提示文案，后续版本可支持 Excel / CSV 文件导入。
        </p>
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3.5 text-[12px] leading-5 text-slate-500">
          规划提示：后续可在此接入模板下载、字段映射、导入预校验和错误回显。
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary rounded-lg px-3.5 py-2 text-[13px] font-medium"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  )
}

function FeaturePlaceholderModal({
  open,
  title,
  description,
  note,
  confirmText,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  note: string
  confirmText: string
  onClose: () => void
}) {
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
          <div className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-6 text-slate-600">{description}</p>
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3.5 text-[12px] leading-5 text-slate-500">
          {note}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary rounded-lg px-3.5 py-2 text-[13px] font-medium"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResumePreviewModal({
  resume,
  onClose,
}: {
  resume: ResumeProfile | null
  onClose: () => void
}) {
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

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
                <div className="text-[14px] font-semibold text-slate-900">简历预览占位</div>
                <p className="mt-2 text-[13px] leading-6 text-slate-600">
                  当前版本暂未接入真实 PDF 上传与预览能力，这里先展示简历查看入口和预览占位区域。
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] text-slate-400">简历名称</div>
                    <div className="mt-0.5 text-[13px] font-medium text-slate-800">{resume.name}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] text-slate-400">简历方向</div>
                    <div className="mt-0.5 text-[13px] font-medium text-slate-800">{resume.category}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                    <div className="text-[11px] text-slate-400">最近使用</div>
                    <div className="tabular mt-0.5 text-[13px] font-medium text-slate-800">
                      {formatDateTime(resume.lastUsed)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 px-3.5 py-2.5 text-[12px] leading-5 text-indigo-50 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.5)]">
                  后续可在这里接入 PDF 预览、版本比较、下载和关联岗位记录。
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default App
