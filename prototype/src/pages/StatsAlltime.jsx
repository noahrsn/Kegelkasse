import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, btn, avatar } from '../design/calm.js';
import { alltimeStats, getMember, fmt } from '../mock/data.js';

const COLS = [
  { id: 'totalPaid',     label: 'Gesamtbezahlt',  format: v => fmt(v), color: pal.terra },
  { id: 'totalPenalties', label: 'Strafen',         format: v => v.toString(), color: pal.amber },
  { id: 'pudel',         label: 'Pudel',            format: v => v.toString(), color: pal.navy },
  { id: 'attendance',    label: 'Anwesenheit',      format: v => `${Math.round(v * 100)} %`, color: pal.sage },
];

export default function StatsAlltime() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('totalPaid');
  const sorted = [...alltimeStats].sort((a, b) => {
    if (sortBy === 'attendance') return b[sortBy] - a[sortBy];
    return b[sortBy] - a[sortBy];
  });
  const max = sorted.reduce((acc, s) => {
    COLS.forEach(c => { if (s[c.id] > (acc[c.id] || 0)) acc[c.id] = s[c.id]; });
    return acc;
  }, {});

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/stats')} style={btn('ghost', { fontSize: 12, padding: '7px 12px' })}>← Zurück</button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Ewige Tabelle</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 2 }}>Historisches Gesamtranking seit Clubgründung</p>
        </div>
      </div>

      {/* Sort by */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {COLS.map(c => (
          <button
            key={c.id}
            onClick={() => setSortBy(c.id)}
            style={{
              padding: '7px 14px', borderRadius: 100,
              background: sortBy === c.id ? pal.ink : pal.card,
              color: sortBy === c.id ? pal.bg : pal.inkSoft,
              border: `1px solid ${sortBy === c.id ? pal.ink : pal.cardEdge}`,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >{c.label}</button>
        ))}
      </div>

      <div style={card({ gap: 0, padding: 0, overflow: 'hidden' })}>
        {sorted.map((s, rank) => {
          const m = getMember(s.userId);
          if (!m) return null;
          const col = COLS.find(c => c.id === sortBy);
          const pct = col ? s[sortBy] / max[sortBy] : 0;
          const medals = ['🥇', '🥈', '🥉'];

          return (
            <div key={s.userId} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
              borderBottom: rank < sorted.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
              background: rank < 3 ? `${pal.amberBg}44` : 'transparent',
            }}>
              <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>
                {rank < 3 ? medals[rank] : <span style={{ fontSize: 13, fontWeight: 700, color: pal.inkDim }}>{rank + 1}</span>}
              </span>

              <div style={{ ...avatar(m.color, 36), fontSize: 12 }}>{m.initials}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{m.firstName} {m.lastName}</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 5 }}>
                  {COLS.map(c => (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 9, color: pal.inkDim, fontWeight: 700, letterSpacing: '0.04em' }}>{c.label.toUpperCase()}</span>
                      <span style={{ fontSize: 12, fontWeight: sortBy === c.id ? 700 : 500, color: sortBy === c.id ? c.color : pal.inkSoft }}>
                        {c.format(s[c.id])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {col && (
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ height: 6, borderRadius: 3, background: pal.bg, overflow: 'hidden' }}>
                    <div style={{ width: `${pct * 100}%`, height: '100%', background: col.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: col.color, marginTop: 3, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {col.format(s[sortBy])}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
