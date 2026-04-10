import { useState, useEffect, useRef } from 'react'
import { PinIcon } from './icons'
import { NOMINATIM_HEADERS, usStateAbbr } from '../lib/geo'

function formatResult(item) {
  const parts = (item.display_name ?? '').split(',').map(s => s.trim())
  const city  = parts[0] ?? ''
  const state = parts.find(p => usStateAbbr[p]) ?? ''
  const abbr  = usStateAbbr[state] ?? state
  return { label: city && abbr ? `${city}, ${abbr}` : parts.slice(0, 2).join(', '), lat: item.lat, lon: item.lon }
}

export default function LocationSearch({ gpsCoords, onSelect, onUseGPS }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (query.length < 3) return
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=us`,
          { headers: NOMINATIM_HEADERS }
        )
        const data = await res.json()
        setResults(data.map(formatResult))
      } catch (err) {
        console.warn('Nominatim search failed', err)
        setResults([])
      }
    }, 350)
    return () => clearTimeout(id)
  }, [query])

  const visibleResults = query.length < 3 ? [] : results

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search city or zip code..."
        style={{
          width: '100%',
          background: '#222222',
          border: '1px solid rgba(240, 240, 240, 0.18)',
          borderRadius: 10,
          padding: '11px 14px',
          fontSize: 14,
          color: '#f0f0f0',
          outline: 'none',
          fontFamily: "'DM Sans', sans-serif",
        }}
      />

      {(visibleResults.length > 0 || gpsCoords) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200,
          background: '#222222',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}>
          {gpsCoords && (
            <button onClick={onUseGPS} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(240, 240, 240, 0.12)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, color: '#f07820', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              <PinIcon color="#f07820" /> Use my location
            </button>
          )}
          {visibleResults.map((r, i) => (
            <button key={i} onClick={() => onSelect(r)} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: '12px 14px', cursor: 'pointer',
              borderBottom: i < visibleResults.length - 1 ? '1px solid rgba(240, 240, 240, 0.12)' : 'none',
              fontSize: 13, color: '#f0f0f0',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
