import React, { useState } from 'react';
import { pal, card, colorCard, btn, badge, avatar, input, label, divider } from '../design/calm.js';
import { currentUser, group, myDebts, awards, fmt } from '../mock/data.js';

const NOTIF_SETTINGS = [
  { id: 'new_penalty',    label: 'Neue Strafe',             desc: 'Wenn eine Strafe für dich gebucht wird', default: true },
  { id: 'monthly_fee',   label: 'Monatsbeitrag',            desc: 'Wenn ein Monatsbeitrag gebucht wird',    default: true },
  { id: 'debt_reminder', label: 'Schulden-Erinnerung',     desc: 'Wöchentlich bei offenen Schulden',       default: true },
  { id: 'session_approved', label: 'Kegelabend genehmigt', desc: 'Nach Freigabe durch den Kassenwart',     default: false },
  { id: 'event_invitation', label: 'Neuer Termin',         desc: 'Wenn ein neues Event erstellt wird',     default: true },
  { id: 'rsvp_reminder', label: 'RSVP-Erinnerung',        desc: '24h vor RSVP-Deadline',                  default: true },
  { id: 'payment_received', label: 'Zahlung eingegangen',  desc: 'Wenn eine Zahlung zugeordnet wird',      default: true },
  { id: 'new_poll',      label: 'Neue Abstimmung',          desc: 'Wenn eine Abstimmung erstellt wird',     default: true },
];

export default function Profile() {
  const [toggles, setToggles] = useState(
    Object.fromEntries(NOTIF_SETTINGS.map(n => [n.id, n.default]))
  );
  const [tab, setTab] = useState('profile');

  const totalDebt = myDebts.filter(d => !d.paid).reduce((s, d) => s + d.amount, 0);
  const myAwards = awards.monthly.slice(0, 2);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 680 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 24 }}>Profil</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: pal.card, borderRadius: 12, padding: 4, border: `1px solid ${pal.cardEdge}`, width: 'fit-content' }}>
        {[['profile', 'Meine Daten'], ['debts', 'Schulden'], ['notifications', 'Benachrichtigungen']].map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 14px', borderRadius: 9, border: 'none',
              background: tab === t ? pal.ink : 'transparent',
              color: tab === t ? pal.bg : pal.inkSoft,
              fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t ? 700 : 500, cursor: 'pointer',
            }}
          >{l}</button>
        ))}
      </div>

      {tab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Avatar + Awards */}
          <div style={colorCard(pal.sageBg, { flexDirection: 'row', alignItems: 'center', gap: 20 })}>
            <div style={{ ...avatar(currentUser.color, 72), fontSize: 24 }}>{currentUser.initials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{currentUser.firstName} {currentUser.lastName}</div>
              <div style={{ fontSize: 13, color: pal.sage, fontWeight: 600, marginTop: 2 }}>
                Kassenwart · {group.name}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {myAwards.map((aw, i) => (
                  <span key={i} style={badge('amber')}>🏆 {aw.type}</span>
                ))}
              </div>
            </div>
            {totalDebt > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: pal.terra }}>{fmt(totalDebt)}</div>
                <div style={{ fontSize: 10, color: pal.terra, opacity: 0.7 }}>offen</div>
              </div>
            )}
          </div>

          <div style={card()}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Persönliche Daten</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <span style={label()}>Vorname</span>
                <input type="text" defaultValue={currentUser.firstName} style={input()} />
              </div>
              <div>
                <span style={label()}>Nachname</span>
                <input type="text" defaultValue={currentUser.lastName} style={input()} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <span style={label()}>E-Mail</span>
              <input type="email" defaultValue={currentUser.email} style={input()} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <span style={label()}>Neues Passwort</span>
              <input type="password" placeholder="Leer lassen für keine Änderung" style={input()} />
            </div>
            <button style={btn('dark')}>Profil speichern</button>
          </div>
        </div>
      )}

      {tab === 'debts' && (
        <div style={card({ gap: 0, padding: 0, overflow: 'hidden' })}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${pal.cardEdge}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Meine Schulden</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: pal.terra }}>
              {fmt(totalDebt)} offen
            </span>
          </div>
          {myDebts.map((d, i) => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i < myDebts.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
              opacity: d.paid ? 0.55 : 1,
            }}>
              <span style={badge(
                d.paid ? 'sage' : d.type === 'monthly_fee' ? 'navy' : 'terra',
                { fontSize: 9, flexShrink: 0 }
              )}>{d.paid ? '✓' : d.type === 'monthly_fee' ? 'Beitrag' : 'Strafe'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{d.description}</div>
                <div style={{ fontSize: 11, color: pal.inkDim, marginTop: 2 }}>
                  {d.paid ? `Bezahlt ${d.paidAt}` : `Frist ${d.dueDate}`}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: d.paid ? pal.inkDim : pal.terra, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(d.amount)}
              </span>
            </div>
          ))}
          <div style={{ padding: '14px 16px', background: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Gesamt offen</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: pal.terra, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalDebt)}</span>
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div style={card()}>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Benachrichtigungen</h2>
          <p style={{ fontSize: 12, color: pal.inkSoft, marginBottom: 20 }}>Club: {group.name}</p>
          {NOTIF_SETTINGS.map((n, i) => (
            <div key={n.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 0',
              borderBottom: i < NOTIF_SETTINGS.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{n.label}</div>
                <div style={{ fontSize: 11, color: pal.inkDim, marginTop: 1 }}>{n.desc}</div>
              </div>
              <button
                onClick={() => setToggles(t => ({ ...t, [n.id]: !t[n.id] }))}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none',
                  background: toggles[n.id] ? pal.sage : pal.cardEdge,
                  cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: toggles[n.id] ? 23 : 3,
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
