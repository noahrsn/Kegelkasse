import React from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, CAR, card, btn, badge } from '../design/calm.js';
import { sessions, fmt, fmtDate } from '../mock/data.js';
import { STATUS_LABELS } from '../design/calm.js';

export default function Sessions() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: `${CAR.py}px ${CAR.px}px`, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: CAR.fontSize.xl, fontWeight: 700, letterSpacing: '-0.02em' }}>Kegelabende</h1>
          <p style={{ fontSize: CAR.fontSize.sm, color: pal.inkSoft, marginTop: 3 }}>Alle Abende deines Clubs</p>
        </div>
        <button onClick={() => navigate('/sessions/new')} style={btn('dark', { fontSize: 14 })}>
          + Neuer Abend
        </button>
      </div>

      {/* Pending banners */}
      {sessions.filter(s => s.status === 'submitted').map(s => (
        <div key={s.id} style={{
          background: pal.amberBg, borderRadius: 16, padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: CAR.gap,
          border: `1px solid rgba(176,126,42,0.2)`,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: pal.amber, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: CAR.fontSize.base }}>Einreichung wartet auf deine Freigabe</strong>
            <div style={{ fontSize: CAR.fontSize.sm, color: pal.inkSoft, marginTop: 2 }}>
              {fmtDate(s.date)} · {s.recordedByName} · {s.participantCount} Teilnehmer · Σ {fmt(s.totalAmount)}
            </div>
          </div>
          <button onClick={() => navigate(`/sessions/${s.id}`)} style={btn('dark', { fontSize: 13, minHeight: 52, padding: '11px 20px' })}>
            Prüfen →
          </button>
        </div>
      ))}

      {/* Session list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sessions.map(s => <SessionCard key={s.id} session={s} navigate={navigate} />)}
      </div>
    </div>
  );
}

function SessionCard({ session: s, navigate }) {
  const sl = STATUS_LABELS[s.status] || STATUS_LABELS.draft;
  const d = new Date(s.date);

  return (
    <div
      onClick={() => navigate(`/sessions/${s.id}`)}
      style={{
        ...card({ flexDirection: 'row', alignItems: 'center', gap: 18, cursor: 'pointer', padding: '18px 22px' }),
        minHeight: CAR.itemMinH,
      }}
    >
      {/* Date badge */}
      <div style={{
        background: s.status === 'submitted' ? pal.amberBg : pal.bg,
        borderRadius: 14, padding: '10px 16px', textAlign: 'center', flexShrink: 0,
        minWidth: 56,
      }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: pal.ink, lineHeight: 1 }}>
          {d.getDate().toString().padStart(2, '0')}
        </div>
        <div style={{ fontSize: 11, color: pal.inkDim, marginTop: 3, fontWeight: 600 }}>
          {d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: CAR.fontSize.base, fontWeight: 600 }}>Kegelabend</span>
          <span style={badge(sl.type)}>{sl.label}</span>
        </div>
        <div style={{ fontSize: CAR.fontSize.sm, color: pal.inkSoft, marginTop: 5 }}>
          {s.participantCount} Teilnehmer · erfasst von {s.recordedByName}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: CAR.fontSize.lg, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: pal.terra }}>
          {fmt(s.totalAmount)}
        </div>
        <div style={{ fontSize: CAR.fontSize.xs, color: pal.inkDim, marginTop: 3 }}>Strafensumme</div>
      </div>

      <span style={{ color: pal.inkDim, fontSize: 20, marginLeft: 4 }}>›</span>
    </div>
  );
}
