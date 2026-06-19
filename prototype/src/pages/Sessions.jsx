import React from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, btn, badge, avatar } from '../design/calm.js';
import { sessions, getMember, fmt, fmtDate } from '../mock/data.js';
import { STATUS_LABELS } from '../design/calm.js';

export default function Sessions() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Kegelabende</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>Alle Abende deines Clubs</p>
        </div>
        <button onClick={() => navigate('/sessions/new')} style={btn('dark', { fontSize: 13 })}>
          + Neuer Abend
        </button>
      </div>

      {/* Pending banner */}
      {sessions.filter(s => s.status === 'submitted').map(s => (
        <div key={s.id} style={{
          background: pal.amberBg, borderRadius: 16, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14,
          border: `1px solid rgba(176,126,42,0.2)`,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: pal.amber, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 13 }}>Einreichung wartet auf deine Freigabe</strong>
            <span style={{ fontSize: 12, color: pal.inkSoft }}>
              {' '}· {fmtDate(s.date)} · {s.recordedByName} · {s.participantCount} Teilnehmer · Σ {fmt(s.totalAmount)}
            </span>
          </div>
          <button onClick={() => navigate(`/sessions/${s.id}`)} style={btn('dark', { fontSize: 11 })}>
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
  const dayLabel = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div
      onClick={() => navigate(`/sessions/${s.id}`)}
      style={{
        ...card({ flexDirection: 'row', alignItems: 'center', gap: 16, cursor: 'pointer', padding: '16px 20px' }),
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Date badge */}
      <div style={{
        background: s.status === 'submitted' ? pal.amberBg : pal.bg,
        borderRadius: 12, padding: '8px 14px', textAlign: 'center', flexShrink: 0,
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: pal.ink, lineHeight: 1 }}>
          {d.getDate().toString().padStart(2, '0')}
        </div>
        <div style={{ fontSize: 10, color: pal.inkDim, marginTop: 2, fontWeight: 600 }}>
          {d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Kegelabend</span>
          <span style={badge(sl.type)}>{sl.label}</span>
        </div>
        <div style={{ fontSize: 12, color: pal.inkSoft, marginTop: 4 }}>
          {s.participantCount} Teilnehmer · erfasst von {s.recordedByName}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: pal.terra }}>
          {fmt(s.totalAmount)}
        </div>
        <div style={{ fontSize: 10, color: pal.inkDim, marginTop: 2 }}>Strafensumme</div>
      </div>

      <span style={{ color: pal.inkDim, fontSize: 16, marginLeft: 4 }}>›</span>
    </div>
  );
}
