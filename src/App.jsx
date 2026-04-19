import { useState, useEffect, useMemo } from 'react'
import { cacheAgeLabel } from './lib/cache'
import { fetchWeatherBundle } from './lib/weatherClient'
import { getPreferences, computeVerdict, buildFactors } from './lib/verdictEngine'
import { NOMINATIM_HEADERS, usStateAbbr } from './lib/geo'
import SplashScreen from './components/SplashScreen'
import TrailTipsIsland from './components/TrailTipsIsland'
import CaveatIsland from './components/CaveatIsland'
import BottomNav from './components/BottomNav'
import StatusDot from './components/StatusDot'
import Sheet from './components/Sheet'
import VerdictCard from './components/VerdictCard'
import FactorGrid from './components/FactorGrid'
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

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [coords,          setCoords]          = useState(null)
  const [locationName,    setLocationName]    = useState('Locating...')
  const [isUsingGPS,      setIsUsingGPS]      = useState(() => localStorage.getItem('rsg_location_mode') !== 'manual')
  const [navTarget,       setNavTarget]       = useState(null) // 'activity' | 'location' | 'settings' | 'profile' | null
  const [tipsOpen,        setTipsOpen]        = useState(false)
  const [caveatsOpen,     setCaveatsOpen]     = useState(false)

  const [weatherLoading, setWeatherLoading] = useState(false)
  const [currentTemp,    setCurrentTemp]    = useState(null)
  const [currentHumidity,setCurrentHumidity]= useState(null)
  const [airQuality,       setAirQuality]       = useState(null)
  const [weeklyAqi,        setWeeklyAqi]        = useState([])
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
      setWeeklyAqi(aqi.weeklyAqi)
    } else {
      setAirQuality(null)
      setWeeklyAqi([])
    }

    if (sun) {
      setDailyIntervals(sun.dailyIntervals)
      setDailyForecast(sun.dailyIntervals.map(interval => ({
        day:     dayAbbr(interval.startTime),
        tempMax: interval.values.temperatureMax != null
                   ? Math.round(interval.values.temperatureMax) : null,
      })))
      setSunTimes(sun.sunTimes)
      setWindSpeedNow(sun.windSpeedNow)
    } else {
      setDailyIntervals([])
      setDailyForecast([])
      setSunTimes([])
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
      hourlyIntervals,
      currentTemp,
      currentHumidity,
      weatherCodeNow,
      precipIntensityNow,
      sun: sunDisplay(sunTimes),
      sunTimes,
      windSpeedNow,
      preferences: userPreferences,
    })
  }, [dailyIntervals, hourlyIntervals, currentTemp, currentHumidity, weatherCodeNow, precipIntensityNow, sunTimes, windSpeedNow, userPreferences])

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

          {/* Verdict card */}
          <VerdictCard
            verdict={verdict?.weekVerdicts?.[selectedDay] ?? verdict?.todayVerdict}
            reason={verdict?.weekReasons?.[selectedDay] ?? verdict?.todayReason}
            caveats={selectedDay === 0 ? (verdict?.todayCaveats ?? []) : []}
            hoursUntilSunset={verdict?.hoursUntilSunset}
            rideWindowEnd={verdict?.rideWindowEnd}
            label={selectedDay === 0
              ? TODAY_LABEL
              : (dailyForecast[selectedDay]?.day ?? DAY_ABBR[(new Date().getDay() + selectedDay) % 7])}
            loading={weatherLoading}
            onCaveatsClick={() => setCaveatsOpen(true)}
          />

          {/* Week strip — 7-day outlook */}
          <div>
            <div className="grid grid-cols-7 gap-1" style={{ opacity: weatherLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
              {Array.from({ length: dailyForecast.length > 0 ? dailyForecast.length : 7 }, (_, i) => {
                const forecast    = dailyForecast[i]
                const displayDay  = forecast?.day ?? DAY_ABBR[(new Date().getDay() + i) % 7]
                const displayTemp = forecast?.tempMax != null ? `${forecast.tempMax}°` : '--'
                const status      = verdict?.weekVerdicts?.[i] ?? 'go'
                const active      = i === selectedDay
                const activeBg    = status === 'nogo' ? '#5c1a1a' : '#2d4a1e'
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

          {/* Factor grid */}
          <div style={{ opacity: weatherLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
            <FactorGrid factors={buildFactors({
              dryoutPercent:    selectedDay === 0 ? (verdict?.dryoutPercent ?? 100) : 100,
              precipToday:      dailyIntervals[selectedDay]?.values?.precipitationAccumulation ?? 0,
              currentTemp:      selectedDay === 0 ? currentTemp
                                : (dailyIntervals[selectedDay]?.values?.temperatureMax != null
                                    ? Math.round(dailyIntervals[selectedDay].values.temperatureMax) : null),
              currentHumidity:  selectedDay === 0 ? currentHumidity
                                : (dailyIntervals[selectedDay]?.values?.humidity != null
                                    ? Math.round(dailyIntervals[selectedDay].values.humidity) : null),
              airQuality:       selectedDay === 0 ? airQuality : (weeklyAqi[selectedDay] ?? null),
              sunriseTime:      sunTimes[selectedDay]?.sunrise ? formatTime(sunTimes[selectedDay].sunrise) : null,
              sunsetTime:       sunTimes[selectedDay]?.sunset  ? formatTime(sunTimes[selectedDay].sunset)  : null,
              hoursUntilSunset: selectedDay === 0 ? (verdict?.hoursUntilSunset ?? null) : null,
            })} />
            {cacheTimestamp && (
              <div data-tick={tick} style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: 'rgba(240, 240, 240, 0.35)', fontFamily: "'DM Sans', sans-serif" }}>
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

      <CaveatIsland
        caveats={verdict?.todayCaveats ?? []}
        open={caveatsOpen}
        onClose={() => setCaveatsOpen(false)}
      />
    </>
  )
}
