import { useState, useEffect } from 'react'

// Splash timing (ms):
// 0 → Send, 600 → with, 1200 → Confidence, 1600 → subtext, 2600 → fade out, 3200 → remove

export default function SplashScreen() {
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
