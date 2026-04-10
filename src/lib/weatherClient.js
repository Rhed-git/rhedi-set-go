// Weather data client.
//
// Fetches Tomorrow.io (current + hourly) and Open-Meteo (daily/sun + AQI) for a
// given coordinate, respecting the lat/lon-keyed cache in lib/cache, and parses
// the raw responses into the normalized shape the rest of the app consumes.

import {
  WEATHER_CACHE_KEY, SUN_CACHE_KEY, AQI_CACHE_KEY,
  WEATHER_MAX_AGE, SUN_MAX_AGE, AQI_MAX_AGE,
  readCache, writeCache, cacheIsValid,
} from './cache'

// Maps Open-Meteo us_aqi (0–500) to US EPA standard labels
function usAqiLabel(val) {
  if (val == null) return null
  if (val <= 50)  return 'Good'
  if (val <= 100) return 'Moderate'
  if (val <= 150) return 'Sensitive'
  if (val <= 200) return 'Unhealthy'
  return 'Very poor'
}

// Parses Tomorrow.io /v4/timelines response → normalized current+hourly object.
// Returns null if response is missing/malformed.
function parseTomorrowWeather(raw) {
  if (!raw) return null
  const timelines = raw?.data?.timelines ?? []
  const hourly = timelines.find(t => t.timestep === '1h')
  const cur    = hourly?.intervals?.[0]?.values ?? {}
  return {
    currentTemp:        cur.temperature != null ? Math.round(cur.temperature) : null,
    currentHumidity:    cur.humidity    != null ? Math.round(cur.humidity)    : null,
    weatherCodeNow:     cur.weatherCode ?? null,
    precipIntensityNow: cur.precipitationIntensity ?? 0,
    hourlyIntervals:    hourly?.intervals ?? [],
  }
}

// Parses Open-Meteo /v1/forecast response → daily intervals + sun times +
// current UV/wind. Builds dailyIntervals in the same {startTime, values} shape
// the verdict engine expects, appending T12:00:00 to date strings so the day
// parses as local noon (avoids UTC-midnight off-by-one-day).
function parseOpenMeteoSun(raw) {
  if (!raw) return null
  const d = raw?.daily ?? {}
  const hourlyUV   = raw?.hourly?.uv_index ?? []
  const hourlyWind = raw?.hourly?.wind_speed_10m ?? []
  // Today's current-hour values: hourly array starts at midnight local, so hour index = getHours()
  const curHIdx = new Date().getHours()
  // Noon of day i is at hourly index i*24+12 (each day has exactly 24 entries).
  const dailyIntervals = (d.time ?? []).map((date, i) => {
    const noonIdx = i * 24 + 12
    return {
      startTime: `${date}T12:00:00`,
      values: {
        temperatureMax:            d.temperature_2m_max?.[i]            ?? null,
        precipitationAccumulation: d.precipitation_sum?.[i]             ?? null,
        humidity:                  d.relative_humidity_2m_mean?.[i]     ?? null,
        precipProbability:         d.precipitation_probability_max?.[i] ?? null,
        uvIndex:                   hourlyUV[noonIdx]                    ?? null,
        windSpeed:                 hourlyWind[noonIdx]                  ?? null,
      },
    }
  }).slice(0, 7)
  return {
    dailyIntervals,
    sunTimes:     (d.sunrise ?? []).map((rise, i) => ({ sunrise: rise, sunset: d.sunset?.[i] })),
    uvIndexNow:   hourlyUV[curHIdx]   ?? null,
    windSpeedNow: hourlyWind[curHIdx] ?? null,
  }
}

// Parses Open-Meteo /v1/air-quality response → current AQI label + per-day noon
// AQI labels for the 7-day strip.
function parseOpenMeteoAqi(raw) {
  if (!raw) return null
  const hourlyTimes = raw?.hourly?.time ?? []
  const hourlyAqi   = raw?.hourly?.us_aqi ?? []
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const localHourStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
  const aqiIdx = hourlyTimes.findIndex(t => t === localHourStr)
  const airQuality = usAqiLabel(aqiIdx >= 0 ? hourlyAqi[aqiIdx] : hourlyAqi[0] ?? null)
  // Per-day noon AQI for future-day conditions tiles
  const weeklyAqiLabels = Array.from({ length: 7 }, (_, dayOffset) => {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    const noonStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`
    const nIdx = hourlyTimes.findIndex(t => t === noonStr)
    return usAqiLabel(nIdx >= 0 ? hourlyAqi[nIdx] : null)
  })
  return { airQuality, weeklyAqiLabels }
}

// Fetches all three weather sources for a coordinate, respecting the cache.
// Returns parsed/normalized bundles (or nulls if a fetch failed). The `force`
// flag bypasses the weather + AQI caches (the 6-hour sun cache is always honored
// — manual refresh shouldn't hammer the API for daily data that rarely changes).
//
// Options:
//   - apiKey:              Tomorrow.io API key (caller passes from import.meta.env)
//   - force:               bypass weather + AQI caches (default false)
//   - onWeatherFetchStart: callback fired when about to hit Tomorrow.io (loading UX)
export async function fetchWeatherBundle(lat, lon, { apiKey, force = false, onWeatherFetchStart } = {}) {
  // --- Weather (Tomorrow.io) ---
  const weatherEntry = readCache(WEATHER_CACHE_KEY)
  let weatherRaw = null
  let weatherTimestamp = null

  if (!force && cacheIsValid(weatherEntry, WEATHER_MAX_AGE, lat, lon)) {
    weatherRaw       = weatherEntry.data
    weatherTimestamp = weatherEntry.timestamp
  } else {
    onWeatherFetchStart?.()
    try {
      weatherRaw = await fetch(
        `https://api.tomorrow.io/v4/timelines?location=${lat},${lon}&fields=temperature,humidity,precipitationAccumulation,precipitationIntensity,weatherCode&units=imperial&timesteps=1h&apikey=${apiKey}`
      ).then(r => r.json())
      writeCache(WEATHER_CACHE_KEY, weatherRaw, lat, lon)
      weatherTimestamp = Date.now()
    } catch (err) {
      console.warn('Tomorrow.io weather fetch failed', err)
      weatherRaw = null
    }
  }

  // --- Sun/daily (Open-Meteo, 6 hr cache) ---
  const sunEntry = readCache(SUN_CACHE_KEY)
  let sunRaw = null

  if (cacheIsValid(sunEntry, SUN_MAX_AGE, lat, lon)) {
    sunRaw = sunEntry.data
  } else {
    try {
      sunRaw = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset,temperature_2m_max,precipitation_sum,relative_humidity_2m_mean,precipitation_probability_max&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,uv_index,weathercode&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`
      ).then(r => r.json())
      writeCache(SUN_CACHE_KEY, sunRaw, lat, lon)
    } catch (err) {
      console.warn('Open-Meteo forecast fetch failed', err)
      sunRaw = null
    }
  }

  // --- AQI (Open-Meteo, 30 min cache; bypassed by force) ---
  const aqiEntry = readCache(AQI_CACHE_KEY)
  let aqiRaw = null

  if (!force && cacheIsValid(aqiEntry, AQI_MAX_AGE, lat, lon)) {
    aqiRaw = aqiEntry.data
  } else {
    try {
      aqiRaw = await fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi&timezone=auto&forecast_days=7`
      ).then(r => r.json())
      writeCache(AQI_CACHE_KEY, aqiRaw, lat, lon)
    } catch (err) {
      console.warn('Open-Meteo air-quality fetch failed', err)
      aqiRaw = null
    }
  }

  return {
    weather:   parseTomorrowWeather(weatherRaw),
    sun:       parseOpenMeteoSun(sunRaw),
    aqi:       parseOpenMeteoAqi(aqiRaw),
    timestamp: weatherTimestamp ?? Date.now(),
  }
}
