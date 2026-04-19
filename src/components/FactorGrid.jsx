import FactorTile from './FactorTile'

export default function FactorGrid({ factors }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 8,
    }}>
      {factors.map(({ key, value, label, severity }) => (
        <FactorTile key={key} value={value} label={label} severity={severity} />
      ))}
    </div>
  )
}
