import React from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, colorCard, btn, badge, avatar } from '../design/calm.js';
import { awards, members, getMember, fmt } from '../mock/data.js';

const AWARD_ICONS = {
  'Pudelkönig': '🎳',
  'Goldesel':   '💰',
  'Streber':    '⭐',
  'Eisenmann':  '🔩',
  'Spätzünder': '⏰',
};

export default function Stats() {
  const navigate = useNavigate();

  const monthlyTrend = [3.90, 6.20, 4.80, 7.50, 6.20, 4.80];
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun'];
  const max = Math.max(...monthlyTrend);

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Statistiken</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>Awards & Auswertungen · Juni 2026</p>
        </div>
        <button onClick={() => navigate('/stats/alltime')} style={btn('ghost', { fontSize: 12 })}>
          Ewige Tabelle →
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Session awards */}
        <div style={card()}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 14 }}>
            SESSION-AWARDS · Kegelabend 09.06.
          </h2>
          {awards.session.map((aw, i) => {
            const m = getMember(aw.userId);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: i < awards.session.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
              }}>
                <span style={{ fontSize: 24 }}>{AWARD_ICONS[aw.type] || '🏆'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{aw.type}</div>
                  <div style={{ fontSize: 11, color: pal.inkSoft, marginTop: 1 }}>{aw.label}</div>
                </div>
                {m && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ ...avatar(m.color, 26), fontSize: 9 }}>{m.initials}</div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{m.firstName} {m.lastName[0]}.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Monthly awards */}
        <div style={card()}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 14 }}>
            MONATS-AWARDS · Mai 2026
          </h2>
          {awards.monthly.map((aw, i) => {
            const m = getMember(aw.userId);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: i < awards.monthly.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
              }}>
                <span style={{ fontSize: 20 }}>{AWARD_ICONS[aw.type] || '🏆'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{aw.type}</div>
                  <div style={{ fontSize: 11, color: pal.inkSoft }}>{aw.label}</div>
                </div>
                {m && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ ...avatar(m.color, 26), fontSize: 9 }}>{m.initials}</div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{m.firstName} {m.lastName[0]}.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly trend chart */}
      <div style={card({ marginBottom: 16 })}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 16 }}>
          STRAFEN-VERLAUF · 2026
        </h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
          {monthlyTrend.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: pal.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(v).replace(' €', '')}
              </span>
              <div style={{
                width: '100%', borderRadius: '6px 6px 0 0',
                background: i === monthlyTrend.length - 1 ? pal.terra : pal.terraBg,
                height: `${(v / max) * 80}px`,
                transition: 'height 0.3s',
              }} />
              <span style={{ fontSize: 10, color: pal.inkDim, fontWeight: 600 }}>{months[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top penalty causers */}
      <div style={card()}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 16 }}>
          TOP STRAFENVERURSACHER · Juni 2026
        </h2>
        {members.slice(0, 6).map((m, i) => {
          const amount = [2.30, 1.80, 1.20, 0.90, 0.70, 0.50][i];
          const pct = amount / 2.30;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, width: 16, textAlign: 'center' }}>{i + 1}</span>
              <div style={{ ...avatar(m.color, 24), fontSize: 8 }}>{m.initials}</div>
              <span style={{ fontSize: 12, fontWeight: 500, width: 80 }}>{m.firstName} {m.lastName[0]}.</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: pal.bg, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: i === 0 ? pal.terra : pal.terraBg, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: pal.terra, fontVariantNumeric: 'tabular-nums', width: 50, textAlign: 'right' }}>
                {fmt(amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
