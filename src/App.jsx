import { useState, useEffect, useMemo } from 'react'
import { cacheAgeLabel } from './lib/cache'
import { fetchWeatherBundle } from './lib/weatherClient'
import { getPreferences, computeVerdict } from './lib/verdictEngine'
import { NOMINATIM_HEADERS, usStateAbbr } from './lib/geo'
import SplashScreen from './components/SplashScreen'
import TrailTipsIsland from './components/TrailTipsIsland'
import BottomNav from './components/BottomNav'
import StatusDot from './components/StatusDot'
import Sheet from './components/Sheet'
import { PinIcon } from './components/icons'

// ─── Data ────────────────────────────────────────────────────────────────────

// Dynamic today label — computed once per session
const TODAY_LABEL = (() => {
  const d = new Date()
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${days[d.getDay()]} · ${months[d.getMonth()]} ${d.getDate()}`
})()

// ─── Weather helpers ──────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayAbbr(isoString) {
  return DAY_ABBR[new Date(isoString).getDay()]
}

function formatTime(isoString) {
  // isoString from Open-Meteo is like "2026-04-05T06:42"
  const d = new Date(isoString)
  let h = d.getHours(), m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}

function sunDisplay(sunTimes, { forToday = true } = {}) {
  // Returns { icon, value, label, status } for the conditions strip
  if (!sunTimes?.length) return { icon: '🌅', value: '--', label: 'Sunset', status: 'Neutral' }
  const today = sunTimes[0]

  // Future days: always show that day's sunset time, neutral status
  if (!forToday) {
    return { icon: '🌅', value: today.sunset ? formatTime(today.sunset) : '--', label: 'Sunset', status: 'Neutral' }
  }

  const now  = new Date()
  const rise = new Date(today.sunrise)
  const set  = new Date(today.sunset)

  // Before sunrise — show today's sunrise time
  if (now < rise) return { icon: '🌄', value: formatTime(today.sunrise), label: 'Sunrise', status: 'Neutral' }

  // Between sunrise and sunset — show time remaining with urgency glow
  if (now < set) {
    const hrsLeft  = (set - now) / 3600000
    const minsLeft = Math.round(hrsLeft * 60)
    if (hrsLeft >= 4) {
      return { icon: '🌅', value: formatTime(today.sunset), label: 'Sunset', status: 'Ideal' }
    }
    if (hrsLeft >= 2) {
      const h = Math.floor(hrsLeft)
      const m = Math.round((hrsLeft - h) * 60)
      return { icon: '🌅', value: `${h}h ${m}m left`, label: 'Sunset', status: 'Good' }
    }
    return { icon: '🌅', value: `${minsLeft}m left`, label: 'Sunset', status: 'Marginal' }
  }

  // After sunset — show tomorrow's sunrise, neutral
  const tomorrow = sunTimes[1]
  if (tomorrow) return { icon: '🌄', value: formatTime(tomorrow.sunrise), label: 'Sunrise', status: 'Neutral' }
  return { icon: '🌅', value: formatTime(today.sunset), label: 'Sunset', status: 'Neutral' }
}

// ─── Evidence Panel helpers ───────────────────────────────────────────────

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
  if (label === 'Sensitive') return 'Marginal'
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

function trailMoisture(dryHrs) {
  if (dryHrs == null) return { value: '--', status: 'Neutral' }
  if (dryHrs > 48) return { value: 'Dry',           status: 'Ideal' }
  if (dryHrs > 24) return { value: 'Mostly dry',    status: 'Good' }
  if (dryHrs > 12) return { value: 'Light damp', status: 'Marginal' }
  return { value: 'Damp', status: 'Blocking' }
}

function precipProbStatus(prob) {
  if (prob == null) return 'Neutral'
  if (prob === 0)  return 'Ideal'
  if (prob < 10)   return 'Good'
  if (prob < 30)   return 'Marginal'
  return 'Blocking'
}

function uvStatus(val) {
  if (val == null) return 'Neutral'
  const n = Math.round(val)   // align with uvLabel which also rounds
  if (n <= 2)  return 'Neutral'
  if (n <= 5)  return 'Good'
  if (n <= 7)  return 'Marginal'
  return 'Blocking'
}

function uvLabel(val) {
  if (val == null) return '--'
  const n = Math.round(val)
  if (n <= 2)  return `${n} Low`
  if (n <= 5)  return `${n} Moderate`
  if (n <= 7)  return `${n} High`
  if (n <= 10) return `${n} V.High`
  return `${n} Extreme`
}

function windStatus(mph) {
  if (mph == null) return 'Neutral'
  if (mph <= 8)  return 'Ideal'
  if (mph <= 15) return 'Good'
  if (mph <= 25) return 'Marginal'
  return 'Blocking'
}

function dryStreakDisplay(hrs) {
  if (hrs == null) return '--'
  const days    = hrs / 24
  const rounded = Math.round(days * 4) / 4
  // Under 6 hrs (rounded < 0.25) show raw hours; everything else shows as days
  if (rounded < 0.25) return `${Math.round(hrs)} hrs`
  const label = rounded === 1 ? 'day' : 'days'
  // Trim trailing zeros: 2.00 → "2", 1.50 → "1.5", 1.25 → "1.25"
  const num = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '')
  return `${num} ${label}`
}

// dryStreakHours: optional override for the dry-streak tile (passed for future days
// from the per-day dryStreakHrs computed in computeVerdict). When null/undefined the
// function falls back to its original same-day estimation logic.
function buildEvidenceTiles({ todayVerdict, dailyIntervals, currentTemp, currentHumidity, airQuality, sunTimes, precipIntensityNow, dryStreakHours, uvIndex, windSpeed, isToday = true }) {
  const sun = sunDisplay(sunTimes, { forToday: isToday })
  const precipToday = dailyIntervals[0]?.values?.precipitationAccumulation ?? 0
  const precipProb  = dailyIntervals[0]?.values?.precipProbability ?? null
  const now = new Date()
  const hourOfDay = now.getHours() + now.getMinutes() / 60

  const rideWindowTile = { icon: sun.icon, name: sun.label, value: sun.value, status: sun.status }

  if (todayVerdict === 'go') {
    // Use precomputed dry streak for future days; fall back to estimate for today
    const dryHrs = dryStreakHours != null ? dryStreakHours : (precipToday < 0.01 ? 58 : Math.max(0, (1 - precipToday) * 48))
    const moisture = trailMoisture(dryHrs)
    const precipValue = precipProb != null
      ? (precipProb === 0 ? 'Clear' : `${precipProb}% rain`)
      : (precipToday < 0.01 ? 'Clear' : `${precipToday.toFixed(2)}"`)
    const precipSt = precipProb != null ? precipProbStatus(precipProb) : precipStatus(precipToday)
    return [
      { icon: '🌤️', name: 'Forecast',       value: precipValue,                                                     status: precipSt },
      { icon: '🌡️', name: 'Temperature',    value: currentTemp     != null ? `${currentTemp}°F` : '--',             status: tempStatus(currentTemp) },
      { icon: '💧', name: 'Humidity',        value: currentHumidity != null ? `${currentHumidity}%` : '--',         status: humidityStatus(currentHumidity) },
      { icon: '⏱️', name: 'Dry Streak',      value: dryStreakDisplay(dryHrs),                                       status: dryStreakStatus(dryHrs) },
      { icon: '🌱', name: 'Trail Moisture',  value: moisture.value,                                                  status: moisture.status },
      { icon: '🌿', name: 'Air Quality',     value: airQuality ?? '--',                                              status: aqiStatus(airQuality) },
      { icon: '🔆', name: 'UV Index',        value: uvLabel(uvIndex),                                                status: uvStatus(uvIndex) },
      { icon: '💨', name: 'Wind',            value: windSpeed != null ? `${Math.round(windSpeed)} mph` : '--',       status: windStatus(windSpeed) },
      rideWindowTile,
    ]
  }

  if (todayVerdict === 'caution') {
    // Use precomputed dry streak for future days; fall back to estimate for today
    const estHrsSinceRain = dryStreakHours != null ? dryStreakHours : Math.max(1, hourOfDay - 2)
    const dryoutHrs = precipToday * 24
    // Figure out rain timing description
    let rainTiming = 'Rain ahead'
    if (precipToday >= 0.05 && precipToday <= 0.1) rainTiming = 'Light rain'
    else if (precipToday > 0.1 && estHrsSinceRain > dryoutHrs * 0.75) rainTiming = 'Drying out'
    else if (precipToday > 0.1) rainTiming = 'Rain earlier'

    return [
      { icon: '⏱️', name: 'Dry Streak', value: `${Math.round(estHrsSinceRain)}h dry`, status: estHrsSinceRain < 12 ? 'Marginal' : dryStreakStatus(estHrsSinceRain) },
      { icon: '💧', name: 'Humidity', value: currentHumidity != null ? `${currentHumidity}%` : '--', status: humidityStatus(currentHumidity) },
      { icon: '🌧️', name: 'Rain Timing', value: rainTiming, status: 'Marginal' },
      { icon: '🌡️', name: 'Temperature', value: currentTemp != null ? `${currentTemp}°F` : '--', status: tempStatus(currentTemp) },
      { icon: '🌥️', name: 'Forecast', value: `${precipToday.toFixed(2)}"`, status: precipStatus(precipToday) },
      rideWindowTile,
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
  tiles.push(rideWindowTile)

  return tiles
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [coords,          setCoords]          = useState(null)
  const [locationName,    setLocationName]    = useState('Locating...')
  const [isUsingGPS,      setIsUsingGPS]      = useState(() => localStorage.getItem('rsg_location_mode') !== 'manual')
  const [navTarget,       setNavTarget]       = useState(null) // 'activity' | 'location' | 'settings' | 'profile' | null
  const [tipsOpen,        setTipsOpen]        = useState(false)

  const [weatherLoading, setWeatherLoading] = useState(false)
  const [currentTemp,    setCurrentTemp]    = useState(null)
  const [currentHumidity,setCurrentHumidity]= useState(null)
  const [airQuality,       setAirQuality]       = useState(null)
  const [weeklyAqiLabels,  setWeeklyAqiLabels]  = useState([])
  const [uvIndexNow,       setUvIndexNow]       = useState(null)
  const [windSpeedNow,     setWindSpeedNow]     = useState(null)
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

  // User preferences — initialized from localStorage on mount.
  const [userPreferences] = useState(() => getPreferences())

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
      } catch { /* ignore */ }
      // No saved manual location — fall through to GPS
    }

    if (!navigator.geolocation) { setLocationName('Location unavailable'); return }
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        setCoords({ latitude, longitude })
        try {
          const name = await reverseGeocode(latitude, longitude)
          setLocationName(name)
        } catch (err) {
          console.warn('reverseGeocode failed', err)
          setLocationName('Location unavailable')
        }
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

  // Route a parsed weather bundle into React state.
  const applyBundle = (bundle) => {
    const { weather, sun, aqi, timestamp } = bundle

    if (weather) {
      setCurrentTemp(weather.currentTemp)
      setCurrentHumidity(weather.currentHumidity)
      setWeatherCodeNow(weather.weatherCodeNow)
      setPrecipIntensityNow(weather.precipIntensityNow)
      setHourlyIntervals(weather.hourlyIntervals)
    } else {
      setCurrentTemp(null); setCurrentHumidity(null)
      setHourlyIntervals([])
      setWeatherCodeNow(null); setPrecipIntensityNow(0)
    }

    if (aqi) {
      setAirQuality(aqi.airQuality)
      setWeeklyAqiLabels(aqi.weeklyAqiLabels)
    } else {
      setAirQuality(null)
      setWeeklyAqiLabels([])
    }

    if (sun) {
      setDailyIntervals(sun.dailyIntervals)
      setDailyForecast(sun.dailyIntervals.map(interval => ({
        day:     dayAbbr(interval.startTime),
        tempMax: interval.values.temperatureMax != null
                   ? Math.round(interval.values.temperatureMax) : null,
      })))
      setSunTimes(sun.sunTimes)
      setUvIndexNow(sun.uvIndexNow)
      setWindSpeedNow(sun.windSpeedNow)
    } else {
      setDailyIntervals([])
      setDailyForecast([])
      setSunTimes([])
      setUvIndexNow(null)
      setWindSpeedNow(null)
    }

    setCacheTimestamp(timestamp)
    setWeatherLoading(false)
    setSelectedDay(0)  // reset to today whenever new data loads
  }

  // Shared fetch — checks cache unless force:true (manual refresh)
  const fetchWeatherData = async (lat, lon, { force = false } = {}) => {
    const apiKey = import.meta.env.VITE_TOMORROW_API_KEY
    if (!apiKey) return
    const bundle = await fetchWeatherBundle(lat, lon, {
      apiKey,
      force,
      onWeatherFetchStart: () => setWeatherLoading(true),
    })
    applyBundle(bundle)
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
                }).catch(err => console.warn('reverseGeocode failed during refresh', err)),
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
    try { localStorage.setItem('rsg_manual_location', JSON.stringify({ lat, lon, name: r.label })) } catch { /* ignore */ }
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
        } catch (err) {
          console.warn('reverseGeocode failed', err)
        }
      },
      (err) => console.warn('Geolocation failed', err),
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
      sun: sunDisplay(sunTimes),
      preferences: userPreferences,  // [PREF] all preference-driven adjustments
    })
  }, [dailyIntervals, hourlyIntervals, currentTemp, currentHumidity, weatherCodeNow, precipIntensityNow, sunTimes, userPreferences])

  return (
    <>
      <SplashScreen />

      <div style={{ background: '#111111', fontFamily: "'DM Sans', sans-serif" }} className="min-h-screen flex justify-center items-start py-10 px-4">
        <div style={{ maxWidth: 430, padding: '28px 22px 110px' }} className="w-full flex flex-col gap-6">

          {/* Header */}
          <header className="flex items-center justify-between">
            {/* Left: location name (opens Location sheet) */}
            <button
              onClick={() => setNavTarget('location')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PinIcon color="#f07820" />
              <span style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>{locationName}</span>
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
                  <path d="M3 9.5l4 4 8-8" stroke="#f07820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg
                  width="18" height="18" viewBox="0 0 18 18" fill="none"
                  style={{ animation: refreshPhase === 'updating' ? 'spin 0.8s linear infinite' : 'none' }}
                >
                  <path d="M15.75 9A6.75 6.75 0 1 1 9.53 2.27L11.25 4" stroke="#f0f0f0" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 1.5v3h3" stroke="#f0f0f0" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {refreshPhase !== 'idle' && (
                <span style={{ fontSize: 10, color: 'rgba(240, 240, 240, 0.35)', fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>
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
            const verdictChar = selVerdict === 'nogo' ? '✕' : selVerdict === 'caution' ? '!' : '✓'
            return (
              <div style={{ background: cardBg, borderRadius: 22, padding: '20px 20px 22px', position: 'relative', overflow: 'hidden', transition: 'background 0.25s ease' }}>
                {/* Watermark — large faded verdict glyph behind content */}
                <div style={{
                  position: 'absolute', right: -20, bottom: -40,
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 220,
                  lineHeight: 1,
                  color: 'rgba(255, 255, 255, 0.06)',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}>
                  {verdictChar}
                </div>

                <div style={{
                  position: 'absolute', top: 14, right: 14,
                  background: 'rgba(255,255,255,0.15)',
                  color: '#f0f0f0', borderRadius: 999,
                  fontSize: 11, fontWeight: 500, padding: '3px 10px',
                }}>
                  {selLabel}
                </div>
                <div className="flex items-start gap-3 mt-1" style={{ position: 'relative' }}>
                  <div style={{
                    width: 36, height: 36,
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#f0f0f0', fontSize: 18, flexShrink: 0,
                  }}>
                    {verdictChar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: '#f0f0f0', lineHeight: 1.1 }}>
                      {selVerdict === 'nogo' ? 'Stay home.' : selVerdict === 'caution' ? 'Ride with care.' : 'Go ride.'}
                    </div>
                    <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.18)', margin: '10px 0' }} />
                    <div style={{ color: 'rgba(240, 240, 240, 0.72)', fontSize: 13, lineHeight: 1.4 }}>
                      {selReason ?? (weatherLoading ? 'Loading conditions…' : 'Checking trail conditions…')}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Week strip — 7-day outlook */}
          <div>
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
                      background: active ? activeBg : '#1c1c1c',
                      borderRadius: 14, padding: '16px 4px 18px', textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <span style={{ fontSize: 10, fontWeight: 500, color: active ? 'rgba(240, 240, 240, 0.72)' : 'rgba(240, 240, 240, 0.35)', textTransform: 'uppercase' }}>
                      {displayDay}
                    </span>
                    <StatusDot status={status} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f0f0f0' }}>
                      {displayTemp}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Evidence panel */}
          <div style={{ opacity: weatherLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
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
                airQuality:       selectedDay === 0 ? airQuality : (weeklyAqiLabels[selectedDay] ?? 'N/A'),
                // Slice sunTimes so sunDisplay always reads index [0] as the selected day
                sunTimes:         sunTimes.slice(selectedDay),
                precipIntensityNow: selectedDay === 0 ? precipIntensityNow : 0,
                // Pass precomputed dry streak so future-day tiles show accurate values
                dryStreakHours:   verdict?.weekDryStreakHrs?.[selectedDay] ?? null,
                uvIndex:          selectedDay === 0 ? uvIndexNow   : (dailyIntervals[selectedDay]?.values?.uvIndex   ?? null),
                windSpeed:        selectedDay === 0 ? windSpeedNow : (dailyIntervals[selectedDay]?.values?.windSpeed ?? null),
                isToday:          selectedDay === 0,
              }).map(({ icon, name, value, status }) => {
                const tint =
                  status === 'Ideal' || status === 'Good' ? 'rgba(76, 175, 106, 0.09)' :
                  status === 'Marginal'                   ? 'rgba(232, 160, 32, 0.09)' :
                  status === 'Blocking'                   ? 'rgba(224, 72, 72, 0.09)'  :
                  null
                return (
                  <div key={name} style={{
                    position: 'relative',
                    height: 100,
                    backgroundColor: '#1c1c1c',
                    backgroundImage: tint ? `linear-gradient(${tint}, ${tint})` : 'none',
                    borderRadius: 14,
                    padding: '14px 10px 28px',
                    textAlign: 'center',
                  }} className="flex flex-col items-center gap-1">
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: '#f0f0f0', marginTop: 6, lineHeight: 1.1 }}>{value}</span>
                    <span style={{
                      position: 'absolute',
                      bottom: 10, left: 0, right: 0,
                      fontSize: 10, fontWeight: 500,
                      color: 'rgba(240, 240, 240, 0.35)',
                      textAlign: 'center',
                    }}>{name}</span>
                  </div>
                )
              })}
            </div>
            {cacheTimestamp && (
              <div data-tick={tick} style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: 'rgba(240, 240, 240, 0.35)', fontFamily: "'DM Sans', sans-serif" }}>
                {/* tick read here to trigger re-render every minute */}
                {cacheAgeLabel(cacheTimestamp)}
              </div>
            )}
          </div>

          {/* Trail tips trigger — opens the floating island */}
          <div className="flex justify-center">
            <button
              onClick={() => setTipsOpen(true)}
              style={{
                background: '#f07820',
                color: '#f0f0f0',
                border: 'none',
                borderRadius: 999,
                padding: '12px 28px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: 'pointer',
              }}
            >
              Trail tips
            </button>
          </div>

        </div>
      </div>

      <Sheet
        target={navTarget}
        onClose={() => setNavTarget(null)}
        locationName={locationName}
        gpsCoords={coords}
        onSelectLocation={(r) => { handleSelectLocation(r); setNavTarget(null) }}
        onUseGPS={() => { handleUseGPS(); setNavTarget(null) }}
      />

      <BottomNav onNavigate={setNavTarget} />

      <TrailTipsIsland
        open={tipsOpen}
        tips={verdict?.weekTips?.[selectedDay] ?? verdict?.tips ?? ['Loading trail conditions…']}
        onClose={() => setTipsOpen(false)}
      />
    </>
  )
}
