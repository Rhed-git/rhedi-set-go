import './App.css'

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
    <div style={{ background: '#f5f2eb', fontFamily: "'DM Sans', sans-serif" }} className="min-h-screen flex justify-center items-start py-8 px-4">
      <div style={{ maxWidth: 390, padding: '24px 20px 32px' }} className="w-full flex flex-col gap-5">

          {/* 1. Header */}
          <header className="flex items-center justify-between">
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: '#2c2c1e', lineHeight: 1 }}>
              Rhedi<span style={{ color: '#5a7a3a' }}>Set</span>Go
            </h1>
            <div className="flex items-center gap-1" style={{ color: '#2c2c1e', fontSize: 13 }}>
              <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
                <path d="M6.5 0C3.186 0 .5 2.686.5 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6zm0 8.5A2.5 2.5 0 1 1 6.5 3.5 2.5 2.5 0 0 1 6.5 8.5z" fill="#5a7a3a"/>
              </svg>
              <span style={{ fontWeight: 500 }}>Yorktown, VA</span>
            </div>
          </header>

          {/* 2. Sport selector */}
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

          {/* 3. Distance selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 8 }}>
              Distance
            </div>
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
          </div>

          {/* 4. Verdict card */}
          <div style={{ background: '#2d4a1e', borderRadius: 20, padding: '18px 18px 20px', position: 'relative' }}>
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
          <div style={{ background: '#ffffff', borderRadius: 16, padding: '14px 12px' }}>
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
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 8 }}>
              Trail tips
            </div>
            <div className="flex flex-col gap-2">
              {[
                'Expect firm, fast conditions. Great day for pushing pace on hardpack.',
                'UV index is high. Bring sunscreen and extra water for exposed sections.',
                'Sunset at 7:51pm. Plenty of daylight, no rush on your start time.',
              ].map((tip, i) => (
                <div key={i} style={{ background: '#ffffff', borderRadius: 14, padding: '12px 14px' }} className="flex items-start gap-3">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5a7a3a', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 13, color: '#3a3a2e', lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 7. Week strip */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: '#8a8475', textTransform: 'uppercase', marginBottom: 8 }}>
              This week
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(({ day, status, temp, active }) => (
                <div
                  key={day}
                  style={{
                    background: active ? '#2d4a1e' : '#ffffff',
                    borderRadius: 12,
                    padding: '10px 4px',
                    textAlign: 'center',
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
  )
}
