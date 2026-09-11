import { useMemo, useState } from 'react'
import type { Application, StageMeta } from './types'
import {
  SCHEDULE_BLOCK_TYPES,
  SCHEDULE_PERIODS,
  type ScheduleBlock,
  type ScheduleBlockType,
  type SchedulePeriod,
} from './scheduleStorage'

type CalendarRange = 14 | 30

type CalendarEvent = {
  id: string
  date: string
  period: SchedulePeriod
  time?: string
  title: string
  detail: string
  type: ScheduleBlockType
  source: 'application' | 'manual'
  applicationId?: string
  block?: ScheduleBlock
}

type DeadlineReminder = {
  id: string
  date: string
  time: string
  label: string
  applicationId: string
}

type BlockFormState = {
  title: string
  date: string
  period: SchedulePeriod
  type: ScheduleBlockType
  exactTime: string
  applicationId: string
  note: string
}

const PERIOD_TIME_LABELS: Record<SchedulePeriod, string> = {
  上午: '08:00–12:00',
  下午: '12:00–18:00',
  晚上: '18:00–24:00',
}

const PERIOD_ACCENTS: Record<SchedulePeriod, string> = {
  上午: 'bg-sky-400',
  下午: 'bg-amber-400',
  晚上: 'bg-indigo-400',
}

const PERIOD_END_HOURS: Record<SchedulePeriod, number> = {
  上午: 12,
  下午: 18,
  晚上: 24,
}

const EVENT_STYLES: Record<ScheduleBlockType, string> = {
  面试: 'border-violet-200 bg-violet-50 text-violet-800',
  笔试: 'border-amber-200 bg-amber-50 text-amber-800',
  准备: 'border-sky-200 bg-sky-50 text-sky-800',
  个人安排: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  其他: 'border-slate-200 bg-slate-100 text-slate-700',
}

const TIMED_FIELDS: Array<{
  key: keyof StageMeta
  label: string
  type: ScheduleBlockType
}> = [
  { key: 'test1Time', label: '笔试1', type: '笔试' },
  { key: 'test2Time', label: '笔试2', type: '笔试' },
  { key: 'interview1Time', label: '一面', type: '面试' },
  { key: 'interview2Time', label: '二面', type: '面试' },
  { key: 'interview3Time', label: '三面', type: '面试' },
  { key: 'hrInterviewTime', label: 'HR面', type: '面试' },
]

const DEADLINE_FIELDS: Array<{ key: keyof StageMeta; label: string }> = [
  { key: 'applyDeadline', label: '投递截止' },
  { key: 'assessmentDeadline', label: '测评截止' },
  { key: 'test1Deadline', label: '笔试1截止' },
  { key: 'test2Deadline', label: '笔试2截止' },
  { key: 'offerConfirmTime', label: 'Offer确认' },
  { key: 'bgCheckDeadline', label: '背调截止' },
]

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' })
const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' })

function pad(value: number) {
  return `${value}`.padStart(2, '0')
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getPeriodFromHour(hour: number): SchedulePeriod | null {
  if (hour >= 8 && hour < 12) {
    return '上午'
  }
  if (hour >= 12 && hour < 18) {
    return '下午'
  }
  if (hour >= 18 && hour < 24) {
    return '晚上'
  }
  return null
}

function getPeriodFromTime(value: string): SchedulePeriod | null {
  const hour = Number(value.split(':')[0])
  return Number.isFinite(hour) ? getPeriodFromHour(hour) : null
}

function getTodayStart() {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

function buildVisibleDates(dayCount: CalendarRange) {
  const start = getTodayStart()
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

function buildApplicationSchedule(applications: Application[]) {
  const events: CalendarEvent[] = []
  const reminders: DeadlineReminder[] = []

  applications.forEach((application) => {
    if (['已通过', '已淘汰', '已放弃'].includes(application.currentStage)) {
      return
    }

    TIMED_FIELDS.forEach(({ key, label, type }) => {
      const value = application.stageMeta[key]
      const date = value ? parseDate(value) : null
      if (!date) {
        return
      }

      const period = getPeriodFromHour(date.getHours())
      if (!period) {
        return
      }

      events.push({
        id: `${application.id}-${key}`,
        date: toDateKey(date),
        period,
        time: formatTime(date),
        title: `${application.company} · ${label}`,
        detail: application.position,
        type,
        source: 'application',
        applicationId: application.id,
      })
    })

    DEADLINE_FIELDS.forEach(({ key, label }) => {
      const value = application.stageMeta[key]
      const date = value ? parseDate(value) : null
      if (!date) {
        return
      }

      const duplicateTimedEvent = TIMED_FIELDS.some(
        (field) => application.stageMeta[field.key] === value,
      )
      if (duplicateTimedEvent) {
        return
      }

      reminders.push({
        id: `${application.id}-${key}`,
        date: toDateKey(date),
        time: formatTime(date),
        label: `${application.company} · ${label}`,
        applicationId: application.id,
      })
    })
  })

  return { events, reminders }
}

function createInitialForm(date: string, period: SchedulePeriod): BlockFormState {
  return {
    title: '',
    date,
    period,
    type: '个人安排',
    exactTime: '',
    applicationId: '',
    note: '',
  }
}

export default function ScheduleCalendar({
  applications,
  blocks,
  onBlocksChange,
  onOpenApplication,
}: {
  applications: Application[]
  blocks: ScheduleBlock[]
  onBlocksChange: React.Dispatch<React.SetStateAction<ScheduleBlock[]>>
  onOpenApplication: (applicationId: string) => void
}) {
  const [range, setRange] = useState<CalendarRange>(14)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [form, setForm] = useState<BlockFormState>(() =>
    createInitialForm(toDateKey(getTodayStart()), '上午'),
  )
  const [formError, setFormError] = useState('')
  const dates = useMemo(() => buildVisibleDates(range), [range])
  const visibleDateKeys = useMemo(() => new Set(dates.map(toDateKey)), [dates])
  const applicationSchedule = useMemo(
    () => buildApplicationSchedule(applications),
    [applications],
  )
  const manualEvents = useMemo<CalendarEvent[]>(
    () =>
      blocks.map((block) => ({
        id: block.id,
        date: block.date,
        period: block.period,
        time: block.exactTime,
        title: block.title,
        detail: block.note ?? '',
        type: block.type,
        source: 'manual',
        applicationId: block.applicationId,
        block,
      })),
    [blocks],
  )
  const visibleEvents = useMemo(
    () =>
      [...applicationSchedule.events, ...manualEvents]
        .filter((event) => visibleDateKeys.has(event.date))
        .sort(
          (first, second) =>
            first.date.localeCompare(second.date) ||
            (first.time ?? '99:99').localeCompare(second.time ?? '99:99'),
        ),
    [applicationSchedule.events, manualEvents, visibleDateKeys],
  )
  const visibleReminders = useMemo(
    () => applicationSchedule.reminders.filter((reminder) => visibleDateKeys.has(reminder.date)),
    [applicationSchedule.reminders, visibleDateKeys],
  )
  const occupiedSlotCount = useMemo(
    () => new Set(visibleEvents.map((event) => `${event.date}-${event.period}`)).size,
    [visibleEvents],
  )
  const now = new Date()
  const todayKey = toDateKey(now)
  const currentTime = formatTime(now)
  const nextEvent = visibleEvents.find((event) => {
    if (event.date !== todayKey) {
      return event.date > todayKey
    }
    if (event.time) {
      return event.time >= currentTime
    }
    return PERIOD_END_HOURS[event.period] > now.getHours()
  })

  function openCreateModal(
    date = toDateKey(getTodayStart()),
    period: SchedulePeriod = getPeriodFromHour(new Date().getHours()) ?? '上午',
  ) {
    setEditingBlockId(null)
    setForm(createInitialForm(date, period))
    setFormError('')
    setIsModalOpen(true)
  }

  function openEditModal(block: ScheduleBlock) {
    setEditingBlockId(block.id)
    setForm({
      title: block.title,
      date: block.date,
      period: block.period,
      type: block.type,
      exactTime: block.exactTime ?? '',
      applicationId: block.applicationId ?? '',
      note: block.note ?? '',
    })
    setFormError('')
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingBlockId(null)
    setFormError('')
  }

  function saveBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title || !form.date) {
      setFormError(!title ? '请填写占用内容。' : '请选择日期。')
      return
    }

    const inferredPeriod = form.exactTime ? getPeriodFromTime(form.exactTime) : form.period
    if (!inferredPeriod) {
      setFormError('具体时间需在 08:00–23:59 之间。')
      return
    }

    const now = new Date().toISOString()
    if (editingBlockId) {
      onBlocksChange((current) =>
        current.map((block) =>
          block.id === editingBlockId
            ? {
                ...block,
                title,
                date: form.date,
                period: inferredPeriod,
                type: form.type,
                exactTime: form.exactTime || undefined,
                applicationId: form.applicationId || undefined,
                note: form.note.trim() || undefined,
                updatedAt: now,
              }
            : block,
        ),
      )
    } else {
      onBlocksChange((current) => [
        ...current,
        {
          id: `schedule-${crypto.randomUUID()}`,
          title,
          date: form.date,
          period: inferredPeriod,
          type: form.type,
          exactTime: form.exactTime || undefined,
          applicationId: form.applicationId || undefined,
          note: form.note.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        },
      ])
    }
    closeModal()
  }

  function deleteBlock() {
    if (!editingBlockId || !window.confirm('确定删除这条日程占用吗？')) {
      return
    }
    onBlocksChange((current) => current.filter((block) => block.id !== editingBlockId))
    closeModal()
  }

  function handleEventClick(event: CalendarEvent) {
    if (event.source === 'manual' && event.block) {
      openEditModal(event.block)
      return
    }
    if (event.applicationId) {
      onOpenApplication(event.applicationId)
    }
  }

  return (
    <>
      <section className="flex h-[min(84vh,1040px)] min-h-[620px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
              <span className="font-semibold text-slate-900">未来 {range} 天</span>
              <span className="text-slate-300">·</span>
              <span>{visibleEvents.length} 项安排</span>
              <span className="text-slate-300">·</span>
              <span>{occupiedSlotCount} 个时段已占用</span>
            </div>
            <div className="mt-1 text-[12px] text-slate-400">
              {nextEvent
                ? `最近安排：${nextEvent.date} ${nextEvent.time ?? nextEvent.period} ${nextEvent.title}`
                : '当前范围内没有已占用时段'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {([14, 30] as const).map((dayCount) => (
                <button
                  key={dayCount}
                  type="button"
                  onClick={() => setRange(dayCount)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                    range === dayCount
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  未来{dayCount}天
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="btn-primary rounded-lg px-3 py-2 text-[12px] font-medium"
            >
              + 添加占用
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="grid min-w-[1120px] grid-cols-7 gap-2.5">
            {dates.map((date, dateIndex) => {
              const dateKey = toDateKey(date)
              const isToday = dateIndex === 0
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              const dayEvents = visibleEvents.filter((event) => event.date === dateKey)
              const dayReminders = visibleReminders.filter((reminder) => reminder.date === dateKey)

              return (
                <article
                  key={dateKey}
                  className={`min-h-[238px] overflow-hidden rounded-xl border bg-white ${
                    isToday
                      ? 'border-indigo-300 shadow-[0_4px_14px_-8px_rgba(79,70,229,0.45)]'
                      : 'border-slate-200'
                  }`}
                >
                  <header className={`flex items-center justify-between border-b px-3 py-2.5 ${
                    isToday
                      ? 'border-indigo-100 bg-indigo-50/80'
                      : isWeekend
                        ? 'border-slate-100 bg-slate-50/80'
                        : 'border-slate-100'
                  }`}>
                    <div>
                      <span className="text-[15px] font-semibold text-slate-900">
                        {MONTH_DAY_FORMATTER.format(date)}
                      </span>
                      <span className="ml-1.5 text-[12px] text-slate-500">
                        {WEEKDAY_FORMATTER.format(date)}
                      </span>
                    </div>
                    {isToday ? (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">
                        今天
                      </span>
                    ) : null}
                  </header>

                  <div className="space-y-1.5 p-2">
                    {SCHEDULE_PERIODS.map((period) => {
                      const periodEvents = dayEvents.filter((event) => event.period === period)
                      const periodHasPassed = isToday && now.getHours() >= PERIOD_END_HOURS[period]
                      return (
                        <div key={period} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${PERIOD_ACCENTS[period]}`} />
                              <span className="text-[12px] font-medium text-slate-700">{period}</span>
                              <span className="text-[11px] text-slate-400">{PERIOD_TIME_LABELS[period]}</span>
                            </div>
                            {!periodHasPassed ? (
                              <button
                                type="button"
                                onClick={() => openCreateModal(dateKey, period)}
                                aria-label={`添加${dateKey}${period}占用`}
                                className="rounded px-1.5 py-0.5 text-[12px] text-slate-300 transition hover:bg-white hover:text-indigo-600"
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-1.5 space-y-1">
                            {periodEvents.length > 0 ? (
                              periodEvents.map((event) => (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => handleEventClick(event)}
                                  title={event.detail || event.title}
                                  className={`block w-full truncate rounded-md border px-2 py-1 text-left text-[12px] leading-4 transition hover:brightness-95 ${EVENT_STYLES[event.type]}`}
                                >
                                  {event.time ? <span className="mr-1 font-semibold">{event.time}</span> : null}
                                  {event.title}
                                </button>
                              ))
                            ) : periodHasPassed ? (
                              <div className="rounded-md border border-dashed border-slate-200 bg-slate-100/60 px-2 py-1 text-[12px] text-slate-400">
                                已过去
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openCreateModal(dateKey, period)}
                                className="block w-full rounded-md border border-dashed border-emerald-100 bg-emerald-50/40 px-2 py-1 text-left text-[12px] text-emerald-600/80 transition hover:border-emerald-200 hover:bg-emerald-50"
                              >
                                空闲
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {dayReminders.length > 0 ? (
                    <div className="border-t border-rose-100 bg-rose-50/60 px-3 py-2 text-[11px] leading-4 text-rose-600">
                      <button
                        type="button"
                        onClick={() => onOpenApplication(dayReminders[0].applicationId)}
                        className="block w-full truncate text-left hover:text-rose-800"
                      >
                        截止提醒 · {dayReminders[0].time} {dayReminders[0].label}
                      </button>
                      {dayReminders.length > 1 ? (
                        <div className="mt-0.5 text-rose-400">另有 {dayReminders.length - 1} 项截止提醒</div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <div
        className={`fixed inset-0 z-[80] bg-slate-950/30 backdrop-blur-[2px] transition-opacity ${
          isModalOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={closeModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editingBlockId ? '编辑日程占用' : '添加日程占用'}
        className={`fixed left-1/2 top-1/2 z-[90] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-2xl transition ${
          isModalOpen
            ? '-translate-y-1/2 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-[46%] scale-95 opacity-0'
        }`}
      >
        <form onSubmit={saveBlock}>
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">
                {editingBlockId ? '编辑日程占用' : '添加日程占用'}
              </h3>
              <p className="mt-1 text-[12px] text-slate-500">具体时间选填，填写后会自动归入对应时段。</p>
            </div>
            <button type="button" onClick={closeModal} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">×</button>
          </div>

          <div className="space-y-3.5 px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-700">占用内容 *</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：准备九坤一面"
                className="input-base"
                autoFocus
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-700">日期 *</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="input-base"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-700">类型</span>
                <select
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ScheduleBlockType }))}
                  className="input-base"
                >
                  {SCHEDULE_BLOCK_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-700">时段</span>
                <select
                  value={form.period}
                  onChange={(event) => setForm((current) => ({ ...current, period: event.target.value as SchedulePeriod }))}
                  className="input-base"
                >
                  {SCHEDULE_PERIODS.map((period) => (
                    <option key={period} value={period}>{period}（{PERIOD_TIME_LABELS[period]}）</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-700">具体时间（选填）</span>
                <input
                  type="time"
                  min="08:00"
                  max="23:59"
                  value={form.exactTime}
                  onChange={(event) => setForm((current) => ({ ...current, exactTime: event.target.value }))}
                  className="input-base"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-700">关联申请（选填）</span>
              <select
                value={form.applicationId}
                onChange={(event) => setForm((current) => ({ ...current, applicationId: event.target.value }))}
                className="input-base"
              >
                <option value="">不关联申请</option>
                {applications.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.company} · {application.position}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-700">备注（选填）</span>
              <input
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="例如：提前准备案例和自我介绍"
                className="input-base"
              />
            </label>
            {formError ? <div className="text-[12px] text-rose-600">{formError}</div> : null}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5">
            <div>
              {editingBlockId ? (
                <button type="button" onClick={deleteBlock} className="text-[12px] font-medium text-rose-600 hover:text-rose-700">
                  删除占用
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12px] text-slate-600 hover:bg-slate-50">
                取消
              </button>
              <button type="submit" className="btn-primary rounded-lg px-4 py-2 text-[12px] font-medium">
                {editingBlockId ? '保存修改' : '添加占用'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
