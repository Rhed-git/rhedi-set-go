// Floating, fully rounded modal. Spring scale-in on open (CSS keyframe in
// index.css), quick ease-out fade on close (transition rule). Overlay tap
// dismisses; tap inside the island stops propagation. No close button.

export default function TrailTipsIsland({ open, tips, onClose }) {
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
