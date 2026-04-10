// Generic floating island. Single instance in App; renders content based on
// `target` ('activity' | 'location' | 'settings' | 'profile' | null).
// Centered floating card over a blurred overlay — not a bottom sheet.
// Spring scale-in on open via the islandSpringIn keyframe; quick ease-out
// fade on close. X button in the header closes; overlay tap also closes.
// No drag handle (drag handles belong to bottom sheets, not islands).

import LocationSearch from './LocationSearch'

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

export default function Sheet({ target, onClose, locationName, gpsCoords, onSelectLocation, onUseGPS }) {
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
