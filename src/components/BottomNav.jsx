// Fixed bottom nav with 4 icon-only buttons. All icons orange #f07820.
// Each button calls onNavigate('activity' | 'location' | 'settings' | 'profile'),
// which the parent uses to open the matching Sheet content slot.

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

export default function BottomNav({ onNavigate }) {
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
