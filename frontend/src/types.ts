export const STAGE_OPTIONS = [
  '待投递',
  '已投递',
  '测评中',
  '笔试1',
  '笔试2',
  '一面',
  '二面',
  '三面',
  'HR面',
  'Offer',
  '背调中',
  '已通过',
  '已淘汰',
  '已放弃',
] as const

export const MAIN_STAGE_OPTIONS = [
  '待投递',
  '已投递',
  '笔试中',
  '面试中',
  'Offer中',
  '已结束',
] as const

export const PROGRESS_AXIS_STEPS = [
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
] as const

export type ApplicationStage = (typeof STAGE_OPTIONS)[number]
export type MainStage = (typeof MAIN_STAGE_OPTIONS)[number]
export type ProgressAxisStep = (typeof PROGRESS_AXIS_STEPS)[number]

export type StageMeta = {
  applyDeadline?: string
  assessmentDeadline?: string
  test1Time?: string
  test1Deadline?: string
  test2Time?: string
  test2Deadline?: string
  interview1Time?: string
  interview2Time?: string
  interview3Time?: string
  hrInterviewTime?: string
  offerConfirmTime?: string
  bgCheckDeadline?: string
}

export type Application = {
  id: string
  company: string
  position: string
  link: string
  currentStage: ApplicationStage
  stageMeta: StageMeta
  jdNote?: string
  resumeVersion?: string
  createdAt: string
  updatedAt: string
}

export type EmailAlert = {
  id: string
  from: string
  companyHint: string
  subject: string
  snippet: string
  receivedAt: string
  isRead: boolean
}

export type ResumeProfile = {
  id: string
  name: string
  category: string
  usedCount: number
  lastUsed: string
}

export type ViewMode = '看板视图' | '列表视图'
