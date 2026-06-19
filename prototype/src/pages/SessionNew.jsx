import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, btn, badge, avatar } from '../design/calm.js';
import { members, events, fmtDate } from '../mock/data.js';

export default function SessionNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [linkedEvent, setLinkedEvent] = useState('event-1');
  const [attendance, setAttendance] = useState(
    Object.fromEntries(members.map(m => [m.id, 'present']))
  );
  const [guests, setGuests] = useState([{ id: 'g-1', name: 'Max Gast' }]);
  const [guestName, setGuestName] = useState('');

  const presentCount = Object.values(attendance).filter(v => v === 'present').length;
  const absentCount = Object.values(attendance).filter(v => v === 'absent').length;

  const toggleAttendance = (id) => {
    setAttendance(a => ({ ...a, [id]: a[id] === 'present' ? 'absent' : 'present' }));
  };

  const addGuest = () => {
    if (!guestName.trim()) return;
    setGuests(g => [...g, { id: `g-${Date.now()}`, name: guestName.trim() }]);
    setGuestName('');
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/sessions')}
          style={{ ...btn('ghost', { fontSize: 12, padding: '7px 12px' }) }}
        >← Zurück</button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Kegelabend starten</h1>
          <p style={{ fontSize: 12, color: pal.inkSoft, marginTop: 2 }}>Schritt {step} von 2</p>
        </div>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {[1, 2].map(n => (
          <div key={n} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: n <= step ? pal.ink : pal.cardEdge,
          }} />
        ))}
      </div>

      {step === 1 && (
        <div style={card()}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Event verknüpfen</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map(ev => (
              <div
                key={ev.id}
                onClick={() => setLinkedEvent(ev.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', borderRadius: 14, cursor: 'pointer',
                  border: `2px solid ${linkedEvent === ev.id ? pal.ink : pal.cardEdge}`,
                  background: linkedEvent === ev.id ? pal.bg : 'transparent',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: linkedEvent === ev.id ? pal.ink : pal.bg,
                  color: linkedEvent === ev.id ? pal.bg : pal.inkDim,
                  display: 'grid', placeItems: 'center',
                  fontSize: 14, fontWeight: 700, flexShrink: 0,
                }}>
                  {new Date(ev.date).getDate()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: pal.inkSoft, marginTop: 2 }}>
                    {fmtDate(ev.date)} · {ev.time} · {ev.location}
                  </div>
                </div>
                {linkedEvent === ev.id && <span style={{ color: pal.ink, fontSize: 18 }}>✓</span>}
              </div>
            ))}
            <div
              onClick={() => setLinkedEvent(null)}
              style={{
                padding: '10px 16px', borderRadius: 14, cursor: 'pointer',
                border: `2px solid ${linkedEvent === null ? pal.ink : pal.cardEdge}`,
                fontSize: 13, color: pal.inkSoft,
              }}
            >Ohne Termin-Verknüpfung starten</div>
          </div>
          <button
            onClick={() => setStep(2)}
            style={{ ...btn('dark', { marginTop: 20, justifyContent: 'center', width: '100%', padding: '12px' }) }}
          >Weiter: Teilnehmer →</button>
        </div>
      )}

      {step === 2 && (
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Teilnehmer</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: pal.sage, fontWeight: 600 }}>{presentCount} anwesend</span>
              <span style={{ fontSize: 12, color: pal.inkDim }}>·</span>
              <span style={{ fontSize: 12, color: pal.terra, fontWeight: 600 }}>{absentCount} abwesend</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {members.map(m => {
              const isPresent = attendance[m.id] === 'present';
              return (
                <div
                  key={m.id}
                  onClick={() => toggleAttendance(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    background: isPresent ? pal.sageBg : pal.bg,
                    border: `1px solid ${isPresent ? 'rgba(94,122,90,0.3)' : pal.cardEdge}`,
                    opacity: isPresent ? 1 : 0.55,
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ ...avatar(m.color, 32), fontSize: 11 }}>{m.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.firstName} {m.lastName}</div>
                    <div style={{ fontSize: 10, color: pal.inkDim }}>{m.role}</div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: isPresent ? pal.sage : 'transparent',
                    border: `2px solid ${isPresent ? pal.sage : pal.cardEdge}`,
                    display: 'grid', placeItems: 'center',
                    color: '#fff', fontSize: 12,
                  }}>{isPresent ? '✓' : ''}</div>
                </div>
              );
            })}
          </div>

          {/* Guests */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${pal.cardEdge}` }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Gäste</h3>
            {guests.map(g => (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 10, background: pal.bg,
                marginBottom: 6,
              }}>
                <div style={{ ...avatar('#9a948a', 28), fontSize: 10 }}>G</div>
                <span style={{ fontSize: 13, flex: 1 }}>{g.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setGuests(gs => gs.filter(x => x.id !== g.id)); }}
                  style={{ ...btn('ghost', { fontSize: 11, padding: '4px 10px', color: pal.terra }), border: 'none', background: 'transparent' }}
                >×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGuest()}
                placeholder="Gast hinzufügen…"
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 10,
                  border: `1.5px solid ${pal.cardEdge}`, background: pal.card,
                  fontFamily: 'inherit', fontSize: 13, color: pal.ink, outline: 'none',
                }}
              />
              <button onClick={addGuest} style={btn('ghost', { fontSize: 12 })}>+ Add</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={() => setStep(1)} style={btn('ghost', { flex: 1, justifyContent: 'center', padding: '12px' })}>
              ← Zurück
            </button>
            <button
              onClick={() => navigate('/sessions/session-pending')}
              style={btn('dark', { flex: 2, justifyContent: 'center', padding: '12px' })}
            >
              Abend starten →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
