export default function CaveatIsland({ caveats = [], open, onClose }) {
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
          position: 'relative',
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
          animation: open ? 'islandSpringIn 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
        }}
      >
        {/* X button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none',
            color: 'rgba(240, 240, 240, 0.4)',
            fontSize: 18, lineHeight: 1,
            cursor: 'pointer', padding: 4,
          }}
          aria-label="Close"
        >
          &#x2715;
        </button>

        {/* Title */}
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20,
          color: '#f0f0f0',
          lineHeight: 1.1,
        }}>
          Heads-ups
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          color: 'rgba(240, 240, 240, 0.4)',
          marginBottom: 16,
          marginTop: 4,
        }}>
          Worth knowing before you head out
        </div>

        {/* Caveat list */}
        {caveats.map((caveat, i) => (
          <div key={i} style={{
            background: '#0a0a0a',
            borderLeft: '3px solid #e8a020',
            borderRadius: '0 10px 10px 0',
            padding: '12px 14px',
            marginBottom: 8,
          }}>
            <div style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: '#f0f0f0',
              marginBottom: 3,
            }}>
              {caveat.title}
            </div>
            <div style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11.5,
              color: 'rgba(240, 240, 240, 0.55)',
              lineHeight: 1.4,
            }}>
              {caveat.body}
            </div>
          </div>
        ))}

        {/* Reassurance footer */}
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          color: 'rgba(240, 240, 240, 0.3)',
          textAlign: 'center',
          marginTop: 14,
        }}>
          Still a Go ride, just ride smart.
        </div>
      </div>
    </div>
  )
}
