const SEVERITY_RGB = {
  good: '76,175,106',
  warn: '232,160,32',
  bad:  '224,72,72',
}

const SEVERITY_DOT = {
  good: '#4caf6a',
  warn: '#e8a020',
  bad:  '#e04848',
}

export default function FactorTile({ value, label, severity }) {
  const rgb = SEVERITY_RGB[severity] ?? SEVERITY_RGB.good
  const dotColor = SEVERITY_DOT[severity] ?? SEVERITY_DOT.good
  const fontSize = value && value.length > 6 ? 16 : 20

  return (
    <div style={{
      height: 96,
      background: '#1c1c1c',
      borderRadius: 14,
      padding: '12px 10px',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: `inset 0 0 0 1px rgba(${rgb}, 0.4), 0 0 12px 0 rgba(${rgb}, 0.15)`,
    }}>
      {/* Severity dot */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dotColor,
      }} />

      {/* Value -- top zone */}
      <div style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize,
        lineHeight: 1.1,
        color: '#f0f0f0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value ?? '--'}
      </div>

      {/* Label -- bottom zone */}
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 10.5,
        color: 'rgba(240, 240, 240, 0.4)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </div>
    </div>
  )
}
