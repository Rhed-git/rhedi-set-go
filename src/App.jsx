import { useState, useEffect } from 'react'
import './App.css'

// Timings (ms)
// 0      — "Rhedi" animates in
// 600    — "Set" animates in
// 1200   — "Go" animates in
// 1600   — slogan fades in  (1200 + 400)
// 2600   — splash fades out (1600 + 1000)
// 3200   — removed from DOM (2600 + 600)

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
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#2d4a1e',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        <span style={wordStyle}>Rhedi</span>
        {showSet  && <span style={wordStyle}>Set</span>}
        {showGo   && <span style={wordStyle}>Go</span>}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 15,
          color: '#f5f2eb',
          opacity: showSlogan ? 0.7 : 0,
          marginTop: 32,
          transition: 'opacity 0.5s ease',
          textAlign: 'center',
        }}
      >
        Less time scrolling, more time rolling.
      </div>
    </div>
  )
}

const weekDays = [
  { day: 'Sun', status: 'go',      temp: 74, active: true  },
  { day: 'Mon', status: 'go',      temp: 71, active: false },
  { day: 'Tue', status: 'caution', temp: 68, active: false },
  { day: 'Wed', status: 'nogo',    temp: 61, active: false },
  { day: 'Thu', status: 'nogo',    temp: 58, active: false },
  { day: 'Fri', status: 'caution', temp: 65, active: false },
  { day: 'Sat', status: 'go',      temp: 72, active: false },
]

function StatusDot({ status }) {
  if (status === 'go')      return <span style={{ color: '#5a7a3a' }} className="text-lg">✓</span>
  if (status === 'caution') return <span style={{ color: '#c97c2a' }} className="text-lg">!</span>
  return                           <span style={{ color: '#c0392b' }} className="text-lg">✕</span>
}

export default function App() {
  return (
    <>
      <SplashScreen />
      <div style={{ background: '#f5f2eb', fontFamily: "'DM Sans', sans-serif" }} className="min-h-screen flex justify-center items-start py-10 px-4">
      <div style={{ maxWidth: 430, padding: '28px 22px 40px' }} className="w-full flex flex-col gap-6">

          {/* 1. Sport selector */}
          <div className="flex gap-2">
            {[
              { label: 'MTB',   active: true  },
              { label: 'Run',   active: false },
              { label: 'Hike',  active: false },
              { label: 'Cycle', active: false },
            ].map(({ label, active }) => (
              <div
                key={label}
                style={{
                  background: active ? '#1e3a5a' : '#d6d0c4',
                  color: active ? '#b5d4f4' : '#8a8475',
                  opacity: active ? 1 : 0.6,
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '6px 14px',
                  flex: 1,
                  textAlign: 'center',
                }}
              >
                {label}
                {!active && <div style={{ fontSize: 9, opacity: 0.8, marginTop: 1 }}>soon</div>}
              </div>
            ))}
          </div>

          {/* 2. Distance selector + Location */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 10 }}>
              Distance
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {[
                  { label: '10 mi', active: false },
                  { label: '25 mi', active: true  },
                  { label: '50 mi', active: false },
                ].map(({ label, active }) => (
                  <div
                    key={label}
                    style={{
                      background: active ? '#1e3a5a' : 'transparent',
                      color: active ? '#b5d4f4' : '#5c5a50',
                      border: active ? 'none' : '1px solid #c8c3b8',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 500,
                      padding: '6px 18px',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1" style={{ color: '#2c2c1e', fontSize: 13 }}>
                <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
                  <path d="M6.5 0C3.186 0 .5 2.686.5 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6zm0 8.5A2.5 2.5 0 1 1 6.5 3.5 2.5 2.5 0 0 1 6.5 8.5z" fill="#5a7a3a"/>
                </svg>
                <span style={{ fontWeight: 500 }}>Yorktown, VA</span>
              </div>
            </div>
          </div>

          {/* 4. Verdict card */}
          <div style={{ background: '#2d4a1e', borderRadius: 22, padding: '20px 20px 22px', position: 'relative', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <div
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'rgba(255,255,255,0.15)',
                color: '#e8f5d0',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                padding: '3px 10px',
              }}
            >
              Sunday · Apr 5
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div style={{
                width: 36, height: 36,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#e8f5d0',
                fontSize: 18,
                flexShrink: 0,
              }}>
                ✓
              </div>
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

          {/* 5. Conditions strip */}
          <div style={{ background: '#ffffff', borderRadius: 18, padding: '16px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                { icon: '🌡️', value: '74°F',   label: 'Temp'       },
                { icon: '💧', value: '52%',    label: 'Humidity'   },
                { icon: '🌅', value: '7:51pm', label: 'Sunset'     },
                { icon: '🌿', value: 'Good',   label: 'Air',       green: true },
              ].map(({ icon, value, label, green }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: green ? '#5a7a3a' : '#2c2c1e' }}>{value}</span>
                  <span style={{ fontSize: 10, color: '#8a8475', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Trail tips */}
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

          {/* 7. Week strip */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 10, marginTop: 2 }}>
              This week
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(({ day, status, temp, active }) => (
                <div
                  key={day}
                  style={{
                    background: active ? '#2d4a1e' : '#ffffff',
                    borderRadius: 14,
                    padding: '12px 4px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                  }}
                  className="flex flex-col items-center gap-1"
                >
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
    </>
  )
}
