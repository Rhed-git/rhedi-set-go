import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'

// Splash timing (ms):
// 0 → Rhedi, 600 → Set, 1200 → Go, 1600 → slogan, 2600 → fade out, 3200 → remove

function SplashScreen() {
  const [showWith,       setShowWith]       = useState(false)
  const [showConfidence, setShowConfidence] = useState(false)
  const [showSub,        setShowSub]        = useState(false)
  const [fading,         setFading]         = useState(false)
  const [gone,           setGone]           = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowWith(true),       600)
    const t2 = setTimeout(() => setShowConfidence(true), 1200)
    const t3 = setTimeout(() => setShowSub(true),        1600)
    const t4 = setTimeout(() => setFading(true),         2600)
    const t5 = setTimeout(() => setGone(true),           3200)
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout)
  }, [])

  if (gone) return null

  const wordStyle = {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 56,
    color: '#f5f2eb',
    lineHeight: 1.1,
    textAlign: 'center',
    animation: 'slideUpFadeIn 0.5s ease forwards',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#2d4a1e',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.6s ease',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        <span style={wordStyle}>Send</span>
        {showWith       && <span style={wordStyle}>with</span>}
        {showConfidence && <span style={wordStyle}>Confidence</span>}
      </div>
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 15, color: '#f5f2eb',
        opacity: showSub ? 0.7 : 0,
        marginTop: 32,
        transition: 'opacity 0.5s ease',
        textAlign: 'center',
      }}>
        powered by Rhed
      </div>
    </div>
  )
}

// ─── Data ────────────────────────────────────────────────────────────────────

// Dynamic today label — computed once per session
const TODAY_LABEL = (() => {
  const d = new Date()
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${days[d.getDay()]} · ${months[d.getMonth()]} ${d.getDate()}`
})()

const usStateAbbr = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
  'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
  'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
  'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
  'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
}

const NOMINATIM_HEADERS = { 'User-Agent': 'RhediSetGo/1.0' }

// ─── Cache helpers ────────────────────────────────────────────────────────────

const WEATHER_CACHE_KEY = 'rsg_weather_cache'
const SUN_CACHE_KEY     = 'rsg_daily_cache_v3' // v3: now also fetches hourly european_aqi from Open-Meteo
const WEATHER_MAX_AGE   = 30 * 60 * 1000      // 30 min
const SUN_MAX_AGE       = 6 * 60 * 60 * 1000  // 6 hours

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}

function writeCache(key, data, lat, lon) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), location: { lat, lon } }))
  } catch {}
}

function cacheIsValid(entry, maxAge, lat, lon) {
  if (!entry?.timestamp || !entry?.location) return false
  if (Date.now() - entry.timestamp > maxAge) return false
  return Math.abs(entry.location.lat - lat) < 0.01 && Math.abs(entry.location.lon - lon) < 0.01
}

function cacheAgeLabel(timestamp) {
  if (!timestamp) return ''
  const mins = Math.round((Date.now() - timestamp) / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins === 1) return 'Updated 1 min ago'
  return `Updated ${mins} min ago`
}

// ─── Preferences framework ────────────────────────────────────────────────────
// Default values produce identical behavior to the original engine — nothing
// changes until the user explicitly updates a preference via setPreferences().

const PREFS_STORAGE_KEY = 'rsg_user_preferences'

const defaultPreferences = {
  preferredRideTime: null,   // null = no preference | 0-23 = hour of day (e.g. 7 = 7am)
  riskTolerance: 'cautious', // 'cautious' (strictest) | 'moderate' | 'aggressive'
  soilType: 'auto',          // 'auto' (1.0x) | 'sandy' (0.7x) | 'clay' (1.4x) | 'loam' (1.0x)
}

// Returns merged preferences from localStorage + defaults.
// The bottom sheet settings UI will call this when it renders.
function getPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? 'null')
    return saved ? { ...defaultPreferences, ...saved } : { ...defaultPreferences }
  } catch {
    return { ...defaultPreferences }
  }
}

// Persists preferences to localStorage.
// The bottom sheet settings UI will call this when a preference changes.
function setPreferences(prefs) {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {}
}

function formatResult(item) {
  const parts = (item.display_name ?? '').split(',').map(s => s.trim())
  const city  = parts[0] ?? ''
  const state = parts.find(p => usStateAbbr[p]) ?? ''
  const abbr  = usStateAbbr[state] ?? state
  return { label: city && abbr ? `${city}, ${abbr}` : parts.slice(0, 2).join(', '), lat: item.lat, lon: item.lon }
}

// ─── LocationSearch (inline, used inside sheet) ───────────────────────────────

function LocationSearch({ gpsCoords, onSelect, onClose, onUseGPS }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (query.length < 3) { setResults([]); return }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`,
          { headers: NOMINATIM_HEADERS }
        )
        const data = await res.json()
        setResults(data.map(formatResult))
      } catch { setResults([]) }
    }, 350)
    return () => clearTimeout(id)
  }, [query])

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search city or zip code..."
          style={{
            flex: 1,
            background: '#f8f6f2',
            border: '1.5px solid #5a7a3a',
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 14,
            color: '#2c2c1e',
            outline: 'none',
            fontFamily: "'DM Sans', sans-serif",
          }}
        />
        <button
          onClick={onClose}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#ece8e0', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#5c5a50', flexShrink: 0,
          }}
        >✕</button>
      </div>

      {(results.length > 0 || gpsCoords) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
          background: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          overflow: 'hidden',
        }}>
          {gpsCoords && (
            <button onClick={onUseGPS} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f0ece4',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, color: '#5a7a3a', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              <PinIcon /> Use my location
            </button>
          )}
          {results.map((r, i) => (
            <button key={i} onClick={() => onSelect(r)} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: '12px 14px', cursor: 'pointer',
              borderBottom: i < results.length - 1 ? '1px solid #f0ece4' : 'none',
              fontSize: 13, color: '#2c2c1e',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Shared icons ─────────────────────────────────────────────────────────────

function PinIcon({ color = '#5a7a3a' }) {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M6.5 0C3.186 0 .5 2.686.5 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6zm0 8.5A2.5 2.5 0 1 1 6.5 3.5 2.5 2.5 0 0 1 6.5 8.5z" fill={color}/>
    </svg>
  )
}

// ─── BottomSheet ──────────────────────────────────────────────────────────────

const SECTION_LABEL = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
  color: '#8a8475', textTransform: 'uppercase', marginBottom: 12,
}

const DIVIDER = { height: 1, background: '#ece8e0', margin: '20px 0' }

function BottomSheet({ open, onClose, locationName, gpsCoords, onSelectLocation, onUseGPS }) {
  const [searching, setSearching] = useState(false)

  // Reset search state whenever sheet closes
  useEffect(() => { if (!open) setSearching(false) }, [open])

  return (
    <>
      {/* Overlay — starts below the iOS status bar via safe-area-inset-top so the
           status bar is never covered or dimmed. pointer-events:none ensures no
           touch interception; the sheet's Done button handles dismissal. */}
      <div
        style={{
          position: 'fixed',
          top: 'env(safe-area-inset-top)',
          left: 0, right: 0, bottom: 0,
          zIndex: 40,
          background: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 300ms ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#ffffff',
        borderRadius: '24px 24px 0 0',
        padding: '12px 22px 40px',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 300ms ease',
        maxWidth: 430,
        margin: '0 auto',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: '#d6d0c4' }} />
        </div>

        {/* Location */}
        <div style={SECTION_LABEL}>Location</div>
        {searching ? (
          <LocationSearch
            gpsCoords={gpsCoords}
            onSelect={r => { onSelectLocation(r); setSearching(false) }}
            onUseGPS={() => { onUseGPS(); setSearching(false) }}
            onClose={() => setSearching(false)}
          />
        ) : (
          <button
            onClick={() => setSearching(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f8f6f2', border: '1px solid #ddd8ce',
              borderRadius: 10, padding: '10px 14px', width: '100%',
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <PinIcon />
            <span style={{ fontSize: 14, color: '#2c2c1e', fontWeight: 500 }}>{locationName}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8a8475' }}>Change</span>
          </button>
        )}

        <div style={DIVIDER} />

        {/* Activity */}
        <div style={SECTION_LABEL}>Activity</div>
        <div className="flex gap-2">
          {[
            { label: 'MTB',   active: true  },
            { label: 'Run',   active: false },
            { label: 'Hike',  active: false },
            { label: 'Cycle', active: false },
          ].map(({ label, active }) => (
            <div key={label} style={{
              background: active ? '#1e3a5a' : '#d6d0c4',
              color: active ? '#b5d4f4' : '#8a8475',
              opacity: active ? 1 : 0.6,
              borderRadius: 999,
              fontSize: 13, fontWeight: 500,
              padding: '7px 14px',
              flex: 1, textAlign: 'center',
            }}>
              {label}
              {!active && <div style={{ fontSize: 9, opacity: 0.8, marginTop: 1 }}>soon</div>}
            </div>
          ))}
        </div>

        <div style={DIVIDER} />

        {/* Distance */}
        <div style={SECTION_LABEL}>Distance</div>
        <div className="flex gap-2">
          {[
            { label: '10 mi', active: false },
            { label: '25 mi', active: true  },
            { label: '50 mi', active: false },
          ].map(({ label, active }) => (
            <div key={label} style={{
              background: active ? '#1e3a5a' : 'transparent',
              color: active ? '#b5d4f4' : '#5c5a50',
              border: active ? 'none' : '1px solid #c8c3b8',
              borderRadius: 999,
              fontSize: 13, fontWeight: 500,
              padding: '7px 20px',
            }}>
              {label}
            </div>
          ))}
        </div>

        <div style={DIVIDER} />

        {/* Done */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            background: '#2d4a1e',
            color: '#f5f2eb',
            border: 'none',
            borderRadius: 14,
            padding: '15px',
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </>
  )
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayAbbr(isoString) {
  return DAY_ABBR[new Date(isoString).getDay()]
}

function epaLabel(idx) {
  if (idx == null) return '--'
  if (idx <= 50)   return 'Good'
  if (idx <= 100)  return 'Moderate'
  if (idx <= 150)  return 'Poor'
  return 'Very Poor'
}

// Maps Open-Meteo european_aqi (0–100+) to the same label set as epaLabel
function europeanAqiLabel(val) {
  if (val == null) return null
  if (val < 40)   return 'Good'
  if (val < 60)   return 'Moderate'
  if (val < 80)   return 'Poor'
  return 'Very Poor'
}

function epaIsGood(label) {
  return label === 'Good'
}

function formatTime(isoString) {
  // isoString from Open-Meteo is like "2026-04-05T06:42"
  const d = new Date(isoString)
  let h = d.getHours(), m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}

function sunDisplay(sunTimes) {
  // Returns { icon, value, label } for the conditions strip
  if (!sunTimes?.length) return { icon: '🌅', value: '--', label: 'Sunset' }
  const now = new Date()
  const today = sunTimes[0]
  const rise  = new Date(today.sunrise)
  const set   = new Date(today.sunset)

  if (now < rise) {
    return { icon: '🌄', value: formatTime(today.sunrise), label: 'Sunrise' }
  }
  if (now < set) {
    return { icon: '🌅', value: formatTime(today.sunset), label: 'Sunset' }
  }
  // After sunset — show tomorrow's sunrise if available
  const tomorrow = sunTimes[1]
  if (tomorrow) {
    return { icon: '🌄', value: formatTime(tomorrow.sunrise), label: 'Tmrw sunrise' }
  }
  return { icon: '🌅', value: formatTime(today.sunset), label: 'Sunset' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  if (status === 'go')      return <span style={{ color: '#5a7a3a' }} className="text-lg">✓</span>
  if (status === 'caution') return <span style={{ color: '#c97c2a' }} className="text-lg">!</span>
  return                           <span style={{ color: '#c0392b' }} className="text-lg">✕</span>
}

// ─── Decision Engine ──────────────────────────────────────────────────────────

// Tomorrow.io weather codes that indicate active precipitation
const RAIN_CODES = new Set([4000, 4001, 4200, 4201, 6000, 6001, 6200, 6201, 8000])

function computeVerdict({
  dailyIntervals,
  hourlyIntervals,     // full hourly timeline from the API
  currentTemp,
  currentHumidity,
  weatherCodeNow,
  precipIntensityNow,
  sunTimes,
  preferences,         // userPreferences object
}) {
  const now = new Date()
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0)

  // ── [PREF: riskTolerance] derive thresholds ──────────────────────────────
  // 'cautious' preserves original thresholds exactly.
  // 'moderate' and 'aggressive' relax them so the rider sees more green windows.
  //
  // Humidity: max % before flagging caution
  const humidityThreshold =
    preferences.riskTolerance === 'aggressive' ? 95 :
    preferences.riskTolerance === 'moderate'   ? 90 : 85  // cautious default (original)

  // Dryout caution fraction: fraction of dryout time that must elapse before
  // transitioning from nogo → caution. Higher = earlier escape from nogo.
  //   cautious:   75% elapsed → caution  (original)
  //   moderate:   60% elapsed → caution
  //   aggressive: 50% elapsed → caution
  const dryoutCautionFraction =
    preferences.riskTolerance === 'aggressive' ? 0.50 :
    preferences.riskTolerance === 'moderate'   ? 0.60 : 0.75  // cautious default (original)

  // ── [PREF: soilType] dryout speed multiplier ─────────────────────────────
  // Applied to dryoutHoursNeeded. Sandy soil drains faster; clay holds water longer.
  //   sandy: 0.7x | clay: 1.4x | loam: 1.0x | auto: 1.0x (until USDA data is wired in)
  const soilMultiplier =
    preferences.soilType === 'sandy' ? 0.7 :
    preferences.soilType === 'clay'  ? 1.4 : 1.0

  // ── [Problem 1] Sum hourly rainfall already fallen today (midnight → now) ──
  // We use this — not the daily aggregate — for dryout calculations, because
  // the daily total includes forecasted rain that hasn't fallen yet. That would
  // incorrectly inflate the dryout estimate when rain is still incoming.
  // The daily total continues to be used for detecting future rain in the forecast.
  const rainfallAlreadyToday = (hourlyIntervals ?? []).reduce((sum, interval) => {
    const t = new Date(interval.startTime)
    if (t >= midnight && t <= now) {
      return sum + (interval.values?.precipitationAccumulation ?? 0)
    }
    return sum
  }, 0)

  // ── [Problem 2] Find when rain last stopped → hoursElapsed ───────────────
  // Walk through hourly intervals up to now; record the last interval with
  // meaningful precipitation. Adding 1 hr to startTime gives us the end of that
  // interval, which is the best approximation of when the rain actually stopped.
  let lastRainEndTime = null
  for (const interval of (hourlyIntervals ?? [])) {
    const t = new Date(interval.startTime)
    if (t > now) break
    const accumulation = interval.values?.precipitationAccumulation ?? 0
    const intensity    = interval.values?.precipitationIntensity    ?? 0
    if (accumulation > 0.01 || intensity > 0.05) {
      lastRainEndTime = new Date(t.getTime() + 3600000) // end of this 1-hour bucket
    }
  }
  // If no rain appears in the hourly data, assume a long dry streak.
  const hoursElapsed = lastRainEndTime
    ? Math.max(0, (now.getTime() - lastRainEndTime.getTime()) / 3600000)
    : 48

  // [PREF: soilType] applied here — soil type scales how long the trail takes to dry
  const dryoutHoursNeeded   = rainfallAlreadyToday * 24 * soilMultiplier
  const dryoutHoursRemaining = Math.max(0, dryoutHoursNeeded - hoursElapsed)

  // --- Extract per-day precipitation from daily intervals ---
  const weekPrecip  = dailyIntervals.map(d => d?.values?.precipitationAccumulation ?? 0)
  const precipToday = weekPrecip[0] ?? 0  // daily total (includes rain still forecasted today)

  // --- Today's verdict — first match wins ---
  let todayVerdict = 'go'
  let todayReason  = ''

  // 1. Frozen
  if (currentTemp != null && currentTemp < 32) {
    todayVerdict = 'nogo'
    todayReason  = `Frozen at ${currentTemp}°F. Wait for temps to rise above freezing before riding.`
  }
  // 2. Actively raining right now
  else if (precipIntensityNow > 0.1 || RAIN_CODES.has(weatherCodeNow)) {
    todayVerdict = 'nogo'
    todayReason  = 'Rain falling right now. Riding will damage wet trails — sit this one out.'
  }
  // 3. Significant rain already fallen today — dryout check using rainfallAlreadyToday
  // [Problem 1] We use the actual fallen amount, not the daily forecast total.
  // [PREF: riskTolerance] dryoutCautionFraction controls the nogo→caution transition.
  // [PREF: soilType] soilMultiplier is baked into dryoutHoursNeeded above.
  else if (rainfallAlreadyToday > 0.1) {
    const cautionStart = dryoutHoursNeeded * dryoutCautionFraction
    if (hoursElapsed < cautionStart) {
      todayVerdict = 'nogo'
      const hoursLeft = Math.ceil(dryoutHoursRemaining)
      todayReason = `${rainfallAlreadyToday.toFixed(2)}" of rain fell today. Trails need ~${hoursLeft} more hours to dry.`
    } else if (dryoutHoursRemaining > 0) {
      todayVerdict = 'caution'
      todayReason = `${rainfallAlreadyToday.toFixed(2)}" of rain today. Trails may be soft in spots — ride with care.`
    }
    // else dryout complete — falls through to GO
  }
  // 4. Significant rain still forecasted today (hasn't fallen yet — daily total > already fallen)
  // [Problem 1] Daily total used here as specified: "forecasted rain hours remaining today"
  else if (precipToday > 0.1) {
    todayVerdict = 'nogo'
    todayReason  = `${precipToday.toFixed(2)}" of rain in today's forecast. Trails won't be rideable.`
  }
  // 5. Light rain in forecast (trace amounts)
  // [PREF: riskTolerance] aggressive riders skip the caution for light rain
  else if (precipToday >= 0.05 && preferences.riskTolerance !== 'aggressive') {
    todayVerdict = 'caution'
    todayReason  = `Light rain (${precipToday.toFixed(2)}") in today's forecast. Conditions may soften later.`
  }
  // 6. High humidity caution — [PREF: riskTolerance] threshold varies by tolerance
  else if (currentHumidity != null && currentHumidity > humidityThreshold) {
    todayVerdict = 'caution'
    todayReason  = `High humidity at ${currentHumidity}%. Trails may feel tacky or slow in low-lying areas.`
  }

  // 7. GO — build a descriptive reason
  if (todayVerdict === 'go') {
    if (currentTemp != null && currentHumidity != null) {
      if (currentHumidity < 50) {
        todayReason = `${currentTemp}°F and ${currentHumidity}% humidity. Dry, firm conditions — fast trails today.`
      } else {
        todayReason = `${currentTemp}°F with no rain in forecast. Trail conditions look solid.`
      }
    } else {
      todayReason = 'No rain in forecast. Trail conditions look solid.'
    }
  }

  // ── [PREF: preferredRideTime] today check ────────────────────────────────
  // If the user has a preferred ride time, check that specific hour's conditions.
  // • Rain at or before preferred time → strengthens nogo/caution verdict
  // • Good at preferred time but rain arrives later → keep Go, add tip
  let preferredRideTimeTip = null
  if (preferences.preferredRideTime != null && (hourlyIntervals ?? []).length > 0) {
    const prefHour = preferences.preferredRideTime
    const prefLabel = `${prefHour % 12 || 12}${prefHour < 12 ? 'am' : 'pm'}`

    // Find the hourly interval for today at the preferred ride hour
    const rideInterval = (hourlyIntervals ?? []).find(interval => {
      const t = new Date(interval.startTime)
      return t >= midnight &&
             t.getDate()  === midnight.getDate()  &&
             t.getMonth() === midnight.getMonth() &&
             t.getHours() === prefHour
    })

    if (rideInterval) {
      const rainAtRideTime =
        (rideInterval.values?.precipitationAccumulation ?? 0) > 0.05 ||
        (rideInterval.values?.precipitationIntensity    ?? 0) > 0.05

      if (rainAtRideTime && todayVerdict === 'go') {
        // Rain expected at preferred ride time — upgrade go→caution
        todayVerdict = 'caution'
        todayReason  = `Rain expected at your preferred ride time (${prefLabel}).`
      } else if (!rainAtRideTime && todayVerdict === 'go') {
        // Check if rain arrives after preferred ride time
        const rainLater = (hourlyIntervals ?? []).some(interval => {
          const t = new Date(interval.startTime)
          return t >= midnight &&
                 t.getDate()  === midnight.getDate()  &&
                 t.getMonth() === midnight.getMonth() &&
                 t.getHours() > prefHour &&
                 ((interval.values?.precipitationAccumulation ?? 0) > 0.05 ||
                  (interval.values?.precipitationIntensity    ?? 0) > 0.05)
        })
        if (rainLater) {
          // Conditions good at ride time; rain arrives later — surface tip
          preferredRideTimeTip = `Conditions look good at ${prefLabel}. Rain arrives later in the day — start early.`
        }
      }
    }
  }

  // ── [Problem 2] 7-day verdicts with dryout carryover ────────────────────
  // For each future day we check how much dryout time from TODAY'S rain is still
  // remaining at 6am of that day. If significant dryout is still needed, the day
  // is blocked — regardless of whether that day's own forecast shows rain.
  //
  // Carryover logic:
  //   hoursElapsedAt6am  = hoursElapsed (since rain stopped) + hours from now to 6am day-i
  //   hoursRemainingAt6am = max(0, dryoutHoursNeeded − hoursElapsedAt6am)
  //   fractionRemaining  = hoursRemainingAt6am / dryoutHoursNeeded
  //
  //   > 25% remaining at 6am → No-Go  (trail still too wet)
  //   0–25% remaining at 6am → Caution (nearly dry but soft spots remain)
  //   fully elapsed          → evaluate day's own forecast normally
  //
  // weekDetails produces {verdict, reason} per day so the week strip selector can
  // display the correct verdict card content when the user taps a future day.
  const weekDetails = weekPrecip.map((precip, i) => {
    if (i === 0) return { verdict: todayVerdict, reason: todayReason, dryStreakHrs: hoursElapsed }

    // --- Carryover dryout check at 6am of day i ---
    const sixAmOfDayI = new Date(midnight)
    sixAmOfDayI.setDate(sixAmOfDayI.getDate() + i)
    sixAmOfDayI.setHours(6, 0, 0, 0)
    const hoursElapsedAt6am   = hoursElapsed + Math.max(0, (sixAmOfDayI.getTime() - now.getTime()) / 3600000)
    const hoursRemainingAt6am = Math.max(0, dryoutHoursNeeded - hoursElapsedAt6am)
    const fractionRemaining   = dryoutHoursNeeded > 0 ? hoursRemainingAt6am / dryoutHoursNeeded : 0

    // Dry streak hours at 6am of this day — how long the trail will have been dry by morning.
    // Zero if carryover is still active or this day's own forecast has rain.
    // Used by buildEvidenceTiles to show an accurate dry streak tile for future days.
    const dryStreakHrs = (precip > 0.1 || fractionRemaining > 0)
      ? 0
      : Math.max(0, hoursElapsedAt6am - dryoutHoursNeeded)

    if (fractionRemaining > 0.25) return { // [Problem 2] >25% of dryout still needed
      verdict: 'nogo',
      reason:  `Trails still drying from earlier rain (~${Math.ceil(hoursRemainingAt6am)} hrs needed by 6am).`,
      dryStreakHrs,
    }
    if (fractionRemaining > 0) return {    // [Problem 2] <25% — nearly dry, soft spots
      verdict: 'caution',
      reason:  'Nearly dry from earlier rain — soft spots may linger in shaded sections.',
      dryStreakHrs,
    }

    // Carryover fully elapsed — evaluate this day's own forecast
    if (precip > 0.1) return {
      verdict: 'nogo',
      reason:  `${precip.toFixed(2)}" of rain in the forecast. Trails won't be rideable.`,
      dryStreakHrs,
    }
    // [PREF: riskTolerance] aggressive skips caution for light-rain days
    if (precip >= 0.05 && preferences.riskTolerance !== 'aggressive') return {
      verdict: 'caution',
      reason:  `Light rain (${precip.toFixed(2)}") in the forecast. Conditions may soften.`,
      dryStreakHrs,
    }

    // [PREF: preferredRideTime] check hourly data for preferred hour on this future day
    // Hourly data from Tomorrow.io covers ~120 hrs ahead (roughly 5 days).
    // Days beyond that range will simply skip this check.
    if (preferences.preferredRideTime != null && (hourlyIntervals ?? []).length > 0) {
      const prefHour    = preferences.preferredRideTime
      const prefLabel   = `${prefHour % 12 || 12}${prefHour < 12 ? 'am' : 'pm'}`
      const dayMidnight = new Date(midnight)
      dayMidnight.setDate(dayMidnight.getDate() + i)
      const rideInterval = (hourlyIntervals ?? []).find(interval => {
        const t = new Date(interval.startTime)
        return t >= dayMidnight &&
               t.getDate()  === dayMidnight.getDate()  &&
               t.getMonth() === dayMidnight.getMonth() &&
               t.getHours() === prefHour
      })
      if (rideInterval) {
        const rainAtRideTime =
          (rideInterval.values?.precipitationAccumulation ?? 0) > 0.05 ||
          (rideInterval.values?.precipitationIntensity    ?? 0) > 0.05
        if (rainAtRideTime) return { // [PREF: preferredRideTime] rain at preferred hour
          verdict: 'caution',
          reason:  `Rain expected at your preferred ride time (${prefLabel}).`,
          dryStreakHrs,
        }
      }
    }

    return { verdict: 'go', reason: 'Forecast looks clear. Good conditions expected.', dryStreakHrs }
  })

  const weekVerdicts     = weekDetails.map(d => d.verdict)
  const weekReasons      = weekDetails.map(d => d.reason)
  const weekDryStreakHrs = weekDetails.map(d => d.dryStreakHrs ?? null)

  // --- Tips (today) ---
  const sun  = sunDisplay(sunTimes)
  const tips = []

  if (todayVerdict === 'go') {
    // [PREF: preferredRideTime] surface timing tip first if relevant
    if (preferredRideTimeTip) tips.push(preferredRideTimeTip)

    // Tip: temperature
    if (currentTemp != null) {
      if (currentTemp >= 85)      tips.push(`Hot at ${currentTemp}°F. Bring extra water and plan for shaded rest stops.`)
      else if (currentTemp <= 45) tips.push(`Cold at ${currentTemp}°F. Layer up and warm up gradually before pushing hard.`)
      else                        tips.push(`${currentTemp}°F with firm conditions. Great day to push pace on hardpack.`)
    } else {
      tips.push('Check local trail conditions before heading out.')
    }

    // Tip: humidity
    if (currentHumidity != null) {
      if (currentHumidity > 70) tips.push(`Humidity at ${currentHumidity}% — trails may feel tacky. Great for grip on corners.`)
      else                      tips.push(`Low humidity at ${currentHumidity}% — expect dusty, fast conditions on exposed sections.`)
    } else {
      tips.push('Check local trail reports for current surface conditions.')
    }

    // Tip: sunset/sunrise timing
    if (sun.label === 'Sunset')       tips.push(`Sunset at ${sun.value}. Plenty of daylight — no need to rush your start.`)
    else if (sun.label === 'Sunrise') tips.push(`Sunrise at ${sun.value}. Early starters get the freshest trail conditions.`)
    else                              tips.push(`${sun.label} at ${sun.value}.`)

  } else if (todayVerdict === 'caution') {
    tips.push(todayReason)
    // [PREF: preferredRideTime] add timing tip for caution days too
    if (preferredRideTimeTip) tips.push(preferredRideTimeTip)
    tips.push('Avoid low-lying and shaded sections — they hold moisture the longest.')
    tips.push('Leaving ruts? Turn around. Protect the trail.')

  } else {
    // nogo
    tips.push(todayReason)

    const nextGoodIdx = weekVerdicts.findIndex((v, i) => i > 0 && v === 'go')
    if (nextGoodIdx > 0) {
      const labels = ['today','tomorrow','in 2 days','in 3 days','in 4 days','in 5 days','in 6 days']
      tips.push(`Next green window looks like ${labels[nextGoodIdx]}. Check back then.`)
    } else {
      tips.push('No clear window this week. Check back daily as the forecast updates.')
    }

    tips.push('Good time to clean your drivetrain, check tire pressure, and prep your kit.')
  }

  // --- Per-day tips for the week strip selector ---
  // Shown when the user taps a future day. Day 0 reuses today's tips above.
  const DAY_LABELS = ['today','tomorrow','in 2 days','in 3 days','in 4 days','in 5 days','in 6 days']
  const weekTips = weekDetails.map(({ verdict, reason }, i) => {
    if (i === 0) return tips

    const tempMax = dailyIntervals[i]?.values?.temperatureMax != null
      ? Math.round(dailyIntervals[i].values.temperatureMax) : null

    if (verdict === 'go') {
      const t = []
      if (tempMax != null) {
        if (tempMax >= 85)      t.push(`High near ${tempMax}°F — bring extra water and plan for shaded rest stops.`)
        else if (tempMax <= 45) t.push(`High around ${tempMax}°F — dress in layers and warm up gradually.`)
        else                    t.push(`High near ${tempMax}°F with no rain. Should be a solid riding day.`)
      } else {
        t.push('Forecast looks clear. Check conditions the morning of your ride.')
      }
      t.push('Check local trail reports the day before heading out.')
      t.push('Forecasts can shift — check back closer to your ride.')
      return t
    }

    if (verdict === 'caution') {
      return [
        reason,
        'Avoid low-lying and shaded sections — they hold moisture the longest.',
        'Leaving ruts? Turn around. Protect the trail.',
      ]
    }

    // nogo
    const nextGoodIdx = weekDetails.findIndex((d, j) => j > i && d.verdict === 'go')
    const t = [reason]
    if (nextGoodIdx > 0) {
      t.push(`Looking ahead, ${DAY_LABELS[nextGoodIdx]} may offer a better window.`)
    } else {
      t.push('No clear window later this week. Check back daily as the forecast updates.')
    }
    t.push('Good time to clean your drivetrain, check tire pressure, and prep your kit.')
    return t
  })

  return { todayVerdict, todayReason, weekVerdicts, weekReasons, weekDryStreakHrs, weekTips, tips }
}

// ─── Evidence Panel helpers ───────────────────────────────────────────────

const PILL_STYLES = {
  Ideal:    { background: '#d4edda', color: '#155724' },
  Good:     { background: '#e8f5d0', color: '#3a7a1e' },
  Marginal: { background: '#fff3cd', color: '#856404' },
  Blocking: { background: '#f8d7da', color: '#721c24' },
  Neutral:  { background: '#e9e5de', color: '#6c6860' },
}

function StatusPill({ status }) {
  const s = PILL_STYLES[status] ?? PILL_STYLES.Neutral
  return (
    <span style={{
      ...s, fontSize: 10, fontWeight: 600,
      padding: '3px 10px', borderRadius: 999,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {status}
    </span>
  )
}

function humidityStatus(h) {
  if (h == null) return 'Neutral'
  if (h < 60) return 'Ideal'
  if (h <= 75) return 'Good'
  if (h <= 85) return 'Marginal'
  return 'Blocking'
}

function tempStatus(t) {
  if (t == null) return 'Neutral'
  if (t >= 55 && t <= 80) return 'Ideal'
  if ((t >= 45 && t < 55) || (t > 80 && t <= 90)) return 'Good'
  if ((t >= 35 && t < 45) || (t > 90 && t <= 95)) return 'Marginal'
  return 'Blocking'
}

function aqiStatus(label) {
  if (!label || label === '--' || label === 'N/A') return 'Neutral'
  if (label === 'Good') return 'Ideal'
  if (label === 'Moderate') return 'Good'
  if (label === 'Poor') return 'Marginal'
  return 'Blocking'
}

function precipStatus(inches) {
  if (inches == null) return 'Neutral'
  if (inches === 0) return 'Ideal'
  if (inches < 0.05) return 'Good'
  if (inches <= 0.1) return 'Marginal'
  return 'Blocking'
}

function dryStreakStatus(hrs) {
  if (hrs == null) return 'Neutral'
  if (hrs > 48) return 'Ideal'
  if (hrs >= 24) return 'Good'
  if (hrs >= 12) return 'Marginal'
  return 'Blocking'
}

// dryStreakHours: optional override for the dry-streak tile (passed for future days
// from the per-day dryStreakHrs computed in computeVerdict). When null/undefined the
// function falls back to its original same-day estimation logic.
function buildEvidenceTiles({ todayVerdict, dailyIntervals, currentTemp, currentHumidity, airQuality, sunTimes, precipIntensityNow, dryStreakHours }) {
  const sun = sunDisplay(sunTimes)
  const precipToday = dailyIntervals[0]?.values?.precipitationAccumulation ?? 0
  const now = new Date()
  const hourOfDay = now.getHours() + now.getMinutes() / 60

  const sunTile = { icon: sun.icon, name: sun.label, value: sun.value, status: 'Neutral' }

  if (todayVerdict === 'go') {
    // Use precomputed dry streak for future days; fall back to estimate for today
    const dryHrs = dryStreakHours != null ? dryStreakHours : (precipToday < 0.01 ? 58 : Math.max(0, (1 - precipToday) * 48))
    return [
      { icon: '☀️', name: 'Dry Streak', value: `${Math.round(dryHrs)} hrs dry`, status: dryStreakStatus(dryHrs) },
      { icon: '💧', name: 'Humidity', value: currentHumidity != null ? `${currentHumidity}%` : '--', status: humidityStatus(currentHumidity) },
      { icon: '🌡️', name: 'Temperature', value: currentTemp != null ? `${currentTemp}°F` : '--', status: tempStatus(currentTemp) },
      { icon: '🌿', name: 'Air Quality', value: airQuality ?? '--', status: aqiStatus(airQuality) },
      { icon: '🌤️', name: 'Forecast', value: precipToday < 0.01 ? 'Clear' : `${precipToday.toFixed(2)}"`, status: precipStatus(precipToday) },
      sunTile,
    ]
  }

  if (todayVerdict === 'caution') {
    // Use precomputed dry streak for future days; fall back to estimate for today
    const estHrsSinceRain = dryStreakHours != null ? dryStreakHours : Math.max(1, hourOfDay - 2)
    const dryoutHrs = precipToday * 24
    // Figure out rain timing description
    let rainTiming = 'Rain possible'
    if (precipToday >= 0.05 && precipToday <= 0.1) rainTiming = 'Light rain'
    else if (precipToday > 0.1 && estHrsSinceRain > dryoutHrs * 0.75) rainTiming = 'Drying out'
    else if (precipToday > 0.1) rainTiming = 'Rain earlier'

    return [
      { icon: '⏱️', name: 'Dry Streak', value: `${Math.round(estHrsSinceRain)} hrs since rain`, status: estHrsSinceRain < 12 ? 'Marginal' : dryStreakStatus(estHrsSinceRain) },
      { icon: '💧', name: 'Humidity', value: currentHumidity != null ? `${currentHumidity}%` : '--', status: humidityStatus(currentHumidity) },
      { icon: '🌧️', name: 'Rain Timing', value: rainTiming, status: 'Marginal' },
      { icon: '🌡️', name: 'Temperature', value: currentTemp != null ? `${currentTemp}°F` : '--', status: tempStatus(currentTemp) },
      { icon: '🌥️', name: 'Forecast', value: `${precipToday.toFixed(2)}"`, status: precipStatus(precipToday) },
      sunTile,
    ]
  }

  // nogo
  const dryoutHrs = precipToday * 24
  // Use precomputed dry streak for future days; fall back to estimate for today
  const estHrsSinceRain = dryStreakHours != null ? dryStreakHours : Math.max(1, hourOfDay - 2)
  const hoursLeft = Math.max(0, Math.ceil(dryoutHrs - estHrsSinceRain))
  const tiles = []

  if (precipToday > 0 || precipIntensityNow > 0) {
    tiles.push({ icon: '🌧️', name: 'Rainfall', value: precipIntensityNow > 0.1 ? 'Raining now' : `${precipToday.toFixed(2)}"`, status: 'Blocking' })
  }
  if (hoursLeft > 0 && precipToday > 0.1) {
    tiles.push({ icon: '⏳', name: 'Hrs Until Rideable', value: `~${hoursLeft} hrs`, status: 'Blocking' })
  }
  tiles.push({ icon: '💧', name: 'Humidity', value: currentHumidity != null ? `${currentHumidity}%` : '--', status: humidityStatus(currentHumidity) })
  if (precipToday > 0.1) {
    tiles.push({ icon: '🌧️', name: 'Forecast Rain', value: `${precipToday.toFixed(2)}" today`, status: 'Blocking' })
  }
  if (currentTemp != null && currentTemp < 35) {
    tiles.push({ icon: '🥶', name: 'Temperature', value: `${currentTemp}°F`, status: 'Blocking' })
  } else {
    tiles.push({ icon: '🌡️', name: 'Temperature', value: currentTemp != null ? `${currentTemp}°F` : '--', status: tempStatus(currentTemp) })
  }
  tiles.push(sunTile)

  return tiles
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [coords,          setCoords]          = useState(null)
  const [locationName,    setLocationName]    = useState('Locating...')
  const [isUsingGPS,      setIsUsingGPS]      = useState(() => localStorage.getItem('rsg_location_mode') !== 'manual')
  const [sheetOpen,       setSheetOpen]       = useState(false)

  const [weatherLoading, setWeatherLoading] = useState(false)
  const [currentTemp,    setCurrentTemp]    = useState(null)
  const [currentHumidity,setCurrentHumidity]= useState(null)
  const [airQuality,     setAirQuality]     = useState(null)
  const [dailyForecast,    setDailyForecast]    = useState([])
  const [dailyIntervals,   setDailyIntervals]   = useState([])
  const [hourlyIntervals,  setHourlyIntervals]  = useState([]) // full hourly timeline for engine
  const [weatherCodeNow,   setWeatherCodeNow]   = useState(null)
  const [precipIntensityNow, setPrecipIntensityNow] = useState(0)
  const [sunTimes,         setSunTimes]         = useState([])
  const [refreshing,       setRefreshing]       = useState(false)
  const [refreshPhase,     setRefreshPhase]     = useState('idle') // 'idle' | 'updating' | 'done'
  const [cacheTimestamp,   setCacheTimestamp]   = useState(null)
  const [tick,             setTick]             = useState(0) // increments every min to refresh age label

  // User preferences — initialized from localStorage; persisted on every change.
  // getPreferences/setPreferences are exported so the bottom sheet UI can use them.
  const [userPreferences, setUserPreferences] = useState(() => getPreferences())

  // Which day is selected in the week strip (0 = today … 6 = 6 days out).
  // Resets to 0 whenever fresh weather data loads.
  const [selectedDay, setSelectedDay] = useState(0)

  // Reverse-geocode helper — shared by init and GPS refresh
  const reverseGeocode = async (latitude, longitude) => {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      { headers: NOMINATIM_HEADERS }
    )
    const data = await res.json()
    const addr = data.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? ''
    const abbr = usStateAbbr[addr.state ?? ''] ?? addr.state ?? ''
    return city && abbr ? `${city}, ${abbr}` : city || abbr || 'Unknown location'
  }

  // On mount: restore GPS or manual location
  useEffect(() => {
    if (!isUsingGPS) {
      // Restore saved manual location
      try {
        const saved = JSON.parse(localStorage.getItem('rsg_manual_location') ?? 'null')
        if (saved) {
          setCoords({ latitude: saved.lat, longitude: saved.lon })
          setLocationName(saved.name)
          return
        }
      } catch {}
      // No saved manual location — fall through to GPS
    }

    if (!navigator.geolocation) { setLocationName('Location unavailable'); return }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        setCoords({ latitude, longitude })
        try {
          const name = await reverseGeocode(latitude, longitude)
          setLocationName(name)
        } catch { setLocationName('Location unavailable') }
      },
      () => setLocationName('Location unavailable'),
      { timeout: 10000 }
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick every minute so the "Updated X min ago" label stays current
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Apply parsed weather + sun/daily data to state.
  // Tomorrow.io provides: current conditions + hourly timeline (temp, humidity, precip, weatherCode, epaIndex).
  // Open-Meteo provides:  7-day daily forecast (tempMax, precip, humidity) + sunrise/sunset.
  const applyData = (weatherRaw, sunRaw, timestamp) => {
    // --- Tomorrow.io: current conditions + hourly timeline ---
    let epaIndexRaw = null
    if (weatherRaw) {
      const timelines = weatherRaw?.data?.timelines ?? []
      console.log('[RSG] Tomorrow.io raw response:', JSON.stringify(weatherRaw))
      const current = timelines.find(t => t.timestep === 'current')
      const hourly  = timelines.find(t => t.timestep === '1h')
      const curVals = current?.intervals?.[0]?.values ?? {}
      const cur     = hourly?.intervals?.[0]?.values  ?? {}
      console.log('[RSG] epaIndex — current timestep:', curVals.epaIndex, '| hourly[0]:', cur.epaIndex)
      setCurrentTemp(cur.temperature != null ? Math.round(cur.temperature) : null)
      setCurrentHumidity(cur.humidity  != null ? Math.round(cur.humidity)  : null)
      epaIndexRaw = curVals.epaIndex ?? cur.epaIndex ?? null
      setWeatherCodeNow(cur.weatherCode ?? null)
      setPrecipIntensityNow(cur.precipitationIntensity ?? 0)
      setHourlyIntervals(hourly?.intervals ?? [])  // full hourly timeline for dryout engine
    } else {
      setCurrentTemp(null); setCurrentHumidity(null)
      setHourlyIntervals([])
      setWeatherCodeNow(null); setPrecipIntensityNow(0)
    }

    // Prefer Tomorrow.io epaIndex; will fall back to Open-Meteo european_aqi below
    let aqiLabel = epaIndexRaw != null ? epaLabel(epaIndexRaw) : null

    // --- Open-Meteo: 7-day daily forecast + european_aqi hourly fallback ---
    if (sunRaw) {
      const d = sunRaw?.daily ?? {}
      // Build daily intervals in the same {startTime, values} shape the engine expects,
      // using Open-Meteo arrays. Append T12:00:00 so dayAbbr() parses as local noon,
      // avoiding the UTC-midnight off-by-one-day issue with date-only strings.
      const rawDaily = (d.time ?? []).map((date, i) => ({
        startTime: `${date}T12:00:00`,
        values: {
          temperatureMax:            d.temperature_2m_max?.[i]          ?? null,
          precipitationAccumulation: d.precipitation_sum?.[i]           ?? null,
          humidity:                  d.relative_humidity_2m_mean?.[i]   ?? null,
        },
      })).slice(0, 7)

      // If Tomorrow.io didn't return epaIndex, use Open-Meteo european_aqi for current hour
      if (aqiLabel == null) {
        const hourlyTimes = sunRaw?.hourly?.time ?? []
        const hourlyAqi   = sunRaw?.hourly?.european_aqi ?? []
        const now = new Date()
        const pad = n => String(n).padStart(2, '0')
        const localHourStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
        const aqiIdx = hourlyTimes.findIndex(t => t === localHourStr)
        console.log('[RSG] european_aqi fallback — hour:', localHourStr, '| idx:', aqiIdx, '| val:', hourlyAqi[aqiIdx])
        aqiLabel = europeanAqiLabel(aqiIdx >= 0 ? hourlyAqi[aqiIdx] : null)
      }

      setDailyIntervals(rawDaily)
      setDailyForecast(rawDaily.map(interval => ({
        day:     dayAbbr(interval.startTime),
        tempMax: interval.values.temperatureMax != null
                   ? Math.round(interval.values.temperatureMax) : null,
      })))
      setSunTimes((d.sunrise ?? []).map((rise, i) => ({ sunrise: rise, sunset: d.sunset?.[i] })))
    } else {
      setDailyIntervals([])
      setDailyForecast([])
      setSunTimes([])
    }

    setAirQuality(aqiLabel)  // set once, using best available source
    setCacheTimestamp(timestamp)
    setWeatherLoading(false)
    setSelectedDay(0)  // reset to today whenever new data loads
  }

  // Shared fetch — checks cache unless force:true (manual refresh)
  const fetchWeatherData = async (lat, lon, { force = false } = {}) => {
    const apiKey = import.meta.env.VITE_TOMORROW_API_KEY
    if (!apiKey) return

    // --- Weather cache ---
    const weatherEntry = readCache(WEATHER_CACHE_KEY)
    let weatherRaw = null
    let weatherTimestamp = null

    if (!force && cacheIsValid(weatherEntry, WEATHER_MAX_AGE, lat, lon)) {
      weatherRaw       = weatherEntry.data
      weatherTimestamp = weatherEntry.timestamp
    } else {
      setWeatherLoading(true)
      try {
        weatherRaw = await fetch(
          `https://api.tomorrow.io/v4/timelines?location=${lat},${lon}&fields=temperature,humidity,precipitationAccumulation,precipitationIntensity,weatherCode,epaIndex&units=imperial&timesteps=current,1h&apikey=${apiKey}`
        ).then(r => r.json())
        writeCache(WEATHER_CACHE_KEY, weatherRaw, lat, lon)
        weatherTimestamp = Date.now()
      } catch {
        weatherRaw = null
      }
    }

    // --- Sun cache (6 hr expiry; not bypassed by force since it changes so slowly) ---
    const sunEntry = readCache(SUN_CACHE_KEY)
    let sunRaw = null

    if (cacheIsValid(sunEntry, SUN_MAX_AGE, lat, lon)) {
      sunRaw = sunEntry.data
    } else {
      try {
        sunRaw = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset,temperature_2m_max,precipitation_sum,relative_humidity_2m_mean&hourly=european_aqi&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&forecast_days=7`
        ).then(r => r.json())
        writeCache(SUN_CACHE_KEY, sunRaw, lat, lon)
      } catch {
        sunRaw = null
      }
    }

    applyData(weatherRaw, sunRaw, weatherTimestamp ?? Date.now())
  }

  // Fetch when coords change — respects cache
  useEffect(() => {
    if (!coords) return
    fetchWeatherData(coords.latitude, coords.longitude)
  }, [coords]) // eslint-disable-line react-hooks/exhaustive-deps

  // Manual refresh — bypasses weather cache; re-acquires GPS if in GPS mode
  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshPhase('updating')
    try {
      if (isUsingGPS && navigator.geolocation) {
        // Re-acquire fresh GPS position, then fetch weather for it
        await new Promise(resolve => {
          navigator.geolocation.getCurrentPosition(
            async ({ coords: { latitude, longitude } }) => {
              setCoords({ latitude, longitude })
              await Promise.allSettled([
                reverseGeocode(latitude, longitude).then(name => {
                  setLocationName(name)
                }).catch(() => {}),
                fetchWeatherData(latitude, longitude, { force: true }),
              ])
              resolve()
            },
            async () => {
              // GPS failed — fall back to last known coords
              if (coords) await fetchWeatherData(coords.latitude, coords.longitude, { force: true })
              resolve()
            },
            { timeout: 10000 }
          )
        })
      } else {
        // Manual location — refresh weather for stored coords
        if (!coords) return
        await fetchWeatherData(coords.latitude, coords.longitude, { force: true })
      }
    } finally {
      setRefreshing(false)
      setRefreshPhase('done')
      setTimeout(() => setRefreshPhase('idle'), 2000)
    }
  }

  // Auto-refresh on focus — fetchWeatherData handles cache check internally
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && coords) {
        fetchWeatherData(coords.latitude, coords.longitude)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [coords]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectLocation = r => {
    const lat = parseFloat(r.lat), lon = parseFloat(r.lon)
    setCoords({ latitude: lat, longitude: lon })
    setLocationName(r.label)
    setIsUsingGPS(false)
    localStorage.setItem('rsg_location_mode', 'manual')
    try { localStorage.setItem('rsg_manual_location', JSON.stringify({ lat, lon, name: r.label })) } catch {}
  }

  const handleUseGPS = () => {
    setIsUsingGPS(true)
    localStorage.setItem('rsg_location_mode', 'gps')
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        setCoords({ latitude, longitude })
        try {
          const name = await reverseGeocode(latitude, longitude)
          setLocationName(name)
        } catch {}
      },
      () => {},
      { timeout: 10000 }
    )
  }

  const verdict = useMemo(() => {
    if (!dailyIntervals.length) return null
    return computeVerdict({
      dailyIntervals,
      hourlyIntervals,   // [Problem 1 & 2] for rainfall sum + dryout carryover
      currentTemp,
      currentHumidity,
      weatherCodeNow,
      precipIntensityNow,
      sunTimes,
      preferences: userPreferences,  // [PREF] all preference-driven adjustments
    })
  }, [dailyIntervals, hourlyIntervals, currentTemp, currentHumidity, weatherCodeNow, precipIntensityNow, sunTimes, userPreferences])

  return (
    <>
      <SplashScreen />

      <div style={{ background: '#f5f2eb', fontFamily: "'DM Sans', sans-serif" }} className="min-h-screen flex justify-center items-start py-10 px-4">
        <div style={{ maxWidth: 430, padding: '28px 22px 40px' }} className="w-full flex flex-col gap-6">

          {/* Header */}
          <header className="flex items-center justify-between">
            {/* Left: menu button */}
            <button
              onClick={() => setSheetOpen(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
              aria-label="Open settings"
            >
              <svg width="22" height="18" viewBox="0 0 22 18" fill="none">
                <rect y="0"    width="22" height="2.5" rx="1.25" fill="#2d4a1e"/>
                <rect y="7.75" width="16" height="2.5" rx="1.25" fill="#2d4a1e"/>
                <rect y="15.5" width="22" height="2.5" rx="1.25" fill="#2d4a1e"/>
              </svg>
            </button>

            {/* Center: location name */}
            <button
              onClick={() => setSheetOpen(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PinIcon color="#5a7a3a" />
              <span style={{ fontSize: 16, fontWeight: 600, color: '#2c2c1e', fontFamily: "'DM Sans', sans-serif" }}>{locationName}</span>
            </button>

            {/* Right: refresh button with feedback */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{ background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer', padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 40 }}
              aria-label="Refresh"
            >
              {refreshPhase === 'done' ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9.5l4 4 8-8" stroke="#5a7a3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg
                  width="18" height="18" viewBox="0 0 18 18" fill="none"
                  style={{ animation: refreshPhase === 'updating' ? 'spin 0.8s linear infinite' : 'none' }}
                >
                  <path d="M15.75 9A6.75 6.75 0 1 1 9.53 2.27L11.25 4" stroke="#2d4a1e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 1.5v3h3" stroke="#2d4a1e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {refreshPhase !== 'idle' && (
                <span style={{ fontSize: 10, color: '#8a8475', fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>
                  {refreshPhase === 'updating' ? 'Updating…' : 'Updated'}
                </span>
              )}
            </button>
          </header>

          {/* Verdict card — updates to reflect the selected week strip day */}
          {(() => {
            const selVerdict = verdict?.weekVerdicts?.[selectedDay] ?? verdict?.todayVerdict
            const selReason  = verdict?.weekReasons?.[selectedDay]  ?? verdict?.todayReason
            const selLabel   = selectedDay === 0
              ? TODAY_LABEL
              : (dailyForecast[selectedDay]?.day ?? DAY_ABBR[(new Date().getDay() + selectedDay) % 7])
            const cardBg = selVerdict === 'caution' ? '#7a4a15' : selVerdict === 'nogo' ? '#5c1a1a' : '#2d4a1e'
            return (
              <div style={{ background: cardBg, borderRadius: 22, padding: '20px 20px 22px', position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transition: 'background 0.25s ease' }}>
                <div style={{
                  position: 'absolute', top: 14, right: 14,
                  background: 'rgba(255,255,255,0.15)',
                  color: '#e8f5d0', borderRadius: 999,
                  fontSize: 11, fontWeight: 500, padding: '3px 10px',
                }}>
                  {selLabel}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div style={{
                    width: 36, height: 36,
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#e8f5d0', fontSize: 18, flexShrink: 0,
                  }}>
                    {selVerdict === 'nogo' ? '✕' : selVerdict === 'caution' ? '!' : '✓'}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: '#e8f5d0', lineHeight: 1.1 }}>
                      {selVerdict === 'nogo' ? 'Stay home.' : selVerdict === 'caution' ? 'Ride with care.' : 'Go ride.'}
                    </div>
                    <div style={{ color: '#a8c882', fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
                      {selReason ?? (weatherLoading ? 'Loading conditions…' : 'Checking trail conditions…')}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Week strip — 7-day outlook */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 10, marginTop: 2 }}>
              This week
            </div>
            <div className="grid grid-cols-7 gap-1" style={{ opacity: weatherLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
              {Array.from({ length: dailyForecast.length > 0 ? dailyForecast.length : 7 }, (_, i) => {
                const forecast    = dailyForecast[i]
                const displayDay  = forecast?.day ?? DAY_ABBR[(new Date().getDay() + i) % 7]
                const displayTemp = forecast?.tempMax != null ? `${forecast.tempMax}°` : '--'
                const status      = verdict?.weekVerdicts?.[i] ?? 'go'
                const active      = i === selectedDay
                const activeBg    = status === 'caution' ? '#7a4a15' : status === 'nogo' ? '#5c1a1a' : '#2d4a1e'
                return (
                  <div key={i}
                    onClick={() => setSelectedDay(i)}
                    style={{
                      background: active ? activeBg : '#ffffff',
                      borderRadius: 14, padding: '12px 4px', textAlign: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <span style={{ fontSize: 10, fontWeight: 500, color: active ? '#a8c882' : '#8a8475', textTransform: 'uppercase' }}>
                      {displayDay}
                    </span>
                    <StatusDot status={status} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#e8f5d0' : '#3a3a2e' }}>
                      {displayTemp}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Evidence panel */}
          <div style={{ opacity: weatherLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 10, marginTop: 2 }}>
              Conditions
            </div>
            <div className="grid grid-cols-3 gap-2">
              {buildEvidenceTiles({
                // Shift dailyIntervals so [0] always refers to the selected day's data
                todayVerdict:     verdict?.weekVerdicts?.[selectedDay] ?? verdict?.todayVerdict ?? 'go',
                dailyIntervals:   dailyIntervals.slice(selectedDay),
                // Today: use live current/hourly values; future days: use daily forecast values
                currentTemp:      selectedDay === 0 ? currentTemp
                                  : (dailyIntervals[selectedDay]?.values?.temperatureMax != null
                                      ? Math.round(dailyIntervals[selectedDay].values.temperatureMax) : null),
                currentHumidity:  selectedDay === 0 ? currentHumidity
                                  : (dailyIntervals[selectedDay]?.values?.humidity != null
                                      ? Math.round(dailyIntervals[selectedDay].values.humidity) : null),
                airQuality:       selectedDay === 0 ? airQuality
                                  : (dailyIntervals[selectedDay]?.values?.epaIndex != null
                                      ? epaLabel(dailyIntervals[selectedDay].values.epaIndex) : 'N/A'),
                // Slice sunTimes so sunDisplay always reads index [0] as the selected day
                sunTimes:         sunTimes.slice(selectedDay),
                precipIntensityNow: selectedDay === 0 ? precipIntensityNow : 0,
                // Pass precomputed dry streak so future-day tiles show accurate values
                dryStreakHours:   verdict?.weekDryStreakHrs?.[selectedDay] ?? null,
              }).map(({ icon, name, value, status }) => (
                <div key={name} style={{
                  background: '#ffffff',
                  borderRadius: 14,
                  padding: '14px 10px 12px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
                  textAlign: 'center',
                }} className="flex flex-col items-center gap-1">
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: '#8a8475', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#2c2c1e', marginTop: 2 }}>{value}</span>
                  <div style={{ marginTop: 6 }}>
                    <StatusPill status={status} />
                  </div>
                </div>
              ))}
            </div>
            {cacheTimestamp && (
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: '#b8b3a8', fontFamily: "'DM Sans', sans-serif" }}>
                {tick >= 0 && cacheAgeLabel(cacheTimestamp)}
              </div>
            )}
          </div>

          {/* Trail tips */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 10, marginTop: 2 }}>
              Trail tips
            </div>
            <div className="flex flex-col gap-2">
              {(verdict?.weekTips?.[selectedDay] ?? verdict?.tips ?? ['Loading trail conditions…']).map((tip, i) => (
                <div key={i} style={{ background: '#ffffff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }} className="flex items-start gap-3">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5a7a3a', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 13, color: '#3a3a2e', lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        locationName={locationName}
        gpsCoords={coords}
        onSelectLocation={handleSelectLocation}
        onUseGPS={handleUseGPS}
      />
    </>
  )
}
