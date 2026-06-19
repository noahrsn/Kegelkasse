import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, CAR, btn, input, label } from '../design/calm.js';

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('no.roosen@gmail.com');
  const [pw, setPw] = useState('••••••••');

  return (
    <div style={{
      minHeight: '100vh', background: pal.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 28,
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18, background: pal.ink,
            display: 'grid', placeItems: 'center', margin: '0 auto 14px',
            fontSize: 28, fontWeight: 700, color: pal.bg,
          }}>K</div>
          <h1 style={{ fontSize: CAR.fontSize.xl, fontWeight: 700, letterSpacing: '-0.02em', color: pal.ink }}>Kegelkasse</h1>
          <p style={{ fontSize: CAR.fontSize.sm, color: pal.inkDim, marginTop: 5 }}>Vereinskasse für Kegelclubs</p>
        </div>

        <div style={{
          background: pal.card, borderRadius: 24,
          border: `1px solid ${pal.cardEdge}`,
          overflow: 'hidden',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${pal.cardEdge}` }}>
            {['login', 'register'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '18px 0',
                  border: 'none', background: tab === t ? pal.card : pal.bg,
                  fontFamily: 'inherit', fontSize: CAR.fontSize.base, fontWeight: tab === t ? 700 : 500,
                  color: tab === t ? pal.ink : pal.inkDim,
                  cursor: 'pointer',
                  borderBottom: tab === t ? `2.5px solid ${pal.ink}` : '2.5px solid transparent',
                  minHeight: CAR.itemMinH,
                }}
              >{t === 'login' ? 'Anmelden' : 'Registrieren'}</button>
            ))}
          </div>

          <div style={{ padding: 28 }}>
            {tab === 'login' ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <span style={label()}>E-Mail</span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={input()}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={label({ marginBottom: 0 })}>Passwort</span>
                    <a style={{ fontSize: 12, color: pal.terra, cursor: 'pointer', fontWeight: 600 }}>Vergessen?</a>
                  </div>
                  <input
                    type="password"
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                    style={input()}
                  />
                </div>
                <button
                  onClick={() => navigate('/dashboard')}
                  style={btn('dark', { width: '100%', fontSize: 15, borderRadius: 14 })}
                >
                  Anmelden
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <span style={label()}>Vorname</span>
                    <input type="text" placeholder="Noah" style={input()} />
                  </div>
                  <div>
                    <span style={label()}>Nachname</span>
                    <input type="text" placeholder="Roosen" style={input()} />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <span style={label()}>E-Mail</span>
                  <input type="email" placeholder="deine@email.de" style={input()} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <span style={label()}>Passwort</span>
                  <input type="password" placeholder="Mindestens 8 Zeichen" style={input()} />
                </div>
                <button
                  onClick={() => navigate('/dashboard')}
                  style={btn('dark', { width: '100%', fontSize: 15, borderRadius: 14 })}
                >
                  Konto erstellen
                </button>
              </>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: pal.inkDim, marginTop: 20 }}>
          Prototype — keine echten Daten
        </p>
      </div>
    </div>
  );
}
