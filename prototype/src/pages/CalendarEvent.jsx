import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { pal, card, colorCard, btn, badge, avatar } from '../design/calm.js';
import { events, members, fmtDate } from '../mock/data.js';

export default function CalendarEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const event = events.find(e => e.id === id) || events[0];
  const [myStatus, setMyStatus] = useState(event.myStatus);
  const [note, setNote] = useState(event.myNote || '');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const rsvpColor = myStatus === 'attending' ? pal.sage : myStatus === 'declined' ? pal.terra : pal.amber;
  const rsvpBg = myStatus === 'attending' ? pal.sageBg : myStatus === 'declined' ? pal.terraBg : pal.amberBg;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/calendar')} style={btn('ghost', { fontSize: 12, padding: '7px 12px' })}>← Zurück</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{event.title}</h1>
            <span style={badge('navy', { fontSize: 10 })}>{event.type === 'recurring' ? 'Wiederkehrend' : 'Einmalig'}</span>
          </div>
          <p style={{ fontSize: 12, color: pal.inkSoft, marginTop: 2 }}>
            {fmtDate(event.date)} · {event.time} Uhr · {event.location}
          </p>
        </div>
        <button onClick={() => navigate('/sessions/new')} style={btn('dark', { fontSize: 12 })}>
          ▶ Kegelabend starten
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* Main info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Description */}
          {event.description && (
            <div style={card()}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 10 }}>DETAILS</h3>
              <p style={{ fontSize: 13, color: pal.inkSoft, lineHeight: 1.6 }}>{event.description}</p>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                  <span style={{ color: pal.inkDim, width: 100 }}>Datum</span>
                  <span style={{ fontWeight: 600 }}>{fmtDate(event.date)}</span>
                </div>
                <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                  <span style={{ color: pal.inkDim, width: 100 }}>Uhrzeit</span>
                  <span style={{ fontWeight: 600 }}>{event.time} Uhr</span>
                </div>
                <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                  <span style={{ color: pal.inkDim, width: 100 }}>Ort</span>
                  <span style={{ fontWeight: 600 }}>{event.location}</span>
                </div>
                <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                  <span style={{ color: pal.inkDim, width: 100 }}>RSVP-Deadline</span>
                  <span style={{ fontWeight: 600 }}>{fmtDate(event.rsvpDeadline)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Attendees list */}
          <div style={card()}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 12 }}>
              RÜCKMELDUNGEN ({event.rsvp.attending + event.rsvp.declined + event.rsvp.pending} / {members.length})
            </h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: pal.sage }}>{event.rsvp.attending} ✓ Zugesagt</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: pal.terra }}>{event.rsvp.declined} ✗ Abgesagt</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: pal.amber }}>{event.rsvp.pending} ? Ausstehend</div>
            </div>

            {/* Mini member list with status */}
            {members.map((m, i) => {
              const status = i < event.rsvp.attending ? 'attending'
                : i < event.rsvp.attending + event.rsvp.declined ? 'declined' : 'pending';
              const sc = status === 'attending' ? pal.sage : status === 'declined' ? pal.terra : pal.amber;
              const sl = status === 'attending' ? '✓' : status === 'declined' ? '✗' : '?';
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 0',
                  borderBottom: i < members.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
                }}>
                  <div style={{ ...avatar(m.color, 26), fontSize: 9 }}>{m.initials}</div>
                  <span style={{ flex: 1, fontSize: 12 }}>{m.firstName} {m.lastName}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: sc }}>{sl}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RSVP panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={colorCard(rsvpBg)}>
            <div style={{ fontSize: 11, fontWeight: 700, color: rsvpColor, letterSpacing: '0.04em', marginBottom: 10 }}>DEINE RÜCKMELDUNG</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: rsvpColor, marginBottom: 16 }}>
              {myStatus === 'attending' ? '✓ Zugesagt' : myStatus === 'declined' ? '✗ Abgesagt' : '? Noch offen'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => setMyStatus('attending')}
                style={{
                  ...btn(myStatus === 'attending' ? 'sage' : 'ghost', { justifyContent: 'center', padding: '10px' }),
                  width: '100%',
                }}
              >✓ Zusagen</button>
              <button
                onClick={() => setMyStatus('declined')}
                style={{
                  ...btn('ghost', { justifyContent: 'center', padding: '10px' }),
                  width: '100%',
                  background: myStatus === 'declined' ? pal.terra : undefined,
                  color: myStatus === 'declined' ? '#fff' : undefined,
                }}
              >✗ Absagen</button>
            </div>

            {!showNoteInput ? (
              <button
                onClick={() => setShowNoteInput(true)}
                style={{ ...btn('ghost', { fontSize: 11, marginTop: 10, width: '100%', justifyContent: 'center' }) }}
              >+ Notiz hinzufügen</button>
            ) : (
              <div style={{ marginTop: 10 }}>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="z.B. Komme 30 Minuten später…"
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10,
                    border: `1.5px solid ${pal.cardEdge}`, background: 'rgba(255,255,255,0.7)',
                    fontFamily: 'inherit', fontSize: 12, color: pal.ink, outline: 'none',
                    resize: 'none', height: 72,
                  }}
                />
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div style={card()}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 10 }}>AKTIONEN</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button style={btn('ghost', { fontSize: 12, justifyContent: 'flex-start' })}>✏️ Termin bearbeiten</button>
              <button
                onClick={() => navigate('/sessions/new')}
                style={btn('ghost', { fontSize: 12, justifyContent: 'flex-start' })}
              >▶ Kegelabend starten</button>
              <button style={{ ...btn('ghost', { fontSize: 12, justifyContent: 'flex-start' }), color: pal.terra }}>🗑 Termin löschen</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
