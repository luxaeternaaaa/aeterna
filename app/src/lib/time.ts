const DEFAULT_TIMESTAMP_FALLBACK = 'No recorded time yet'

export function formatTimestamp(value?: string | null, fallback = DEFAULT_TIMESTAMP_FALLBACK) {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toLocaleString()
}
