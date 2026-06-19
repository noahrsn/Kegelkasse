import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, colorCard, btn, badge, avatar } from '../design/calm.js';
import { events, members, fmtDate } from '../mock/data.js';

const TYPE_LABELS = { single: 'Einmalig', recurring: 'Wiederkehrend', multi_day: 'Mehrtägig' };

export default function Calendar() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Termine</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>{events.length} bevorstehende Events</p>
        </div>
        <button onClick={() => navigate('/calendar/new')} style={btn('dark', { fontSize: 12 })}>+ Termin anlegen</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {events.map(ev => <EventCard key={ev.id} event={ev} navigate={navigate} />)}
      </div>
    </div>
  );
}

function EventCard({ event: ev, navigate }) {
  const d = new Date(ev.date);
  const daysUntil = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
  const rsvpBg = ev.myStatus === 'attending' ? pal.sageBg : ev.myStatus === 'declined' ? pal.terraBg : pal.amberBg;
  const rsvpColor = ev.myStatus === 'attending' ? pal.sage : ev.myStatus === 'declined' ? pal.terra : pal.amber;
  const rsvpLabel = ev.myStatus === 'attending' ? '✓ Zugesagt' : ev.myStatus === 'declined' ? '✗ Abgesagt' : '? Ausstehend';

  return (
    <div
      onClick={() => navigate(`/calendar/${ev.id}`)}
      style={{
        ...card({ flexDirection: 'row', gap: 18, cursor: 'pointer', padding: '18px 20px', alignItems: 'flex-start' }),
        transition: 'box-shadow 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Date block */}
      <div style={{
        background: ev.type === 'multi_day' ? pal.navyBg : pal.bg,
        borderRadius: 14, padding: '10px 16px', textAlign: 'center', flexShrink: 0, minWidth: 64,
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: pal.ink, lineHeight: 1 }}>
          {d.getDate()}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: pal.inkDim, marginTop: 2 }}>
          {d.toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
        </div>
        {daysUntil > 0 && daysUntil <= 30 && (
          <div style={{ fontSize: 10, color: pal.terra, fontWeight: 600, marginTop: 4 }}>
            in {daysUntil}d
          </div>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{ev.title}</h3>
          <span style={badge(ev.type === 'recurring' ? 'navy' : ev.type === 'multi_day' ? 'amber' : 'cream', { fontSize: 10 })}>
            {TYPE_LABELS[ev.type]}
          </span>
        </div>

        <div style={{ fontSize: 12, color: pal.inkSoft, marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>🕐 {ev.time} Uhr</span>
          <span>📍 {ev.location}</span>
          {ev.endDate && <span>bis {fmtDate(ev.endDate)}</span>}
        </div>

        {/* RSVP bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <div style={{ display: 'flex' }}>
            {members.slice(0, ev.rsvp.attending).slice(0, 5).map((m, i) => (
              <div key={m.id} style={{
                ...avatar(m.color, 22),
                marginLeft: i > 0 ? -7 : 0,
                border: `2px solid ${pal.card}`,
                fontSize: 8,
              }}>{m.initials}</div>
            ))}
          </div>
          <span style={{ fontSize: 11, color: pal.inkSoft }}>
            {ev.rsvp.attending} zugesagt · {ev.rsvp.declined} abgesagt · {ev.rsvp.pending} offen
          </span>
          <span style={{ marginLeft: 'auto', ...badge('cream'), background: rsvpBg, color: rsvpColor, fontSize: 10 }}>
            {rsvpLabel}
          </span>
        </div>

        {/* RSVP deadline */}
        <div style={{ fontSize: 11, color: pal.inkDim, marginTop: 6 }}>
          RSVP-Deadline: {fmtDate(ev.rsvpDeadline)}
        </div>
      </div>

      <span style={{ color: pal.inkDim, fontSize: 18, alignSelf: 'center' }}>›</span>
    </div>
  );
}
