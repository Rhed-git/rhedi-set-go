export default function VerdictCard({
  verdict,
  reason,
  caveats = [],
  hoursUntilSunset,
  rideWindowEnd,
  label,
  loading,
  onCaveatsClick,
}) {
  const isGo = verdict !== 'nogo'
  const cardBg = isGo ? '#2d4a1e' : '#5c1a1a'

  // Ride window line visibility
  const showRideWindowGo =
    isGo && hoursUntilSunset != null && hoursUntilSunset > 0 && hoursUntilSunset <= 3
  const showRideWindowNogo =
    !isGo && typeof reason === 'string' && reason.startsWith('Sun has')
  const showRideWindow = showRideWindowGo || showRideWindowNogo

  const rideWindowBg = isGo
    ? 'rgba(76,175,106,0.12)'
    : 'rgba(224,72,72,0.12)'
  const rideWindowBorder = isGo
    ? 'rgba(76,175,106,0.25)'
    : 'rgba(224,72,72,0.25)'
  const rideWindowText = showRideWindowGo
    ? `Ride window: now until ${rideWindowEnd}`
    : `Sunset was at ${rideWindowEnd}`

  return (
    <div style={{
      background: cardBg,
      borderRadius: 20,
      padding: '22px 18px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'background 0.25s ease',
    }}>
      {/* Date pill */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        background: 'rgba(255,255,255,0.15)',
        color: '#f0f0f0', borderRadius: 999,
        fontSize: 11, fontWeight: 500, padding: '3px 10px',
      }}>
        {label}
      </div>

      {/* Caveat chip -- in-flow, right-aligned, only on Go verdicts with active caveats */}
      {isGo && caveats.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28, marginBottom: 8 }}>
          <button
            onClick={onCaveatsClick}
            style={{
              background: '#7a4a15',
              color: '#f5d4a0',
              border: 'none',
              borderRadius: 999,
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span style={{
              width: 6, height: 6,
              borderRadius: '50%',
              background: '#e8a020',
              flexShrink: 0,
            }} />
            Heads-up ({caveats.length})
          </button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 32,
          color: '#f0f0f0',
          lineHeight: 1.1,
        }}>
          {isGo ? 'Go ride.' : "Don't ride."}
        </div>
        <div style={{
          color: 'rgba(240, 240, 240, 0.70)',
          fontSize: 13,
          lineHeight: 1.4,
          fontFamily: "'DM Sans', sans-serif",
          marginTop: 6,
        }}>
          {reason ?? (loading ? 'Loading conditions\u2026' : 'Checking trail conditions\u2026')}
        </div>

        {/* Ride window line */}
        {showRideWindow && rideWindowEnd && (
          <div style={{
            background: rideWindowBg,
            border: `1px solid ${rideWindowBorder}`,
            borderRadius: 10,
            padding: '10px 12px',
            marginTop: 12,
            fontSize: 11.5,
            color: '#f0f0f0',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {rideWindowText}
          </div>
        )}
      </div>
    </div>
  )
}
