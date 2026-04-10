// Weather/sun/AQI response caching, keyed by lat/lon with TTLs.
// Each entry stored as: { data, timestamp, location: { lat, lon } }

export const WEATHER_CACHE_KEY = 'rsg_weather_cache'
export const SUN_CACHE_KEY     = 'rsg_daily_cache_v6' // v6: expanded hourly fields, index-based UV/wind extraction
export const AQI_CACHE_KEY     = 'rsg_aqi_cache_v2'   // v2: expanded to 7 days for per-day AQI

export const WEATHER_MAX_AGE = 30 * 60 * 1000      // 30 min
export const AQI_MAX_AGE     = 30 * 60 * 1000      // 30 min
export const SUN_MAX_AGE     = 6 * 60 * 60 * 1000  // 6 hours

export function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}

export function writeCache(key, data, lat, lon) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), location: { lat, lon } }))
  } catch { /* ignore */ }
}

export function cacheIsValid(entry, maxAge, lat, lon) {
  if (!entry?.timestamp || !entry?.location) return false
  if (Date.now() - entry.timestamp > maxAge) return false
  return Math.abs(entry.location.lat - lat) < 0.01 && Math.abs(entry.location.lon - lon) < 0.01
}

export function cacheAgeLabel(timestamp) {
  if (!timestamp) return ''
  const mins = Math.round((Date.now() - timestamp) / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins === 1) return 'Updated 1 min ago'
  return `Updated ${mins} min ago`
}
