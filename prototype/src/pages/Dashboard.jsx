import React from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, colorCard, btn, badge, avatar } from '../design/calm.js';
import { currentUser, members, events, kassenstand, activityLog, myDebts, sessions, fmt, fmtDateShort, getMember } from '../mock/data.js';

const dueDebt = myDebts.filter(d => !d.paid).reduce((s, d) => s + d.amount, 0);
const nextEvent = events[0];
const pendingSession = sessions.find(s => s.status === 'submitted');

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '22px 28px 28px', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, color: pal.inkDim, letterSpacing: '0.02em' }}>Montag · 16. Juni 2026</p>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, marginTop: 3 }}>
            Guten Tag, {currentUser.firstName}.
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/sessions/new')}
            style={btn('dark', { fontSize: 13, padding: '10px 18px' })}
          >+ Kegelabend</button>
        </div>
      </div>

      {/* Bento grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.6fr 1fr 1fr',
        gridTemplateRows: 'auto auto auto',
        gap: 14,
      }}>

        {/* Pending session banner — full width */}
        {pendingSession && (
          <div style={{
            gridColumn: '1 / 4',
            background: pal.amberBg,
            borderRadius: 16, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: pal.amber, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 13 }}>Einreichung wartet auf Freigabe</strong>
              <span style={{ fontSize: 12, color: pal.inkSoft }}>
                {' '}· Kegelabend {fmtDateShort(pendingSession.date)} · {pendingSession.recordedByName} · {pendingSession.participantCount} Teilnehmer · Σ {fmt(pendingSession.totalAmount)}
              </span>
            </div>
            <button
              onClick={() => navigate(`/sessions/${pendingSession.id}`)}
              style={btn('dark', { fontSize: 11 })}
            >Prüfen</button>
          </div>
        )}

        {/* Debt card */}
        <div style={colorCard(pal.terraBg)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: pal.terra, fontWeight: 700, letterSpacing: '0.03em' }}>MEINE SCHULDEN</span>
            <span style={{ ...badge('terra'), background: 'rgba(255,255,255,0.6)' }}>Frist 21.06.</span>
          </div>
          <div style={{
            marginTop: 12,
            fontSize: 62, fontWeight: 600, lineHeight: 0.9,
            letterSpacing: '-0.04em', color: pal.ink,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(dueDebt).replace(' €', '')}
            <span style={{ fontWeight: 400, fontSize: 28, color: pal.terra }}> €</span>
          </div>
          <p style={{ marginTop: 5, fontSize: 12, color: pal.terra }}>
            {myDebts.filter(d => !d.paid).length} Einträge offen
          </p>
          <div style={{ flex: 1, minHeight: 16 }} />
          <div style={{
            marginTop: 16, padding: '12px 14px',
            background: 'rgba(255,255,255,0.55)', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: pal.terra, fontWeight: 700, letterSpacing: '0.04em' }}>IBAN</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: pal.ink, marginTop: 2 }}>DE81 3205 0000 0002 8025 69</div>
            </div>
            <button style={btn('terra', { fontSize: 11 })}>Begleichen</button>
          </div>
        </div>

        {/* Next event */}
        <div style={colorCard(pal.navy, { color: '#fff' })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: pal.cream, fontWeight: 700 }}>NÄCHSTER ABEND</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>in 7 Tagen</span>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 0.85, letterSpacing: '-0.04em', color: pal.cream }}>
              {new Date(nextEvent.date).getDate()}
            </div>
            <div style={{ paddingBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {new Date(nextEvent.date).toLocaleDateString('de-DE', { weekday: 'short', month: 'short' })}
              </div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{nextEvent.time} · {nextEvent.location}</div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'flex' }}>
              {members.slice(0, 4).map((m, i) => (
                <div key={m.id} style={{
                  ...avatar(m.color, 22),
                  border: `2px solid ${pal.navy}`,
                  marginLeft: i === 0 ? 0 : -7,
                  fontSize: 8,
                }}>{m.initials}</div>
              ))}
            </div>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{nextEvent.rsvp.attending} zugesagt · {nextEvent.rsvp.pending} offen</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button
              onClick={() => navigate(`/calendar/${nextEvent.id}`)}
              style={btn('ghost', { flex: 1, justifyContent: 'center', background: pal.cream, color: pal.navy, border: 'none', fontSize: 12 })}
            >Zusagen</button>
            <button
              onClick={() => navigate(`/calendar/${nextEvent.id}`)}
              style={{ ...btn('ghost', { fontSize: 12 }), background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
            >Details</button>
          </div>
        </div>

        {/* Mitglieder quick card */}
        <div style={colorCard(pal.cream)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: pal.inkSoft }}>MITGLIEDER</span>
            <span style={{ fontSize: 11, color: pal.amber, fontWeight: 700 }}>{members.length} aktiv</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {members.slice(0, 8).map(m => (
              <div
                key={m.id}
                onClick={() => navigate('/members')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 8px 4px 4px', borderRadius: 100,
                  background: 'rgba(255,255,255,0.65)', cursor: 'pointer',
                }}
              >
                <div style={{ ...avatar(m.color, 18), fontSize: 7 }}>{m.initials}</div>
                <span style={{ fontSize: 11, fontWeight: 500 }}>{m.firstName} {m.lastName[0]}.</span>
              </div>
            ))}
            <div
              onClick={() => navigate('/members')}
              style={{
                padding: '4px 10px', borderRadius: 100,
                background: pal.ink, color: pal.bg,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >+{members.length - 8} weitere</div>
          </div>
          <div style={{ flex: 1, minHeight: 12 }} />
          <TopPudler />
        </div>

        {/* Treasury card */}
        <div style={card({ gridColumn: '1 / 2' })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: pal.inkSoft, fontWeight: 700, letterSpacing: '0.02em' }}>VEREINSKASSE</span>
            <span style={{ ...badge('sage') }}>▲ +6,2 %</span>
          </div>
          <div style={{
            marginTop: 10, fontSize: 44, fontWeight: 600, lineHeight: 1,
            letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(kassenstand).replace(' €', '')}
            <span style={{ fontWeight: 400, fontSize: 20, color: pal.inkDim }}> €</span>
          </div>
          <TreasurySvg />
          <div style={{ flex: 1 }} />
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${pal.cardEdge}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: pal.inkDim, letterSpacing: '0.04em' }}>EIN · 30 Tage</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: pal.sage, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>+ 312,40 €</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: pal.inkDim, letterSpacing: '0.04em' }}>AUS · 30 Tage</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: pal.terra, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>− 84,20 €</div>
            </div>
          </div>
          <button
            onClick={() => navigate('/treasury')}
            style={{ ...btn('ghost', { marginTop: 12, justifyContent: 'center', width: '100%', fontSize: 12 }) }}
          >Kassenbuch öffnen →</button>
        </div>

        {/* Activity */}
        <div style={card({ gridColumn: '2 / 4' })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: pal.inkSoft, fontWeight: 700, letterSpacing: '0.02em' }}>AKTIVITÄT</span>
            <a
              onClick={() => {}}
              style={{ fontSize: 11, color: pal.inkDim, cursor: 'pointer', textDecoration: 'none' }}
            >Alle ansehen →</a>
          </div>
          {activityLog.slice(0, 4).map(log => <ActivityRow key={log.id} log={log} />)}
        </div>

      </div>
    </div>
  );
}

function TopPudler() {
  const data = [
    ['Martin H.', '23,80 €', 0.95],
    ['Petra L.',  '11,20 €', 0.45],
    ['Karin V.',  '8,50 €',  0.34],
  ];
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 10, color: pal.inkSoft, fontWeight: 700, letterSpacing: '0.03em', marginBottom: 8 }}>TOP PUDLER · JUNI</div>
      {data.map(([n, e, p], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, width: 64, color: pal.inkSoft }}>{n}</span>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: pal.amber }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: pal.amber, fontWeight: 600 }}>{e}</span>
        </div>
      ))}
    </div>
  );
}

function TreasurySvg() {
  return (
    <svg viewBox="0 0 260 44" style={{ width: '100%', marginTop: 12 }}>
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={pal.sage} stopOpacity="0.2" />
          <stop offset="100%" stopColor={pal.sage} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,36 L20,32 L40,34 L60,28 L80,24 L100,26 L120,18 L140,20 L160,14 L180,10 L200,12 L220,6 L240,4 L260,3 L260,44 L0,44 Z"
        fill="url(#g1)" />
      <path d="M0,36 L20,32 L40,34 L60,28 L80,24 L100,26 L120,18 L140,20 L160,14 L180,10 L200,12 L220,6 L240,4 L260,3"
        fill="none" stroke={pal.sage} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="260" cy="3" r="3" fill={pal.sage} />
      <circle cx="260" cy="3" r="6" fill={pal.sage} opacity="0.2" />
    </svg>
  );
}

const TAG_COLORS = {
  amber: { bg: pal.amberBg, color: pal.amber },
  sage:  { bg: pal.sageBg,  color: pal.sage },
  navy:  { bg: pal.navyBg,  color: pal.navy },
  terra: { bg: pal.terraBg, color: pal.terra },
};

function ActivityRow({ log }) {
  const tc = TAG_COLORS[log.tagType] || TAG_COLORS.sage;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 2px',
      borderBottom: `1px solid ${pal.cardEdge}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: pal.bg, color: pal.inkSoft,
        border: `1px solid ${pal.cardEdge}`,
        display: 'grid', placeItems: 'center',
        fontSize: 10, fontWeight: 700, flexShrink: 0,
      }}>
        {log.actor.split(' ').map(p => p[0]).join('')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, lineHeight: 1.3 }}>
          <strong style={{ color: pal.ink }}>{log.actor}</strong>
          {' '}<span style={{ color: pal.inkSoft }}>{log.action}</span>
          {log.detail && <span style={{ color: pal.inkDim }}>{' '}· {log.detail}</span>}
        </div>
        <div style={{ fontSize: 10, color: pal.inkDim, marginTop: 1 }}>{log.when}</div>
      </div>
      <span style={{ ...badge('sage'), background: tc.bg, color: tc.color, flexShrink: 0 }}>{log.tag}</span>
    </div>
  );
}
