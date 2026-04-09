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
    color: '#f07820',
    lineHeight: 1.1,
    textAlign: 'left',
    animation: 'slideUpFadeIn 0.5s ease forwards',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#111111',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.6s ease',
      pointerEvents: fading ? 'none' : 'auto',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
          <span style={wordStyle}>Send</span>
          <span style={{ ...wordStyle, ...(showWith       ? {} : { animation: 'none', height: 0, overflow: 'hidden', visibility: 'hidden' }) }}>with</span>
          <span style={{ ...wordStyle, ...(showConfidence ? {} : { animation: 'none', height: 0, overflow: 'hidden', visibility: 'hidden' }) }}>Confidence</span>
        </div>
        <div style={{
          alignSelf: 'flex-end',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 15,
          color: 'rgba(240, 240, 240, 0.45)',
          opacity: showSub ? 1 : 0,
          marginTop: 32,
          transition: 'opacity 0.5s ease',
        }}>
          powered by Rhed
        </div>
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
const SUN_CACHE_KEY     = 'rsg_daily_cache_v6' // v6: expanded hourly fields, index-based UV/wind extraction
const AQI_CACHE_KEY     = 'rsg_aqi_cache_v2'   // v2: expanded to 7 days for per-day AQI
const WEATHER_MAX_AGE   = 30 * 60 * 1000      // 30 min
const AQI_MAX_AGE       = 30 * 60 * 1000      // 30 min
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

// ─── LocationSearch (inline, used inside Location sheet) ─────────────────────

function LocationSearch({ gpsCoords, onSelect, onUseGPS }) {
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
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search city or zip code..."
        style={{
          width: '100%',
          background: '#222222',
          border: '1px solid rgba(240, 240, 240, 0.18)',
          borderRadius: 10,
          padding: '11px 14px',
          fontSize: 14,
          color: '#f0f0f0',
          outline: 'none',
          fontFamily: "'DM Sans', sans-serif",
        }}
      />

      {(results.length > 0 || gpsCoords) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
          background: '#222222',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}>
          {gpsCoords && (
            <button onClick={onUseGPS} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(240, 240, 240, 0.12)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, color: '#f07820', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              <PinIcon color="#f07820" /> Use my location
            </button>
          )}
          {results.map((r, i) => (
            <button key={i} onClick={() => onSelect(r)} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: '12px 14px', cursor: 'pointer',
              borderBottom: i < results.length - 1 ? '1px solid rgba(240, 240, 240, 0.12)' : 'none',
              fontSize: 13, color: '#f0f0f0',
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

// ─── TrailTipsIsland ──────────────────────────────────────────────────────────
// Floating, fully rounded modal. Spring scale-in on open (CSS keyframe in
// index.css), quick ease-out fade on close (transition rule). Overlay tap
// dismisses; tap inside the island stops propagation. No close button.

function TrailTipsIsland({ open, tips, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 180ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1c1c1c',
          borderRadius: 24,
          padding: '22px 22px 24px',
          width: '100%',
          maxWidth: 340,
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
          animation: open ? 'islandSpringIn 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
        }}
      >
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#f0f0f0', lineHeight: 1.1, marginBottom: 14 }}>
          Trail tips
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tips.map((tip, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f07820', flexShrink: 0, marginTop: 7 }} />
              <span style={{ fontSize: 13, color: '#f0f0f0', lineHeight: 1.5 }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── BottomNav ────────────────────────────────────────────────────────────────
// Fixed bottom nav with 4 icon-only buttons. All icons orange #f07820.
// Each button sets `navTarget`, which the Sheet component reads to render
// the matching content slot.

function BikeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f07820" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/>
      <circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M5.5 17.5 L10 9 L17 9"/>
      <path d="M10 9 L13.5 17.5"/>
      <path d="M17 9 L18.5 17.5"/>
      <path d="M14 6 L17 6"/>
    </svg>
  )
}

function LocationPinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f07820" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 C8 2 5 5 5 9 c0 5 7 13 7 13 s7-8 7-13 c0-4-3-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f07820" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f07820" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function BottomNav({ onNavigate }) {
  const buttonStyle = {
    background: 'none',
    border: 'none',
    padding: 10,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: '#111111',
      paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
      paddingTop: 12,
    }}>
      <div style={{ maxWidth: 430, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <button style={buttonStyle} aria-label="Activity" onClick={() => onNavigate('activity')}><BikeIcon /></button>
          <button style={buttonStyle} aria-label="Location" onClick={() => onNavigate('location')}><LocationPinIcon /></button>
          <button style={buttonStyle} aria-label="Settings" onClick={() => onNavigate('settings')}><GearIcon /></button>
          <button style={buttonStyle} aria-label="Profile"  onClick={() => onNavigate('profile')}><ProfileIcon /></button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <div style={{ width: 134, height: 5, borderRadius: 999, background: 'rgba(240, 240, 240, 0.35)' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Sheet ────────────────────────────────────────────────────────────────────
// Generic bottom sheet. Single instance in App; renders content based on
// `target` ('activity' | 'location' | 'settings' | 'profile' | null).
// Drag handle (visual only) + X button close. Overlay tap also closes.
// No Done button. Slide-up translateY animation, 300ms ease.

const SHEET_TITLES = {
  activity: 'Activity',
  location: 'Location',
  settings: 'Settings',
  profile:  'Profile',
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 1 L13 13 M13 1 L1 13" stroke="#f0f0f0" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function SubLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(240, 240, 240, 0.35)', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function PillRow({ items }) {
  return (
    <div className="flex gap-2">
      {items.map(({ label, active, disabled }) => (
        <div key={label} style={{
          background: active ? '#f07820' : '#222222',
          color: active ? '#f0f0f0' : 'rgba(240, 240, 240, 0.35)',
          opacity: disabled ? 0.6 : 1,
          borderRadius: 999,
          fontSize: 13, fontWeight: 500,
          padding: '8px 14px',
          flex: 1, textAlign: 'center',
        }}>
          {label}
          {disabled && <div style={{ fontSize: 9, opacity: 0.8, marginTop: 1 }}>soon</div>}
        </div>
      ))}
    </div>
  )
}

function ActivitySheetContent() {
  return (
    <>
      <SubLabel>Sport</SubLabel>
      <PillRow items={[
        { label: 'MTB',   active: true              },
        { label: 'Run',   active: false, disabled: true },
        { label: 'Hike',  active: false, disabled: true },
        { label: 'Cycle', active: false, disabled: true },
      ]}/>
      <div style={{ height: 22 }} />
      <SubLabel>Distance</SubLabel>
      <PillRow items={[
        { label: '10 mi', active: false },
        { label: '25 mi', active: true  },
        { label: '50 mi', active: false },
      ]}/>
    </>
  )
}

function LocationSheetContent({ locationName, gpsCoords, onSelectLocation, onUseGPS }) {
  return (
    <>
      <div style={{ fontSize: 12, color: 'rgba(240, 240, 240, 0.35)', marginBottom: 10 }}>
        Currently: <span style={{ color: '#f0f0f0' }}>{locationName}</span>
      </div>
      <LocationSearch
        gpsCoords={gpsCoords}
        onSelect={onSelectLocation}
        onUseGPS={onUseGPS}
      />
    </>
  )
}

function PlaceholderContent({ label }) {
  return (
    <div style={{ fontSize: 13, color: 'rgba(240, 240, 240, 0.35)', padding: '12px 0 24px' }}>
      {label} coming soon.
    </div>
  )
}

function Sheet({ target, onClose, locationName, gpsCoords, onSelectLocation, onUseGPS }) {
  const open = target !== null
  const title = target ? SHEET_TITLES[target] : ''

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 180ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1c1c1c',
          borderRadius: 24,
          width: '100%',
          maxWidth: 380,
          minHeight: 260,
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: 24,
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
          animation: open ? 'islandSpringIn 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
        }}
      >
        {/* Header row: title + X — fixed at top */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#f0f0f0', lineHeight: 1.1 }}>
            {title}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <XIcon />
          </button>
        </div>

        {/* Scrollable content area */}
        <div style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          {target === 'activity' && <ActivitySheetContent />}
          {target === 'location' && (
            <LocationSheetContent
              locationName={locationName}
              gpsCoords={gpsCoords}
              onSelectLocation={onSelectLocation}
              onUseGPS={onUseGPS}
            />
          )}
          {target === 'settings' && <PlaceholderContent label="Settings" />}
          {target === 'profile'  && <PlaceholderContent label="Profile" />}
        </div>
      </div>
    </div>
  )
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayAbbr(isoString) {
  return DAY_ABBR[new Date(isoString).getDay()]
}

// Maps Open-Meteo us_aqi (0–500) to US EPA standard labels
function usAqiLabel(val) {
  if (val == null) return null
  if (val <= 50)  return 'Good'
  if (val <= 100) return 'Moderate'
  if (val <= 150) return 'Sensitive'
  if (val <= 200) return 'Unhealthy'
  return 'Very poor'
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
    if (sun.label === 'Sunset')  tips.push(`Sunset at ${sun.value}. Plenty of daylight — no need to rush your start.`)
    else                         tips.push(`Sunrise at ${sun.value}. Early starters get the freshest trail conditions.`)

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

function tileGlow(status) {
  const outer = '0 1px 4px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)'
  if (status === 'Ideal')    return `${outer}, inset 0 0 0 3px rgba(34,197,94,0.5), inset 0 0 24px rgba(34,197,94,0.2)`
  if (status === 'Good')     return `${outer}, inset 0 0 0 3px rgba(134,239,172,0.6), inset 0 0 20px rgba(134,239,172,0.25)`
  if (status === 'Marginal') return `${outer}, inset 0 0 0 3px rgba(251,191,36,0.6), inset 0 0 24px rgba(251,191,36,0.2)`
  if (status === 'Blocking') return `${outer}, inset 0 0 0 3px rgba(239,68,68,0.55), inset 0 0 24px rgba(239,68,68,0.2)`
  return outer // Neutral — plain white tile
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
  // Tomorrow.io provides: current conditions + hourly timeline (temp, humidity, precip, weatherCode).
  // Open-Meteo provides:  7-day daily forecast (tempMax, precip, humidity) + sunrise/sunset.
  const applyData = (weatherRaw, sunRaw, aqiRaw, timestamp) => {
    // --- Tomorrow.io: current conditions + hourly timeline ---
    if (weatherRaw) {
      const timelines = weatherRaw?.data?.timelines ?? []
      const hourly  = timelines.find(t => t.timestep === '1h')
      const cur     = hourly?.intervals?.[0]?.values  ?? {}
      setCurrentTemp(cur.temperature != null ? Math.round(cur.temperature) : null)
      setCurrentHumidity(cur.humidity  != null ? Math.round(cur.humidity)  : null)
      setWeatherCodeNow(cur.weatherCode ?? null)
      setPrecipIntensityNow(cur.precipitationIntensity ?? 0)
      setHourlyIntervals(hourly?.intervals ?? [])  // full hourly timeline for dryout engine
    } else {
      setCurrentTemp(null); setCurrentHumidity(null)
      setHourlyIntervals([])
      setWeatherCodeNow(null); setPrecipIntensityNow(0)
    }

    // --- Open-Meteo AQI: us_aqi for current hour (today) + noon of each day (week) ---
    if (aqiRaw) {
      const hourlyTimes = aqiRaw?.hourly?.time ?? []
      const hourlyAqi   = aqiRaw?.hourly?.us_aqi ?? []
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const localHourStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
      const aqiIdx = hourlyTimes.findIndex(t => t === localHourStr)
      setAirQuality(usAqiLabel(aqiIdx >= 0 ? hourlyAqi[aqiIdx] : hourlyAqi[0] ?? null))
      // Per-day noon AQI for future-day conditions tiles
      const weekLabels = Array.from({ length: 7 }, (_, dayOffset) => {
        const d = new Date()
        d.setDate(d.getDate() + dayOffset)
        const noonStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`
        const nIdx = hourlyTimes.findIndex(t => t === noonStr)
        return usAqiLabel(nIdx >= 0 ? hourlyAqi[nIdx] : null)
      })
      setWeeklyAqiLabels(weekLabels)
    } else {
      setAirQuality(null)
      setWeeklyAqiLabels([])
    }

    // --- Open-Meteo: 7-day daily forecast + sunrise/sunset + hourly UV/wind ---
    if (sunRaw) {
      const d = sunRaw?.daily ?? {}
      const hourlyUV   = sunRaw?.hourly?.uv_index ?? []
      const hourlyWind = sunRaw?.hourly?.wind_speed_10m ?? []
      // Today's current-hour values: hourly array starts at midnight local, so hour index = getHours()
      const curHIdx = new Date().getHours()
      setUvIndexNow(hourlyUV[curHIdx]   ?? null)
      setWindSpeedNow(hourlyWind[curHIdx] ?? null)
      // Build daily intervals in the same {startTime, values} shape the engine expects,
      // using Open-Meteo arrays. Append T12:00:00 so dayAbbr() parses as local noon,
      // avoiding the UTC-midnight off-by-one-day issue with date-only strings.
      // Noon of day i is at hourly index i*24+12 (each day has exactly 24 entries).
      const rawDaily = (d.time ?? []).map((date, i) => {
        const noonIdx = i * 24 + 12
        return {
          startTime: `${date}T12:00:00`,
          values: {
            temperatureMax:            d.temperature_2m_max?.[i]             ?? null,
            precipitationAccumulation: d.precipitation_sum?.[i]              ?? null,
            humidity:                  d.relative_humidity_2m_mean?.[i]      ?? null,
            precipProbability:         d.precipitation_probability_max?.[i]  ?? null,
            uvIndex:                   hourlyUV[noonIdx]                     ?? null,
            windSpeed:                 hourlyWind[noonIdx]                   ?? null,
          },
        }
      }).slice(0, 7)

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
          `https://api.tomorrow.io/v4/timelines?location=${lat},${lon}&fields=temperature,humidity,precipitationAccumulation,precipitationIntensity,weatherCode&units=imperial&timesteps=1h&apikey=${apiKey}`
        ).then(r => r.json())
        writeCache(WEATHER_CACHE_KEY, weatherRaw, lat, lon)
        weatherTimestamp = Date.now()
      } catch {
        weatherRaw = null
      }
    }

    // --- Sun/daily cache (6 hr expiry) ---
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
      } catch {
        sunRaw = null
      }
    }

    // --- AQI cache (30 min; bypassed by force) ---
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
      } catch {
        aqiRaw = null
      }
    }

    applyData(weatherRaw, sunRaw, aqiRaw, weatherTimestamp ?? Date.now())
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
              <div style={{ background: cardBg, borderRadius: 22, padding: '20px 20px 22px', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transition: 'background 0.25s ease' }}>
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
                  color: '#e8f5d0', borderRadius: 999,
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
                    color: '#e8f5d0', fontSize: 18, flexShrink: 0,
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
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: 'rgba(240, 240, 240, 0.35)', fontFamily: "'DM Sans', sans-serif" }}>
                {tick >= 0 && cacheAgeLabel(cacheTimestamp)}
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
