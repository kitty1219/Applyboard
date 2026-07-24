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

async function deleteCloudRow(
  table: CloudTable,
  userId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)
    .eq('id', itemId)

  throwIfError(error)
}

export async function deleteCloudApplication(
  userId: string,
  applicationId: string,
): Promise<void> {
  await deleteCloudRow('applications', userId, applicationId)
}

export async function deleteCloudResource(
  userId: string,
  resourceId: string,
): Promise<void> {
  await deleteCloudRow('job_resources', userId, resourceId)
}

export async function deleteCloudResume(
  userId: string,
  resume: ResumeProfile,
): Promise<{ storageDeleted: boolean }> {
  const { error } = await supabase
    .from('resumes')
    .delete()
    .eq('user_id', userId)
    .eq('id', resume.id)

  throwIfError(error)

  if (!resume.storagePath) {
    return { storageDeleted: true }
  }

  const { error: storageError } = await supabase.storage
    .from('resumes')
    .remove([resume.storagePath])

  return { storageDeleted: !storageError }
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

function syncComparable(item: { id: string }): string {
  const comparable = { ...item } as Record<string, unknown>
  delete comparable.fileDataUrl
  return JSON.stringify(comparable)
}

function getChangedItems<T extends { id: string }>(items: T[], previousItems: T[]): T[] {
  const previousById = new Map(previousItems.map((item) => [item.id, item]))
  return items.filter((item) => {
    const previousItem = previousById.get(item.id)
    return !previousItem || syncComparable(item) !== syncComparable(previousItem)
  })
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

async function syncRows<T extends { id: string }>(
  table: CloudTable,
  userId: string,
  items: T[],
  previousItems: T[],
  preparedChangedItems?: T[],
): Promise<void> {
  const changedItems = preparedChangedItems ?? getChangedItems(items, previousItems)
  if (changedItems.length > 0) {
    const now = new Date().toISOString()
    const { error } = await supabase.from(table).upsert(
      changedItems.map((item) => ({
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

async function syncResumes(
  userId: string,
  resumes: ResumeProfile[],
  previousResumes: ResumeProfile[],
): Promise<void> {
  const changedResumes = getChangedItems(resumes, previousResumes)
  const preparedChangedResumes = await Promise.all(
    changedResumes.map((resume) => prepareResume(userId, resume)),
  )
  await syncRows('resumes', userId, resumes, previousResumes, preparedChangedResumes)
}

export async function syncCloudData(
  userId: string,
  data: CloudData,
  previousData: CloudData = { applications: [], resumes: [], resources: [] },
): Promise<void> {
  const tasks: Promise<void>[] = []

  if (data.applications !== previousData.applications) {
    tasks.push(
      syncRows('applications', userId, data.applications, previousData.applications),
    )
  }
  if (data.resumes !== previousData.resumes) {
    tasks.push(syncResumes(userId, data.resumes, previousData.resumes))
  }
  if (data.resources !== previousData.resources) {
    tasks.push(
      syncRows('job_resources', userId, data.resources, previousData.resources),
    )
  }

  await Promise.all(tasks)
}
