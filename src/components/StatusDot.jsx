export default function StatusDot({ status }) {
  if (status === 'go')      return <span style={{ color: '#4caf6a' }} className="text-lg">✓</span>
  if (status === 'caution') return <span style={{ color: '#e8a020' }} className="text-lg">!</span>
  return                           <span style={{ color: '#e04848' }} className="text-lg">✕</span>
}
