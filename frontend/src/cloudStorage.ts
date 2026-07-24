import type { Application, ResumeProfile } from './types'
import type { JobResource } from './resourceStorage'
import { supabase } from './supabase'

type CloudTable = 'applications' | 'resumes' | 'job_resources'

type CloudRow<T> = {
  id: string
  payload: T
}

export type CloudData = {
  applications: Application[]
  resumes: ResumeProfile[]
  resources: JobResource[]
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message)
  }
}

async function loadRows<T>(table: CloudTable, userId: string): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select('id,payload')
    .eq('user_id', userId)

  throwIfError(error)
  return ((data ?? []) as CloudRow<T>[]).map((row) => row.payload)
}

async function addSignedResumeUrls(resumes: ResumeProfile[]): Promise<ResumeProfile[]> {
  return Promise.all(
    resumes.map(async (resume) => {
      if (!resume.storagePath) {
        return resume
      }

      const { data, error } = await supabase.storage
        .from('resumes')
        .createSignedUrl(resume.storagePath, 60 * 60 * 24)

      if (error || !data?.signedUrl) {
        return resume
      }

      return { ...resume, fileDataUrl: data.signedUrl }
    }),
  )
}

export async function loadCloudData(userId: string): Promise<CloudData> {
  const [applications, resumes, resources] = await Promise.all([
    loadRows<Application>('applications', userId),
    loadRows<ResumeProfile>('resumes', userId),
    loadRows<JobResource>('job_resources', userId),
  ])

  return {
    applications,
    resumes: await addSignedResumeUrls(resumes),
    resources,
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const separatorIndex = dataUrl.indexOf(',')
  if (separatorIndex === -1) {
    throw new Error('简历文件内容格式无效')
  }

  const metadata = dataUrl.slice(0, separatorIndex)
  const encoded = dataUrl.slice(separatorIndex + 1)
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const binary = metadata.includes(';base64') ? window.atob(encoded) : decodeURIComponent(encoded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

function safeFileName(fileName: string): string {
  const extension = fileName.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase()
  return extension ? `document.${extension}` : 'document.bin'
}

async function prepareResume(userId: string, resume: ResumeProfile): Promise<ResumeProfile> {
  if (!resume.fileDataUrl?.startsWith('data:')) {
    const storedResume = { ...resume }
    delete storedResume.fileDataUrl
    return storedResume
  }

  const fileName = safeFileName(resume.fileName ?? `${resume.id}.bin`)
  const storagePath = `${userId}/${resume.id}/${fileName}`
  const blob = dataUrlToBlob(resume.fileDataUrl)
  const { error } = await supabase.storage.from('resumes').upload(storagePath, blob, {
    contentType: resume.fileType ?? blob.type,
    upsert: true,
  })

  throwIfError(error)
  const storedResume = { ...resume }
  delete storedResume.fileDataUrl
  return { ...storedResume, storagePath }
}

async function replaceRows<T extends { id: string }>(
  table: CloudTable,
  userId: string,
  items: T[],
): Promise<void> {
  const { data: existingData, error: existingError } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)

  throwIfError(existingError)
  const itemIds = new Set(items.map((item) => item.id))
  const deletedIds = (existingData ?? [])
    .map((row) => row.id as string)
    .filter((id) => !itemIds.has(id))

  if (deletedIds.length > 0) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)
      .in('id', deletedIds)
    throwIfError(error)
  }

  if (items.length > 0) {
    const now = new Date().toISOString()
    const { error } = await supabase.from(table).upsert(
      items.map((item) => ({
        user_id: userId,
        id: item.id,
        payload: item,
        updated_at: now,
      })),
      { onConflict: 'user_id,id' },
    )
    throwIfError(error)
  }
}

async function syncResumes(userId: string, resumes: ResumeProfile[]): Promise<void> {
  const { data: existingData, error: existingError } = await supabase
    .from('resumes')
    .select('id,payload')
    .eq('user_id', userId)

  throwIfError(existingError)
  const resumeIds = new Set(resumes.map((resume) => resume.id))
  const deletedRows = ((existingData ?? []) as CloudRow<ResumeProfile>[]).filter(
    (row) => !resumeIds.has(row.id),
  )
  const deletedPaths = deletedRows
    .map((row) => row.payload.storagePath)
    .filter((path): path is string => Boolean(path))

  if (deletedPaths.length > 0) {
    const { error } = await supabase.storage.from('resumes').remove(deletedPaths)
    throwIfError(error)
  }

  const preparedResumes = await Promise.all(
    resumes.map((resume) => prepareResume(userId, resume)),
  )
  await replaceRows('resumes', userId, preparedResumes)
}

export async function syncCloudData(userId: string, data: CloudData): Promise<void> {
  await Promise.all([
    replaceRows('applications', userId, data.applications),
    syncResumes(userId, data.resumes),
    replaceRows('job_resources', userId, data.resources),
  ])
}
