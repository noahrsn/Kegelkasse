import React from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, CAR, card, colorCard, btn, badge, avatar } from '../design/calm.js';
import { currentUser, members, events, kassenstand, activityLog, myDebts, sessions, fmt, fmtDateShort, getMember } from '../mock/data.js';

const dueDebt = myDebts.filter(d => !d.paid).reduce((s, d) => s + d.amount, 0);
const nextEvent = events[0];
const pendingSession = sessions.find(s => s.status === 'submitted');

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: `${CAR.py}px ${CAR.px}px`, minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: CAR.gap + 4 }}>
        <div>
          <p style={{ fontSize: CAR.fontSize.sm, color: pal.inkDim }}>Donnerstag · 19. Juni 2026</p>
          <h1 style={{ fontSize: CAR.fontSize.xl, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.1, marginTop: 2 }}>
            Hallo, {currentUser.firstName}.
          </h1>
        </div>
        <button
          onClick={() => navigate('/sessions/new')}
          style={btn('dark', { fontSize: 15, padding: '14px 24px' })}
        >+ Kegelabend</button>
      </div>

      {/* Pending session banner */}
      {pendingSession && (
        <div style={{
          background: pal.amberBg,
          borderRadius: 16, padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          marginBottom: CAR.gap,
          border: `1px solid rgba(176,126,42,0.25)`,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: pal.amber, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: CAR.fontSize.base, color: pal.ink }}>Einreichung wartet auf Freigabe</strong>
            <div style={{ fontSize: CAR.fontSize.sm, color: pal.inkSoft, marginTop: 2 }}>
              {fmtDateShort(pendingSession.date)} · {pendingSession.recordedByName} · {pendingSession.participantCount} Teilnehmer · Σ {fmt(pendingSession.totalAmount)}
            </div>
          </div>
          <button
            onClick={() => navigate(`/sessions/${pendingSession.id}`)}
            style={btn('dark', { fontSize: 13, minHeight: 50, padding: '11px 18px' })}
          >Prüfen →</button>
        </div>
      )}

      {/* Main 2-column grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: CAR.gap,
      }}>

        {/* Schulden-Karte */}
        <div style={colorCard(pal.terraBg)}>
          <span style={{ fontSize: CAR.fontSize.xs, color: pal.terra, fontWeight: 700, letterSpacing: '0.06em' }}>MEINE SCHULDEN</span>
          <div style={{
            marginTop: 10,
            fontSize: CAR.fontSize.hero, fontWeight: 600, lineHeight: 0.9,
            letterSpacing: '-0.04em', color: pal.ink,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(dueDebt).replace(' €', '')}
            <span style={{ fontWeight: 400, fontSize: CAR.fontSize.xl, color: pal.terra }}> €</span>
          </div>
          <p style={{ marginTop: 6, fontSize: CAR.fontSize.sm, color: pal.terra }}>
            {myDebts.filter(d => !d.paid).length} Einträge offen · Frist 21.06.
          </p>
          <div style={{ flex: 1, minHeight: 12 }} />
          <div style={{
            marginTop: 14, padding: '14px 16px',
            background: 'rgba(255,255,255,0.55)', borderRadius: 14,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: CAR.fontSize.xs, color: pal.terra, fontWeight: 700, letterSpacing: '0.04em' }}>IBAN</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: pal.ink, marginTop: 3 }}>DE81 3205 0000 0002 8025 69</div>
            </div>
            <button style={btn('terra', { fontSize: 13, minHeight: 50, padding: '11px 18px' })}>Begleichen</button>
          </div>
        </div>

        {/* Nächster Abend */}
        <div style={colorCard(pal.navy, { color: '#fff' })}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: CAR.fontSize.xs, color: pal.cream, fontWeight: 700 }}>NÄCHSTER ABEND</span>
            <span style={{ fontSize: CAR.fontSize.sm, color: 'rgba(255,255,255,0.6)' }}>in 7 Tagen</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <div style={{ fontSize: CAR.fontSize.hero, fontWeight: 600, lineHeight: 0.85, letterSpacing: '-0.04em', color: pal.cream }}>
              {new Date(nextEvent.date).getDate()}
            </div>
            <div style={{ paddingBottom: 6 }}>
              <div style={{ fontSize: CAR.fontSize.md, fontWeight: 600 }}>
                {new Date(nextEvent.date).toLocaleDateString('de-DE', { weekday: 'short', month: 'short' })}
              </div>
              <div style={{ fontSize: CAR.fontSize.sm, opacity: 0.65, marginTop: 2 }}>{nextEvent.time} · {nextEvent.location}</div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 10 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <div style={{ display: 'flex' }}>
              {members.slice(0, 4).map((m, i) => (
                <div key={m.id} style={{
                  ...avatar(m.color, 26),
                  border: `2px solid ${pal.navy}`,
                  marginLeft: i === 0 ? 0 : -8,
                  fontSize: 9,
                }}>{m.initials}</div>
              ))}
            </div>
            <span style={{ fontSize: CAR.fontSize.sm, opacity: 0.75 }}>{nextEvent.rsvp.attending} zugesagt</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => navigate(`/calendar/${nextEvent.id}`)}
              style={btn('ghost', { flex: 1, background: pal.cream, color: pal.navy, border: 'none', fontSize: 13, minHeight: 52, padding: '12px 16px' })}
            >Zusagen</button>
            <button
              onClick={() => navigate(`/calendar/${nextEvent.id}`)}
              style={{ ...btn('ghost', { fontSize: 13, minHeight: 52, padding: '12px 16px' }), background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
            >Details</button>
          </div>
        </div>

        {/* Vereinskasse */}
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: CAR.fontSize.xs, color: pal.inkSoft, fontWeight: 700, letterSpacing: '0.05em' }}>VEREINSKASSE</span>
            <span style={{ ...badge('sage') }}>▲ +6,2 %</span>
          </div>
          <div style={{
            marginTop: 10, fontSize: CAR.fontSize.hero - 8, fontWeight: 600, lineHeight: 1,
            letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(kassenstand).replace(' €', '')}
            <span style={{ fontWeight: 400, fontSize: CAR.fontSize.lg, color: pal.inkDim }}> €</span>
          </div>
          <TreasurySvg />
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${pal.cardEdge}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: CAR.fontSize.xs, color: pal.inkDim, letterSpacing: '0.04em' }}>EIN · 30 Tage</div>
              <div style={{ fontSize: CAR.fontSize.base, fontWeight: 700, color: pal.sage, marginTop: 3, fontFamily: "'DM Mono', monospace" }}>+ 312,40 €</div>
            </div>
            <div>
              <div style={{ fontSize: CAR.fontSize.xs, color: pal.inkDim, letterSpacing: '0.04em' }}>AUS · 30 Tage</div>
              <div style={{ fontSize: CAR.fontSize.base, fontWeight: 700, color: pal.terra, marginTop: 3, fontFamily: "'DM Mono', monospace" }}>− 84,20 €</div>
            </div>
          </div>
          <button
            onClick={() => navigate('/treasury')}
            style={btn('ghost', { marginTop: 14, width: '100%', fontSize: 13, minHeight: 52 })}
          >Kassenbuch öffnen →</button>
        </div>

        {/* Aktivität */}
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: CAR.fontSize.xs, color: pal.inkSoft, fontWeight: 700, letterSpacing: '0.05em' }}>LETZTE AKTIVITÄT</span>
          </div>
          {activityLog.slice(0, 3).map(log => <ActivityRow key={log.id} log={log} />)}
        </div>

      </div>
    </div>
  );
}

function TreasurySvg() {
  return (
    <svg viewBox="0 0 260 40" style={{ width: '100%', marginTop: 10 }}>
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={pal.sage} stopOpacity="0.2" />
          <stop offset="100%" stopColor={pal.sage} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,34 L20,30 L40,32 L60,26 L80,22 L100,24 L120,16 L140,18 L160,12 L180,8 L200,10 L220,4 L240,2 L260,1 L260,40 L0,40 Z"
        fill="url(#g1)" />
      <path d="M0,34 L20,30 L40,32 L60,26 L80,22 L100,24 L120,16 L140,18 L160,12 L180,8 L200,10 L220,4 L240,2 L260,1"
        fill="none" stroke={pal.sage} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="260" cy="1" r="3" fill={pal.sage} />
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
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 2px',
      borderBottom: `1px solid ${pal.cardEdge}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: pal.bg, color: pal.inkSoft,
        border: `1px solid ${pal.cardEdge}`,
        display: 'grid', placeItems: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        {log.actor.split(' ').map(p => p[0]).join('')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: CAR.fontSize.sm, lineHeight: 1.3 }}>
          <strong style={{ color: pal.ink }}>{log.actor}</strong>
          {' '}<span style={{ color: pal.inkSoft }}>{log.action}</span>
        </div>
        <div style={{ fontSize: CAR.fontSize.xs, color: pal.inkDim, marginTop: 2 }}>{log.when}</div>
      </div>
      <span style={{ ...badge('sage'), background: tc.bg, color: tc.color, flexShrink: 0 }}>{log.tag}</span>
    </div>
  );
}
