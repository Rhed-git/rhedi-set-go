// Trail-conditions decision engine.
//
// Pure functions: given weather data + user preferences, returns a binary
// Go / No-Go verdict for today and each of the next 6 days, plus caveats,
// ride window info, and per-day tip strings. No React, no DOM, no fetch --
// only Date/Math arithmetic and a localStorage read for stored preferences.

// ─── Preferences framework ────────────────────────────────────────────────────
// Default values produce identical behavior to the original engine — nothing
// changes until the user explicitly updates a preference.

export const PREFS_STORAGE_KEY = 'rsg_user_preferences'

export const defaultPreferences = {
  preferredRideTime: null,   // null = no preference | 0-23 = hour of day (e.g. 7 = 7am)
  riskTolerance: 'cautious', // 'cautious' (strictest) | 'moderate' | 'aggressive'
  soilType: 'auto',          // 'auto' (1.0x) | 'sandy' (0.7x) | 'clay' (1.4x) | 'loam' (1.0x)
}

// Returns merged preferences from localStorage + defaults.
// The Settings island UI will call this when it renders.
export function getPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? 'null')
    return saved ? { ...defaultPreferences, ...saved } : { ...defaultPreferences }
  } catch {
    return { ...defaultPreferences }
  }
}

// ─── Decision Engine ──────────────────────────────────────────────────────────

// Tomorrow.io weather codes that indicate active precipitation
const RAIN_CODES = new Set([4000, 4001, 4200, 4201, 6000, 6001, 6200, 6201, 8000])

// computeVerdict({
//   dailyIntervals,      // 7 entries: { startTime, values: { precipitationAccumulation, temperatureMax, humidity, ... } }
//   hourlyIntervals,     // ~120 entries: { startTime, values: { precipitationAccumulation, precipitationIntensity } }
//   currentTemp,         // °F | null
//   currentHumidity,     // %  | null
//   weatherCodeNow,      // Tomorrow.io code | null
//   precipIntensityNow,  // in/hr
//   sun,                 // { label: 'Sunset' | 'Sunrise' | ..., value: '7:42pm', ... } -- precomputed by caller
//   sunTimes,            // [{ sunrise: ISO, sunset: ISO }, ...] -- raw per-day sun data from Open-Meteo
//   preferences,         // { preferredRideTime, riskTolerance, soilType }
// })
// -> { todayVerdict, todayReason, todayCaveats, hoursUntilSunset, rideWindowEnd,
//      weekVerdicts, weekReasons, weekDryStreakHrs, weekTips, tips }
export function computeVerdict({
  dailyIntervals,
  hourlyIntervals,     // full hourly timeline from the API
  currentTemp,
  currentHumidity,
  weatherCodeNow,
  precipIntensityNow,
  sun,
  sunTimes,            // raw per-day sunrise/sunset ISO strings
  windSpeedNow,        // current wind speed in mph | null
  preferences,         // userPreferences object
}) {
  const now = new Date()
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0)

  // ── Sunrise / sunset computation ─────────────────────────────────────────
  const todaySun = (sunTimes ?? [])[0] ?? null
  const sunrise  = todaySun?.sunrise ? new Date(todaySun.sunrise) : null
  const sunset   = todaySun?.sunset  ? new Date(todaySun.sunset)  : null

  // hoursUntilSunset: positive when sun is still up, negative after sunset
  const hoursUntilSunset = sunset ? (sunset.getTime() - now.getTime()) / 3600000 : null

  // rideWindowEnd: today's sunset formatted as "7:42 PM"
  const rideWindowEnd = sunset
    ? sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null

  // Strict daylight gate: outside sunrise-to-sunset is an automatic No-Go.
  const beforeSunrise = sunrise && now < sunrise
  const afterSunset   = sunset  && now >= sunset

  // ── [PREF: riskTolerance] derive thresholds ──────────────────────────────
  // 'cautious' preserves original thresholds exactly.
  // 'moderate' and 'aggressive' relax them so the rider sees more green windows.
  //
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
  const dryoutPercent = dryoutHoursNeeded > 0
    ? Math.min(100, Math.round((1 - dryoutHoursRemaining / dryoutHoursNeeded) * 100))
    : 100

  // --- Extract per-day precipitation from daily intervals ---
  const weekPrecip  = dailyIntervals.map(d => d?.values?.precipitationAccumulation ?? 0)
  const precipToday = weekPrecip[0] ?? 0  // daily total (includes rain still forecasted today)

  // --- Today's verdict — binary Go / No-Go with caveats ---
  let todayVerdict = 'go'
  let todayReason  = ''
  const todayCaveats = []

  // 0. Strict daylight gate — outside sunrise-to-sunset is automatic No-Go
  if (afterSunset) {
    todayVerdict = 'nogo'
    todayReason  = 'Sun has set.'
  } else if (beforeSunrise) {
    todayVerdict = 'nogo'
    todayReason  = 'Sun has not risen yet.'
  }
  // 1. Frozen
  else if (currentTemp != null && currentTemp < 32) {
    todayVerdict = 'nogo'
    todayReason  = `Frozen at ${currentTemp}°F. Wait for temps to rise above freezing before riding.`
  }
  // 2. Actively raining right now
  else if (precipIntensityNow > 0.1 || RAIN_CODES.has(weatherCodeNow)) {
    todayVerdict = 'nogo'
    todayReason  = 'Rain falling right now. Riding will damage wet trails.'
  }
  // 3. Rain already fallen today — dryout check using rainfallAlreadyToday
  // [Bug fix] No minimum threshold gate: even small amounts start the dryout clock
  // so partial dryout is properly tracked.
  else if (rainfallAlreadyToday > 0) {
    const cautionStart = dryoutHoursNeeded * dryoutCautionFraction
    if (hoursElapsed < cautionStart) {
      todayVerdict = 'nogo'
      const hoursLeft = Math.ceil(dryoutHoursRemaining)
      todayReason = `${rainfallAlreadyToday.toFixed(2)}" of rain fell today. Trails need ~${hoursLeft} more hours to dry.`
    } else if (dryoutHoursRemaining > 0) {
      // Marginal dryout: Go with caveat instead of old Caution verdict
      todayVerdict = 'go'
      todayCaveats.push({
        title: 'Trails dried recently',
        body: `${rainfallAlreadyToday.toFixed(2)}" of rain today. Trails may be soft in spots. Ride with care and avoid low-lying areas.`,
      })
    }
    // else dryout complete — falls through to GO
  }
  // 4. Significant rain still forecasted today
  else if (precipToday > 0.1) {
    todayVerdict = 'nogo'
    todayReason  = `${precipToday.toFixed(2)}" of rain in today's forecast. Trails won't be rideable.`
  }
  // 5. Light rain in forecast (trace amounts) — caveat instead of old Caution
  else if (precipToday >= 0.05 && preferences.riskTolerance !== 'aggressive') {
    todayVerdict = 'go'
    todayCaveats.push({
      title: 'Light rain ahead',
      body: `Light rain (${precipToday.toFixed(2)}") in today's forecast. Conditions may soften later in the day.`,
    })
  }

  // 6. High humidity caveat
  if (todayVerdict === 'go' && currentHumidity != null && currentHumidity > 70) {
    todayCaveats.push({
      title: 'Humidity is high',
      body: `Humidity at ${currentHumidity}%. Trails may feel tacky or slow in low-lying areas.`,
    })
  }

  // 6b. Rising wind caveat
  if (todayVerdict === 'go' && windSpeedNow != null && windSpeedNow > 15) {
    todayCaveats.push({
      title: 'Wind picking up',
      body: `Wind at ${Math.round(windSpeedNow)} mph. Expect resistance on exposed sections and possible debris on trail.`,
    })
  }

  // 6c. High temperature caveat
  if (todayVerdict === 'go' && currentTemp != null && currentTemp >= 85) {
    todayCaveats.push({
      title: 'Heat advisory',
      body: `Temperature at ${currentTemp}°F. Bring extra water and plan for shaded rest stops.`,
    })
  }

  // 7. GO -- build a descriptive reason (only if no reason set yet)
  if (todayVerdict === 'go' && !todayReason) {
    if (currentTemp != null && currentHumidity != null) {
      if (currentHumidity < 50) {
        todayReason = `${currentTemp}°F and ${currentHumidity}% humidity. Dry, firm trails.`
      } else {
        todayReason = `${currentTemp}°F with no rain in forecast. Trails look solid.`
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
        // Rain expected at preferred ride time — caveat instead of old Caution
        todayCaveats.push({
          title: 'Rain at ride time',
          body: `Rain expected at your preferred ride time (${prefLabel}). Consider riding earlier or later.`,
        })
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

    if (fractionRemaining > 0.25) return { // >25% of dryout still needed
      verdict: 'nogo',
      reason:  `Trails still drying from earlier rain (~${Math.ceil(hoursRemainingAt6am)} hrs needed by 6am).`,
      dryStreakHrs,
    }
    if (fractionRemaining > 0) return {    // <25% -- nearly dry, map to Go (was Caution)
      verdict: 'go',
      reason:  'Nearly dry from earlier rain. Soft spots may linger in shaded sections.',
      dryStreakHrs,
    }

    // Carryover fully elapsed -- evaluate this day's own forecast
    if (precip > 0.1) return {
      verdict: 'nogo',
      reason:  `${precip.toFixed(2)}" of rain in the forecast. Trails won't be rideable.`,
      dryStreakHrs,
    }
    // Light rain: map to Go (was Caution)
    if (precip >= 0.05 && preferences.riskTolerance !== 'aggressive') return {
      verdict: 'go',
      reason:  `Light rain (${precip.toFixed(2)}") in the forecast. Conditions may soften.`,
      dryStreakHrs,
    }

    // [PREF: preferredRideTime] check hourly data for preferred hour on this future day
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
        if (rainAtRideTime) return { // rain at preferred hour -- Go (was Caution)
          verdict: 'go',
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
    if (sun.label === 'Sunset')  tips.push(`Sunset at ${sun.value}. Plenty of daylight — no need to rush your start.`)
    else                         tips.push(`Sunrise at ${sun.value}. Early starters get the freshest trail conditions.`)

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

  return {
    todayVerdict, todayReason, todayCaveats,
    hoursUntilSunset, rideWindowEnd, dryoutPercent,
    weekVerdicts, weekReasons, weekDryStreakHrs, weekTips, tips,
  }
}

// ─── Factor Tiles ────────────────────────────────────────────────────────────
// Pure function that produces the fixed 6-tile data set for the factor grid.
// Each factor is { key, value, label, severity } where severity is
// 'good' | 'warn' | 'bad'.

export function buildFactors({
  dryoutPercent,       // 0-100, how far along dryout is (100 = fully dry)
  precipToday,         // inches of precip in today's daily forecast
  currentTemp,         // °F | null
  currentHumidity,     // % | null
  airQuality,          // numeric AQI 0-500 | null
  sunriseTime,         // formatted string like "6:32 AM" | null
  sunsetTime,          // formatted string like "7:42 PM" | null
  hoursUntilSunset,    // float | null
}) {
  // 1. Trail moisture
  let moistureValue, moistureSeverity
  if (dryoutPercent == null) {
    moistureValue = '--'; moistureSeverity = 'good'
  } else if (dryoutPercent >= 95) {
    moistureValue = 'Dry'; moistureSeverity = 'good'
  } else if (dryoutPercent >= 75) {
    moistureValue = 'Drying'; moistureSeverity = 'warn'
  } else if (dryoutPercent >= 40) {
    moistureValue = 'Moist'; moistureSeverity = 'warn'
  } else {
    moistureValue = 'Wet'; moistureSeverity = 'bad'
  }

  // 2. Forecast
  let forecastValue, forecastSeverity
  if (precipToday == null || precipToday === 0) {
    forecastValue = 'Clear'; forecastSeverity = 'good'
  } else if (precipToday < 0.1) {
    forecastValue = 'Light rain'; forecastSeverity = 'warn'
  } else if (precipToday <= 0.5) {
    forecastValue = 'Rain'; forecastSeverity = 'bad'
  } else {
    forecastValue = 'Heavy rain'; forecastSeverity = 'bad'
  }

  // 3. Temperature
  let tempValue = currentTemp != null ? `${currentTemp}\u00B0F` : '--'
  let tempSeverity = 'good'
  if (currentTemp == null) {
    tempSeverity = 'good'
  } else if (currentTemp < 32 || currentTemp > 95) {
    tempSeverity = 'bad'
  } else if (currentTemp < 45 || currentTemp > 85) {
    tempSeverity = 'warn'
  }

  // 4. Humidity
  let humidityValue = currentHumidity != null ? `${currentHumidity}%` : '--'
  let humiditySeverity = 'good'
  if (currentHumidity == null) {
    humiditySeverity = 'good'
  } else if (currentHumidity > 85) {
    humiditySeverity = 'bad'
  } else if (currentHumidity > 70) {
    humiditySeverity = 'warn'
  }

  // 5. Air quality
  let aqiValue, aqiSeverity
  if (airQuality == null) {
    aqiValue = '--'; aqiSeverity = 'good'
  } else if (airQuality <= 50) {
    aqiValue = 'Good'; aqiSeverity = 'good'
  } else if (airQuality <= 100) {
    aqiValue = 'Fair'; aqiSeverity = 'warn'
  } else if (airQuality <= 150) {
    aqiValue = 'Poor'; aqiSeverity = 'bad'
  } else {
    aqiValue = 'Unhealthy'; aqiSeverity = 'bad'
  }

  // 6. Sunrise / Sunset (flips based on time of day)
  // Before solar noon: show sunrise. After solar noon: show sunset.
  const now = new Date()
  const solarNoon = new Date(now)
  solarNoon.setHours(12, 0, 0, 0)
  const beforeNoon = now < solarNoon

  let sunValue, sunLabel, sunSeverity
  if (beforeNoon) {
    sunValue = sunriseTime ?? '--'
    sunLabel = 'Sunrise'
  } else {
    sunValue = sunsetTime ?? '--'
    sunLabel = 'Sunset'
  }
  if (hoursUntilSunset == null) {
    sunSeverity = 'good'
  } else if (hoursUntilSunset <= 0) {
    sunSeverity = 'bad'
  } else if (hoursUntilSunset <= 3) {
    sunSeverity = 'warn'
  } else {
    sunSeverity = 'good'
  }

  return [
    { key: 'trailMoisture', value: moistureValue, label: 'Trail moisture', severity: moistureSeverity },
    { key: 'forecast',      value: forecastValue,  label: 'Forecast',       severity: forecastSeverity },
    { key: 'temperature',   value: tempValue,      label: 'Temperature',    severity: tempSeverity },
    { key: 'humidity',      value: humidityValue,   label: 'Humidity',       severity: humiditySeverity },
    { key: 'airQuality',    value: aqiValue,        label: 'Air quality',    severity: aqiSeverity },
    { key: 'sun',           value: sunValue,        label: sunLabel,         severity: sunSeverity },
  ]
}
