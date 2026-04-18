import type {
  Application,
  ApplicationStage,
  EmailAlert,
  MainStage,
  ProgressAxisStep,
} from './types'

export type RiskBadge = {
  label: string
  tone: 'rose' | 'amber' | 'emerald' | 'slate'
}

export type PriorityTask = {
  id: string
  text: string
  level: '高' | '中' | '低'
  tone: 'rose' | 'amber' | 'slate'
  score: number
}

const RESULT_WAITING_STAGES: ApplicationStage[] = [
  '测评中',
  '笔试1',
  '笔试2',
  '一面',
  '二面',
  '三面',
  'HR面',
]

export const MAIN_STAGE_COLUMNS: MainStage[] = [
  '待投递',
  '已投递',
  '笔试中',
  '面试中',
  'Offer中',
  '已结束',
]

const STAGE_TO_MAIN_STAGE: Record<ApplicationStage, MainStage> = {
  待投递: '待投递',
  已投递: '已投递',
  测评中: '笔试中',
  笔试1: '笔试中',
  笔试2: '笔试中',
  一面: '面试中',
  二面: '面试中',
  三面: '面试中',
  HR面: '面试中',
  Offer: 'Offer中',
  背调中: 'Offer中',
  已通过: '已结束',
  已淘汰: '已结束',
  已放弃: '已结束',
}

const STAGE_TO_PROGRESS_STEP: Record<ApplicationStage, ProgressAxisStep> = {
  待投递: '待投递',
  已投递: '已投递',
  测评中: '测评',
  笔试1: '笔试1',
  笔试2: '笔试2',
  一面: '一面',
  二面: '二面',
  三面: '三面',
  HR面: 'HR面',
  Offer: 'Offer',
  背调中: '背调',
  已通过: '结束',
  已淘汰: '结束',
  已放弃: '结束',
}

const DATETIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
})

export function getMainStage(stage: ApplicationStage): MainStage {
  return STAGE_TO_MAIN_STAGE[stage]
}

export function getProgressStepIndex(stage: ApplicationStage): number {
  const step = STAGE_TO_PROGRESS_STEP[stage]
  return [
    '待投递',
    '已投递',
    '测评',
    '笔试1',
    '笔试2',
    '一面',
    '二面',
    '三面',
    'HR面',
    'Offer',
    '背调',
    '结束',
  ].indexOf(step)
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return '待补充'
  }

  return DATETIME_FORMATTER.format(new Date(value))
}

export function formatDate(value?: string): string {
  if (!value) {
    return '待补充'
  }

  return DATE_FORMATTER.format(new Date(value))
}

function getTimestamp(value?: string): number | null {
  if (!value) {
    return null
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function getHoursDiff(target?: string): number | null {
  const time = getTimestamp(target)
  if (time === null) {
    return null
  }

  return (time - Date.now()) / (1000 * 60 * 60)
}

function getRelevantTime(application: Application): string | undefined {
  const { currentStage, stageMeta } = application

  switch (currentStage) {
    case '待投递':
      return stageMeta.applyDeadline
    case '测评中':
      return stageMeta.assessmentDeadline
    case '笔试1':
      return stageMeta.test1Deadline ?? stageMeta.test1Time
    case '笔试2':
      return stageMeta.test2Deadline ?? stageMeta.test2Time
    case '一面':
      return stageMeta.interview1Time
    case '二面':
      return stageMeta.interview2Time
    case '三面':
      return stageMeta.interview3Time
    case 'HR面':
      return stageMeta.hrInterviewTime
    case 'Offer':
      return stageMeta.offerConfirmTime
    case '背调中':
      return stageMeta.bgCheckDeadline
    case '已投递':
    case '已通过':
    case '已淘汰':
    case '已放弃':
      return undefined
  }
}

export function isWaitingForResult(application: Application): boolean {
  if (!RESULT_WAITING_STAGES.includes(application.currentStage)) {
    return false
  }

  const relevantTime = getRelevantTime(application)
  const hoursUntil = getHoursDiff(relevantTime)

  return hoursUntil !== null && hoursUntil < 0
}

export function getCurrentStageLabel(application: Application): string {
  return isWaitingForResult(application) ? '等待结果' : application.currentStage
}

export function getDetailedStageLabel(application: Application): string {
  return isWaitingForResult(application)
    ? `${application.currentStage}后等待结果`
    : application.currentStage
}

function formatRemainingTime(target?: string): string | null {
  const hours = getHoursDiff(target)
  if (hours === null || hours < 0) {
    return null
  }

  if (hours <= 24) {
    return `${Math.max(1, Math.ceil(hours))}小时内`
  }

  return `${Math.ceil(hours / 24)}天内`
}

function buildTimeBasedBadge(
  labelNow: string,
  labelSoon: string,
  hoursUntil: number | null,
): RiskBadge | null {
  if (hoursUntil === null || hoursUntil < 0) {
    return null
  }

  if (hoursUntil <= 48) {
    return { label: labelNow, tone: 'rose' }
  }

  if (hoursUntil <= 120) {
    return { label: labelSoon, tone: 'amber' }
  }

  return null
}

function getPriorityTask(application: Application): PriorityTask | null {
  const { currentStage, company, position, updatedAt } = application
  const targetTime = getRelevantTime(application)
  const hoursUntil = getHoursDiff(targetTime)
  const remaining = formatRemainingTime(targetTime)

  if (isWaitingForResult(application)) {
    return null
  }

  switch (currentStage) {
    case '待投递':
      if (!remaining || hoursUntil === null) {
        return null
      }
      return {
        id: application.id,
        text: `${company} ${position} ${remaining}截止投递`,
        level: hoursUntil <= 48 ? '高' : '中',
        tone: hoursUntil <= 48 ? 'rose' : 'amber',
        score: hoursUntil <= 48 ? 100 - hoursUntil : 70 - hoursUntil / 24,
      }
    case '测评中':
      if (!remaining || hoursUntil === null) {
        return {
          id: application.id,
          text: `${company} ${position} 测评待完成`,
          level: '中',
          tone: 'amber',
          score: 72,
        }
      }
      return {
        id: application.id,
        text: `${company} ${position} ${remaining}完成测评`,
        level: hoursUntil <= 48 ? '高' : '中',
        tone: hoursUntil <= 48 ? 'rose' : 'amber',
        score: hoursUntil <= 48 ? 96 - hoursUntil : 68 - hoursUntil / 24,
      }
    case '笔试1':
    case '笔试2':
      if (!remaining || hoursUntil === null) {
        return {
          id: application.id,
          text: `${company} ${position} 笔试待完成`,
          level: '中',
          tone: 'amber',
          score: 75,
        }
      }
      return {
        id: application.id,
        text: `${company} ${position} ${remaining}完成${currentStage}`,
        level: hoursUntil <= 48 ? '高' : '中',
        tone: hoursUntil <= 48 ? 'rose' : 'amber',
        score: hoursUntil <= 48 ? 92 - hoursUntil : 64 - hoursUntil / 24,
      }
    case '一面':
    case '二面':
    case '三面':
    case 'HR面':
      if (!remaining || hoursUntil === null) {
        return {
          id: application.id,
          text: `${company} ${position} ${currentStage}时间待确认`,
          level: '中',
          tone: 'amber',
          score: 62,
        }
      }
      return {
        id: application.id,
        text: `${company} ${position} ${remaining}进行${currentStage}`,
        level: hoursUntil <= 48 ? '高' : '中',
        tone: hoursUntil <= 48 ? 'rose' : 'amber',
        score: hoursUntil <= 48 ? 94 - hoursUntil : 66 - hoursUntil / 24,
      }
    case 'Offer':
      if (!remaining || hoursUntil === null) {
        return {
          id: application.id,
          text: `${company} ${position} 需要确认 Offer`,
          level: '中',
          tone: 'amber',
          score: 70,
        }
      }
      return {
        id: application.id,
        text: `${company} ${position} ${remaining}确认 Offer`,
        level: hoursUntil <= 72 ? '高' : '中',
        tone: hoursUntil <= 72 ? 'rose' : 'amber',
        score: hoursUntil <= 72 ? 88 - hoursUntil : 60 - hoursUntil / 24,
      }
    case '背调中':
      if (!remaining || hoursUntil === null) {
        return null
      }
      return {
        id: application.id,
        text: `${company} ${position} ${remaining}补齐背调材料`,
        level: hoursUntil <= 72 ? '高' : '中',
        tone: hoursUntil <= 72 ? 'rose' : 'amber',
        score: hoursUntil <= 72 ? 82 - hoursUntil : 56 - hoursUntil / 24,
      }
    case '已投递': {
      const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUpdate >= 7) {
        return {
          id: application.id,
          text: `${company} ${position} 已投递较久，建议跟进反馈`,
          level: '低',
          tone: 'slate',
          score: 35,
        }
      }
      return null
    }
    case '已通过':
    case '已淘汰':
    case '已放弃':
      return null
  }
}

export function getCurrentKeyTime(application: Application): string {
  const { currentStage, stageMeta } = application

  if (isWaitingForResult(application)) {
    switch (currentStage) {
      case '测评中':
        return '测评已完成，等待结果'
      case '笔试1':
      case '笔试2':
        return `${currentStage}已完成，等待结果`
      case '一面':
      case '二面':
      case '三面':
      case 'HR面':
        return `${currentStage}已完成，等待结果`
      default:
        break
    }
  }

  switch (currentStage) {
    case '待投递':
      return stageMeta.applyDeadline
        ? `投递截止：${formatDateTime(stageMeta.applyDeadline)}`
        : '待安排投递'
    case '已投递':
      return '等待反馈'
    case '测评中':
      return stageMeta.assessmentDeadline
        ? `测评截止：${formatDateTime(stageMeta.assessmentDeadline)}`
        : '测评待完成'
    case '笔试1':
      if (stageMeta.test1Time) {
        return `笔试1：${formatDateTime(stageMeta.test1Time)}`
      }
      if (stageMeta.test1Deadline) {
        return `笔试1截止：${formatDateTime(stageMeta.test1Deadline)}`
      }
      return '笔试1待安排'
    case '笔试2':
      if (stageMeta.test2Time) {
        return `笔试2：${formatDateTime(stageMeta.test2Time)}`
      }
      if (stageMeta.test2Deadline) {
        return `笔试2截止：${formatDateTime(stageMeta.test2Deadline)}`
      }
      return '笔试2待安排'
    case '一面':
      return stageMeta.interview1Time
        ? `一面时间：${formatDateTime(stageMeta.interview1Time)}`
        : '一面待确认'
    case '二面':
      return stageMeta.interview2Time
        ? `二面时间：${formatDateTime(stageMeta.interview2Time)}`
        : '二面待确认'
    case '三面':
      return stageMeta.interview3Time
        ? `三面时间：${formatDateTime(stageMeta.interview3Time)}`
        : '三面待确认'
    case 'HR面':
      return stageMeta.hrInterviewTime
        ? `HR面时间：${formatDateTime(stageMeta.hrInterviewTime)}`
        : 'HR面待确认'
    case 'Offer':
      return stageMeta.offerConfirmTime
        ? `Offer确认：${formatDateTime(stageMeta.offerConfirmTime)}`
        : 'Offer待确认'
    case '背调中':
      return stageMeta.bgCheckDeadline
        ? `背调截止：${formatDateTime(stageMeta.bgCheckDeadline)}`
        : '背调进行中'
    case '已通过':
      return '流程结束：已通过'
    case '已淘汰':
      return '流程结束：已淘汰'
    case '已放弃':
      return '流程结束：已放弃'
  }
}

export function getRiskBadges(application: Application): RiskBadge[] {
  const badges: RiskBadge[] = []
  const { currentStage, updatedAt } = application
  const relevantTime = getRelevantTime(application)
  const hoursUntil = getHoursDiff(relevantTime)

  if (isWaitingForResult(application)) {
    return [{ label: '等待结果', tone: 'slate' }]
  }

  if (currentStage === '待投递') {
    const badge = buildTimeBasedBadge('今日截止', '临近截止', hoursUntil)
    if (badge) {
      badges.push(badge)
    }
  }

  if (currentStage === '测评中') {
    const badge = buildTimeBasedBadge('测评即将截止', '待完成测评', hoursUntil)
    badges.push(badge ?? { label: '测评待完成', tone: 'amber' })
  }

  if (currentStage === '笔试1' || currentStage === '笔试2') {
    const badge = buildTimeBasedBadge('笔试即将开始/截止', '待完成笔试', hoursUntil)
    badges.push(badge ?? { label: '笔试待完成', tone: 'amber' })
  }

  if (currentStage === '一面' || currentStage === '二面' || currentStage === '三面' || currentStage === 'HR面') {
    const badge = buildTimeBasedBadge('面试临近', '待准备面试', hoursUntil)
    badges.push(badge ?? { label: '推进中', tone: 'emerald' })
  }

  if (currentStage === 'Offer') {
    const badge = buildTimeBasedBadge('Offer待确认', '需确认 Offer', hoursUntil)
    badges.push(badge ?? { label: '推进中', tone: 'emerald' })
  }

  if (currentStage === '背调中') {
    const badge = buildTimeBasedBadge('背调材料临近截止', '背调进行中', hoursUntil)
    badges.push(badge ?? { label: '推进中', tone: 'emerald' })
  }

  if (currentStage === '已投递') {
    const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate >= 7) {
      badges.push({ label: '等待过久', tone: 'slate' })
    }
  }

  if (badges.length === 0 && getMainStage(currentStage) !== '已结束') {
    badges.push({ label: '推进中', tone: 'emerald' })
  }

  return badges.slice(0, 2)
}

export function getStageFieldLabel(stage: ApplicationStage): string | null {
  switch (stage) {
    case '待投递':
      return '投递截止时间'
    case '已投递':
      return null
    case '测评中':
      return '测评截止时间'
    case '笔试1':
      return '笔试1时间 / 截止时间'
    case '笔试2':
      return '笔试2时间 / 截止时间'
    case '一面':
      return '一面时间'
    case '二面':
      return '二面时间'
    case '三面':
      return '三面时间'
    case 'HR面':
      return 'HR面时间'
    case 'Offer':
      return 'Offer确认时间'
    case '背调中':
      return '背调截止时间'
    case '已通过':
    case '已淘汰':
    case '已放弃':
      return null
  }
}

export function getPriorityItems(applications: Application[]): PriorityTask[] {
  return applications
    .map((application) => getPriorityTask(application))
    .filter((item): item is PriorityTask => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

export function classifyEmail(
  email: EmailAlert,
): { label: string; tone: string } {
  const text = `${email.subject} ${email.snippet}`.toLowerCase()

  if (/面试结果|流程更新|结果通知|结果/.test(text)) {
    return { label: '面试结果', tone: 'rose' }
  }

  if (/面试|interview|约面|面谈/.test(text)) {
    return { label: '面试邀请', tone: 'amber' }
  }

  if (/笔试|测评|assessment|online test|机试/.test(text)) {
    return { label: '笔试/测评通知', tone: 'blue' }
  }

  if (/offer|录用|结果|通过|淘汰|感谢/.test(text)) {
    return { label: 'Offer/结果通知', tone: 'emerald' }
  }

  return { label: '待确认邮件', tone: 'slate' }
}

export function groupApplicationsByMainStage(applications: Application[]) {
  return MAIN_STAGE_COLUMNS.map((stage) => ({
    stage,
    items: applications.filter((application) => getMainStage(application.currentStage) === stage),
  }))
}
