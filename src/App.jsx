import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'

// Splash timing (ms):
// 0 → Rhedi, 600 → Set, 1200 → Go, 1600 → slogan, 2600 → fade out, 3200 → remove

function SplashScreen() {
  const [showSet,    setShowSet]    = useState(false)
  const [showGo,     setShowGo]     = useState(false)
  const [showSlogan, setShowSlogan] = useState(false)
  const [fading,     setFading]     = useState(false)
  const [gone,       setGone]       = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowSet(true),    600)
    const t2 = setTimeout(() => setShowGo(true),     1200)
    const t3 = setTimeout(() => setShowSlogan(true), 1600)
    const t4 = setTimeout(() => setFading(true),     2600)
    const t5 = setTimeout(() => setGone(true),       3200)
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
        <span style={wordStyle}>Rhedi</span>
        {showSet && <span style={wordStyle}>Set</span>}
        {showGo  && <span style={wordStyle}>Go</span>}
      </div>
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 15, color: '#f5f2eb',
        opacity: showSlogan ? 0.7 : 0,
        marginTop: 32,
        transition: 'opacity 0.5s ease',
        textAlign: 'center',
      }}>
        Less time scrolling, more time rolling.
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
const SUN_CACHE_KEY     = 'rsg_sun_cache'
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

        {/* Sport */}
        <div style={SECTION_LABEL}>Sport</div>
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

function computeVerdict({ dailyIntervals, currentTemp, currentHumidity, weatherCodeNow, precipIntensityNow, sunTimes }) {
  const now = new Date()

  // --- Extract per-day precipitation from daily intervals ---
  const weekPrecip = dailyIntervals.map(d => d?.values?.precipitationAccumulation ?? 0)
  const precipToday = weekPrecip[0] ?? 0

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
  // 3. Significant rain in today's window (past or forecast)
  else if (precipToday > 0.1) {
    const dryoutHrs      = precipToday * 24
    // Estimate hours elapsed since rain: if it's currently dry, assume rain peaked a few hours ago
    const hourOfDay      = now.getHours() + now.getMinutes() / 60
    const estHrsSinceRain = Math.max(1, hourOfDay - 2)
    const cautionStart   = dryoutHrs * 0.75

    if (estHrsSinceRain < cautionStart) {
      todayVerdict = 'nogo'
      const hoursLeft = Math.ceil(dryoutHrs - estHrsSinceRain)
      todayReason = `${precipToday.toFixed(2)}" of rain today. Trails need ~${hoursLeft} more hours to dry.`
    } else if (estHrsSinceRain < dryoutHrs) {
      todayVerdict = 'caution'
      todayReason = `${precipToday.toFixed(2)}" of rain today. Trails may be soft in spots — ride with care.`
    }
    // else falls through to GO (dryout complete)
  }
  // 4. Light rain today (trace amounts)
  else if (precipToday >= 0.05) {
    todayVerdict = 'caution'
    todayReason  = `Light rain (${precipToday.toFixed(2)}") in today's forecast. Conditions may soften later.`
  }
  // 5. High humidity caution (muggy after recent moisture)
  else if (currentHumidity != null && currentHumidity > 85) {
    todayVerdict = 'caution'
    todayReason  = `High humidity at ${currentHumidity}%. Trails may feel tacky or slow in low-lying areas.`
  }

  // 6. GO — build a descriptive reason
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

  // --- 7-day verdicts ---
  const weekVerdicts = weekPrecip.map((precip, i) => {
    if (i === 0) return todayVerdict

    const prevPrecip = weekPrecip[i - 1]

    if (precip > 0.1)  return 'nogo'
    if (precip >= 0.05) return 'caution'

    // Dryout from previous day's rain — assume ~24 hrs elapsed between day midpoints
    if (prevPrecip > 0.1) {
      const dryoutHrs = prevPrecip * 24
      if (dryoutHrs > 18) return 'nogo'    // > 0.75" prev day: still drying
      return 'caution'                      // lighter rain prev day: probably soft
    }

    // Check two days back for heavy rain (> 1" needs 24+ hrs)
    if (i >= 2 && weekPrecip[i - 2] > 1.0) {
      const dryoutHrs = weekPrecip[i - 2] * 24
      if (48 < dryoutHrs) return 'caution'
    }

    return 'go'
  })

  // --- Tips ---
  const sun  = sunDisplay(sunTimes)
  const tips = []

  if (todayVerdict === 'go') {
    // Tip 1: temperature
    if (currentTemp != null) {
      if (currentTemp >= 85)      tips.push(`Hot at ${currentTemp}°F. Bring extra water and plan for shaded rest stops.`)
      else if (currentTemp <= 45) tips.push(`Cold at ${currentTemp}°F. Layer up and warm up gradually before pushing hard.`)
      else                        tips.push(`${currentTemp}°F with firm conditions. Great day to push pace on hardpack.`)
    } else {
      tips.push('Check local trail conditions before heading out.')
    }

    // Tip 2: humidity
    if (currentHumidity != null) {
      if (currentHumidity > 70) tips.push(`Humidity at ${currentHumidity}% — trails may feel tacky. Great for grip on corners.`)
      else                      tips.push(`Low humidity at ${currentHumidity}% — expect dusty, fast conditions on exposed sections.`)
    } else {
      tips.push('Check local trail reports for current surface conditions.')
    }

    // Tip 3: sunset/sunrise timing
    if (sun.label === 'Sunset')       tips.push(`Sunset at ${sun.value}. Plenty of daylight — no need to rush your start.`)
    else if (sun.label === 'Sunrise') tips.push(`Sunrise at ${sun.value}. Early starters get the freshest trail conditions.`)
    else                              tips.push(`${sun.label} at ${sun.value}.`)

  } else if (todayVerdict === 'caution') {
    tips.push(todayReason)
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

  return { todayVerdict, todayReason, weekVerdicts, tips }
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
  const [weatherCodeNow,   setWeatherCodeNow]   = useState(null)
  const [precipIntensityNow, setPrecipIntensityNow] = useState(0)
  const [sunTimes,         setSunTimes]         = useState([])
  const [refreshing,       setRefreshing]       = useState(false)
  const [refreshPhase,     setRefreshPhase]     = useState('idle') // 'idle' | 'updating' | 'done'
  const [cacheTimestamp,   setCacheTimestamp]   = useState(null)
  const [tick,             setTick]             = useState(0) // increments every min to refresh age label

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

  // Apply parsed weather + sun data to state
  const applyData = (weatherRaw, sunRaw, timestamp) => {
    if (weatherRaw) {
      const timelines = weatherRaw?.data?.timelines ?? []
      const hourly = timelines.find(t => t.timestep === '1h')
      const daily  = timelines.find(t => t.timestep === '1d')
      const cur = hourly?.intervals?.[0]?.values ?? {}
      setCurrentTemp(cur.temperature != null ? Math.round(cur.temperature) : null)
      setCurrentHumidity(cur.humidity != null ? Math.round(cur.humidity)   : null)
      setAirQuality(epaLabel(cur.epaIndex))
      setWeatherCodeNow(cur.weatherCode ?? null)
      setPrecipIntensityNow(cur.precipitationIntensity ?? 0)
      const rawDaily = (daily?.intervals ?? []).slice(0, 7)
      setDailyIntervals(rawDaily)
      setDailyForecast(rawDaily.map(interval => ({
        day:     dayAbbr(interval.startTime),
        tempMax: interval.values?.temperatureMax != null
                  ? Math.round(interval.values.temperatureMax) : null,
      })))
    } else {
      setCurrentTemp(null); setCurrentHumidity(null)
      setAirQuality(null);  setDailyForecast([])
      setDailyIntervals([]); setWeatherCodeNow(null); setPrecipIntensityNow(0)
    }
    if (sunRaw) {
      const d = sunRaw?.daily ?? {}
      setSunTimes((d.sunrise ?? []).map((rise, i) => ({ sunrise: rise, sunset: d.sunset?.[i] })))
    } else {
      setSunTimes([])
    }
    setCacheTimestamp(timestamp)
    setWeatherLoading(false)
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
          `https://api.tomorrow.io/v4/timelines?location=${lat},${lon}&fields=temperature,temperatureMax,humidity,precipitationAccumulation,precipitationIntensity,weatherCode,epaIndex&units=imperial&timesteps=1h,1d&apikey=${apiKey}`
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
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=auto&forecast_days=7`
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
    return computeVerdict({ dailyIntervals, currentTemp, currentHumidity, weatherCodeNow, precipIntensityNow, sunTimes })
  }, [dailyIntervals, currentTemp, currentHumidity, weatherCodeNow, precipIntensityNow, sunTimes])

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

          {/* Verdict card */}
          <div style={{ background: '#2d4a1e', borderRadius: 22, padding: '20px 20px 22px', position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(255,255,255,0.15)',
              color: '#e8f5d0', borderRadius: 999,
              fontSize: 11, fontWeight: 500, padding: '3px 10px',
            }}>
              {TODAY_LABEL}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div style={{
                width: 36, height: 36,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#e8f5d0', fontSize: 18, flexShrink: 0,
              }}>
                {verdict?.todayVerdict === 'nogo' ? '✕' : verdict?.todayVerdict === 'caution' ? '!' : '✓'}
              </div>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: '#e8f5d0', lineHeight: 1.1 }}>
                  {verdict?.todayVerdict === 'nogo' ? 'Stay home today.' : verdict?.todayVerdict === 'caution' ? 'Ride with care.' : 'Go ride.'}
                </div>
                <div style={{ color: '#a8c882', fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
                  {verdict?.todayReason ?? (weatherLoading ? 'Loading conditions…' : 'Checking trail conditions…')}
                </div>
              </div>
            </div>
          </div>

          {/* Conditions strip */}
          <div style={{ background: '#ffffff', borderRadius: 18, padding: '16px 14px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', opacity: weatherLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
            <div className="grid grid-cols-4 gap-1 text-center">
              {(() => {
                const sun = sunDisplay(sunTimes)
                return [
                  { icon: '🌡️', value: currentTemp     != null ? `${currentTemp}°F`    : '--', label: 'Temp'     },
                  { icon: '💧', value: currentHumidity  != null ? `${currentHumidity}%` : '--', label: 'Humidity' },
                  { icon: sun.icon, value: sun.value, label: sun.label },
                  { icon: '🌿', value: airQuality ?? '--', label: 'Air', green: epaIsGood(airQuality) },
                ]
              })().map(({ icon, value, label, green }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: green ? '#5a7a3a' : '#2c2c1e' }}>{value}</span>
                  <span style={{ fontSize: 10, color: '#8a8475', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                </div>
              ))}
            </div>
            {cacheTimestamp && (
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: '#b8b3a8', fontFamily: "'DM Sans', sans-serif" }}>
                {/* tick is read here so the label re-evaluates every minute */}
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
              {(verdict?.tips ?? ['Loading trail conditions…']).map((tip, i) => (
                <div key={i} style={{ background: '#ffffff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }} className="flex items-start gap-3">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5a7a3a', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 13, color: '#3a3a2e', lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Week strip */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 10, marginTop: 2 }}>
              This week
            </div>
            <div className="grid grid-cols-7 gap-1" style={{ opacity: weatherLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
              {Array.from({ length: 7 }, (_, i) => {
                const forecast    = dailyForecast[i]
                const displayDay  = forecast?.day ?? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][(new Date().getDay() + i) % 7]
                const displayTemp = forecast?.tempMax != null ? `${forecast.tempMax}°` : '--'
                const status      = verdict?.weekVerdicts?.[i] ?? 'go'
                const active      = i === 0
                return (
                  <div key={i} style={{
                    background: active ? '#2d4a1e' : '#ffffff',
                    borderRadius: 14, padding: '12px 4px', textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                  }} className="flex flex-col items-center gap-1">
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
