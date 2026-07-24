import { useMemo, useState } from 'react'
import {
  RESOURCE_CATEGORIES,
  type JobResource,
  type ResourceCategory,
} from './resourceStorage'

type ResourceFilter = '全部' | ResourceCategory

type ResourceFormState = {
  name: string
  url: string
  category: '' | ResourceCategory
  note: string
}

const initialFormState: ResourceFormState = {
  name: '',
  url: '',
  category: '',
  note: '',
}

const resourceFilters: ResourceFilter[] = ['全部', ...RESOURCE_CATEGORIES]

function IconLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="m10 14 11-11" />
      <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

function normalizeUrl(value: string): string | null {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`

  try {
    const parsed = new URL(withProtocol)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

function getUrlLabel(value: string) {
  try {
    const parsed = new URL(value)
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
  } catch {
    return value
  }
}

export default function ResourceLibraryPanel({
  resources,
  onResourcesChange,
}: {
  resources: JobResource[]
  onResourcesChange: React.Dispatch<React.SetStateAction<JobResource[]>>
}) {
  const [activeFilter, setActiveFilter] = useState<ResourceFilter>('全部')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [formState, setFormState] = useState<ResourceFormState>(initialFormState)
  const [formError, setFormError] = useState('')

  const filteredResources = useMemo(
    () =>
      activeFilter === '全部'
        ? resources
        : resources.filter((resource) => resource.category === activeFilter),
    [activeFilter, resources],
  )

  function openCreateModal() {
    setEditingResourceId(null)
    setFormState(initialFormState)
    setFormError('')
    setIsModalOpen(true)
  }

  function openEditModal(resource: JobResource) {
    setEditingResourceId(resource.id)
    setFormState({
      name: resource.name,
      url: resource.url,
      category: resource.category ?? '',
      note: resource.note ?? '',
    })
    setFormError('')
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingResourceId(null)
    setFormState(initialFormState)
    setFormError('')
  }

  function saveResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = formState.name.trim()
    const url = normalizeUrl(formState.url.trim())
    if (!name || !url) {
      setFormError(!name ? '请填写网站名称。' : '请输入有效的网址。')
      return
    }

    const now = new Date().toISOString()
    if (editingResourceId) {
      onResourcesChange((current) =>
        current.map((resource) =>
          resource.id === editingResourceId
            ? {
                ...resource,
                name,
                url,
                category: formState.category || undefined,
                note: formState.note.trim() || undefined,
                updatedAt: now,
              }
            : resource,
        ),
      )
    } else {
      onResourcesChange((current) => [
        {
          id: `resource-${crypto.randomUUID()}`,
          name,
          url,
          category: formState.category || undefined,
          note: formState.note.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ])
    }

    closeModal()
  }

  function deleteResource() {
    if (!editingResourceId) {
      return
    }
    if (!window.confirm('确定删除这条网址吗？')) {
      return
    }

    onResourcesChange((current) => current.filter((resource) => resource.id !== editingResourceId))
    closeModal()
  }

  return (
    <>
      <section className="flex h-[300px] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white card-soft">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-4">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100">
              <IconLink />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-title text-slate-900">机会导航</h2>
              <p className="mt-0.5 text-caption text-slate-500">保存招聘平台、企业官网与校招信息</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-micro font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
          >
            <IconPlus />
            添加网址
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2.5">
          <div className="mb-2 flex shrink-0 gap-1 overflow-x-auto pb-0.5">
            {resourceFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`shrink-0 rounded-full px-2 py-0.5 leading-3 transition ${
                  activeFilter === filter
                    ? 'bg-sky-600 font-medium text-white shadow-sm'
                    : 'bg-slate-100 font-normal text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                }`}
                style={{ fontSize: '9px' }}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {filteredResources.length > 0 ? (
              filteredResources.map((resource) => (
                <div
                  key={resource.id}
                  className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 transition hover:border-sky-200 hover:bg-sky-50/30"
                >
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    title={resource.note || resource.url}
                    className="min-w-0 flex-1"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-slate-800 group-hover:text-sky-700">
                        {resource.name}
                      </span>
                      {resource.category ? (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500">
                          {resource.category}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-[10.5px] text-slate-400">
                      {getUrlLabel(resource.url)}
                    </div>
                  </a>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`打开${resource.name}`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-sky-600"
                  >
                    <IconExternal />
                  </a>
                  <button
                    type="button"
                    onClick={() => openEditModal(resource)}
                    className="shrink-0 rounded-md px-1.5 py-1 text-[10.5px] text-slate-400 transition hover:bg-white hover:text-slate-700"
                  >
                    编辑
                  </button>
                </div>
              ))
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[12px] text-slate-500">
                该分类暂无网址，可以点击右上角添加。
              </div>
            )}
          </div>
        </div>
      </section>

      <div
        className={`fixed inset-0 z-[60] bg-slate-950/30 backdrop-blur-[2px] transition-opacity ${
          isModalOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={closeModal}
      />
      <div
        className={`fixed left-1/2 top-1/2 z-[70] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-2xl transition ${
          isModalOpen
            ? '-translate-y-1/2 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-[46%] scale-95 opacity-0'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={editingResourceId ? '编辑网址' : '添加网址'}
      >
        <form onSubmit={saveResource}>
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">
                {editingResourceId ? '编辑网址' : '添加网址'}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">仅网站名称和链接为必填项</p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="space-y-3.5 px-5 py-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-700">
                网站名称 <span className="text-rose-500">*</span>
              </span>
              <input
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="例如：秋招信息汇总"
                className="input-base"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-700">
                链接 <span className="text-rose-500">*</span>
              </span>
              <input
                value={formState.url}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, url: event.target.value }))
                }
                placeholder="https://docs.qq.com/..."
                className="input-base"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-700">分类（选填）</span>
              <select
                value={formState.category}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    category: event.target.value as '' | ResourceCategory,
                  }))
                }
                className="input-base"
              >
                <option value="">不分类</option>
                {RESOURCE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-700">备注（选填）</span>
              <input
                value={formState.note}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="例如：每日更新，重点关注产品岗位"
                className="input-base"
              />
            </label>

            {formError ? <div className="text-[12px] text-rose-600">{formError}</div> : null}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5">
            <div>
              {editingResourceId ? (
                <button
                  type="button"
                  onClick={deleteResource}
                  className="text-[12px] font-medium text-rose-600 hover:text-rose-700"
                >
                  删除网址
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                className="btn-primary rounded-lg px-4 py-2 text-[12px] font-medium"
              >
                {editingResourceId ? '保存修改' : '添加网址'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
