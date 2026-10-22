import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const supabaseProxyUrl = import.meta.env.VITE_SUPABASE_PROXY_URL as string | undefined

function supabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = input instanceof Request ? input.url : input.toString()

  if (!supabaseUrl || !supabaseProxyUrl || !requestUrl.startsWith(supabaseUrl)) {
    return fetch(input, init)
  }

  const proxyBaseUrl = new URL(supabaseProxyUrl, window.location.origin)
    .toString()
    .replace(/\/$/, '')
  const proxyRequestUrl = `${proxyBaseUrl}${requestUrl.slice(supabaseUrl.length)}`

  return input instanceof Request
    ? fetch(new Request(proxyRequestUrl, input), init)
    : fetch(proxyRequestUrl, init)
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = createClient(
  supabaseUrl ?? 'https://missing-config.supabase.co',
  supabasePublishableKey ?? 'missing-publishable-key',
  {
    global: {
      fetch: supabaseFetch,
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
