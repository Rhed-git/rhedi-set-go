import { useState, useEffect, useRef } from 'react'
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

const weekDays = [
  { day: 'Sun', status: 'go',      temp: 74, active: true  },
  { day: 'Mon', status: 'go',      temp: 71, active: false },
  { day: 'Tue', status: 'caution', temp: 68, active: false },
  { day: 'Wed', status: 'nogo',    temp: 61, active: false },
  { day: 'Thu', status: 'nogo',    temp: 58, active: false },
  { day: 'Fri', status: 'caution', temp: 65, active: false },
  { day: 'Sat', status: 'go',      temp: 72, active: false },
]

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
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 300ms ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  if (status === 'go')      return <span style={{ color: '#5a7a3a' }} className="text-lg">✓</span>
  if (status === 'caution') return <span style={{ color: '#c97c2a' }} className="text-lg">!</span>
  return                           <span style={{ color: '#c0392b' }} className="text-lg">✕</span>
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [coords,          setCoords]          = useState(null)
  const [locationName,    setLocationName]    = useState('Locating...')
  const [gpsLocationName, setGpsLocationName] = useState(null)
  const [sheetOpen,       setSheetOpen]       = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) { setLocationName('Location unavailable'); return }

    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        setCoords({ latitude, longitude })
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: NOMINATIM_HEADERS }
          )
          const data = await res.json()
          const addr = data.address ?? {}
          const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? ''
          const abbr = usStateAbbr[addr.state ?? ''] ?? addr.state ?? ''
          const name = city && abbr ? `${city}, ${abbr}` : city || abbr || 'Unknown location'
          setLocationName(name)
          setGpsLocationName(name)
        } catch { setLocationName('Location unavailable') }
      },
      () => setLocationName('Location unavailable'),
      { timeout: 10000 }
    )
  }, [])

  const handleSelectLocation = r => {
    setCoords({ latitude: parseFloat(r.lat), longitude: parseFloat(r.lon) })
    setLocationName(r.label)
  }

  const handleUseGPS = () => {
    if (gpsLocationName) setLocationName(gpsLocationName)
  }

  return (
    <>
      <SplashScreen />

      <div style={{ background: '#f5f2eb', fontFamily: "'DM Sans', sans-serif" }} className="min-h-screen flex justify-center items-start py-10 px-4">
        <div style={{ maxWidth: 430, padding: '28px 22px 40px' }} className="w-full flex flex-col gap-6">

          {/* Header */}
          <header className="flex items-center justify-between">
            <button
              onClick={() => setSheetOpen(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PinIcon color="#5a7a3a" />
              <span style={{ fontSize: 16, fontWeight: 600, color: '#2c2c1e', fontFamily: "'DM Sans', sans-serif" }}>{locationName}</span>
            </button>
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
          </header>

          {/* Verdict card */}
          <div style={{ background: '#2d4a1e', borderRadius: 22, padding: '20px 20px 22px', position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(255,255,255,0.15)',
              color: '#e8f5d0', borderRadius: 999,
              fontSize: 11, fontWeight: 500, padding: '3px 10px',
            }}>
              Sunday · Apr 5
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div style={{
                width: 36, height: 36,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#e8f5d0', fontSize: 18, flexShrink: 0,
              }}>✓</div>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: '#e8f5d0', lineHeight: 1.1 }}>
                  Go ride.
                </div>
                <div style={{ color: '#a8c882', fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
                  Trails dry for 58 hrs. Firm, fast conditions expected today.
                </div>
              </div>
            </div>
          </div>

          {/* Conditions strip */}
          <div style={{ background: '#ffffff', borderRadius: 18, padding: '16px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                { icon: '🌡️', value: '74°F',   label: 'Temp'                },
                { icon: '💧', value: '52%',    label: 'Humidity'            },
                { icon: '🌅', value: '7:51pm', label: 'Sunset'              },
                { icon: '🌿', value: 'Good',   label: 'Air',   green: true  },
              ].map(({ icon, value, label, green }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: green ? '#5a7a3a' : '#2c2c1e' }}>{value}</span>
                  <span style={{ fontSize: 10, color: '#8a8475', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trail tips */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 10, marginTop: 2 }}>
              Trail tips
            </div>
            <div className="flex flex-col gap-2">
              {[
                'Expect firm, fast conditions. Great day for pushing pace on hardpack.',
                'UV index is high. Bring sunscreen and extra water for exposed sections.',
                'Sunset at 7:51pm. Plenty of daylight, no rush on your start time.',
              ].map((tip, i) => (
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
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(({ day, status, temp, active }) => (
                <div key={day} style={{
                  background: active ? '#2d4a1e' : '#ffffff',
                  borderRadius: 14, padding: '12px 4px', textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                }} className="flex flex-col items-center gap-1">
                  <span style={{ fontSize: 10, fontWeight: 500, color: active ? '#a8c882' : '#8a8475', textTransform: 'uppercase' }}>
                    {day}
                  </span>
                  <StatusDot status={status} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#e8f5d0' : '#3a3a2e' }}>
                    {temp}°
                  </span>
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
