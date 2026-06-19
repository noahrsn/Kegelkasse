import React, { useState } from 'react';
import { pal, card, btn, badge, avatar, ROLE_LABELS } from '../design/calm.js';
import { members, myDebts, fmt, fmtDate } from '../mock/data.js';
import Modal from '../components/Modal.jsx';

export default function Members() {
  const [sort, setSort] = useState('debt');
  const [selected, setSelected] = useState(null);

  const sorted = [...members].sort((a, b) => {
    if (sort === 'debt') return b.debt - a.debt;
    if (sort === 'name') return a.lastName.localeCompare(b.lastName);
    return 0;
  });

  const selectedMember = selected ? members.find(m => m.id === selected) : null;
  const totalDebt = members.reduce((s, m) => s + m.debt, 0);
  const paidCount = members.filter(m => m.debt === 0).length;

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Mitglieder</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>
            {members.length} Mitglieder · Gesamtschulden: {fmt(totalDebt)} · {paidCount} ohne Schulden
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn('ghost', { fontSize: 12 })}>Einladungslink</button>
          <button style={btn('dark', { fontSize: 12 })}>+ Mitglied</button>
        </div>
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['debt', 'Nach Schulden'], ['name', 'Alphabetisch']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setSort(v)}
            style={{
              padding: '7px 14px', borderRadius: 100,
              background: sort === v ? pal.ink : pal.card,
              color: sort === v ? pal.bg : pal.inkSoft,
              border: `1px solid ${sort === v ? pal.ink : pal.cardEdge}`,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >{l}</button>
        ))}
      </div>

      {/* Member table */}
      <div style={card({ padding: 0, gap: 0, overflow: 'hidden' })}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 100px 120px 90px 80px',
          padding: '10px 16px', borderBottom: `1px solid ${pal.cardEdge}`,
          fontSize: 10, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em',
        }}>
          <span>MITGLIED</span><span>ROLLE</span><span>LETZTE ZAHLUNG</span><span style={{ textAlign: 'right' }}>SCHULDEN</span><span></span>
        </div>

        {sorted.map((m, i) => {
          const debtColor = m.debt === 0 ? pal.sage : m.debt > 15 ? pal.terra : pal.amber;
          const debtBg = m.debt === 0 ? pal.sageBg : m.debt > 15 ? pal.terraBg : pal.amberBg;

          return (
            <div
              key={m.id}
              onClick={() => setSelected(m.id)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 120px 90px 80px',
                alignItems: 'center', padding: '12px 16px',
                borderBottom: i < sorted.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = pal.bg}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ ...avatar(m.color, 34), fontSize: 12 }}>{m.initials}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.firstName} {m.lastName}</div>
                  <div style={{ fontSize: 11, color: pal.inkDim }}>{m.email || `${m.firstName.toLowerCase()}.${m.lastName.toLowerCase()}@example.de`}</div>
                </div>
              </div>
              <span style={badge(m.role === 'admin' || m.role === 'kassenwart' ? 'navy' : m.role === 'präsident' ? 'amber' : 'cream', { fontSize: 10 })}>
                {ROLE_LABELS[m.role] || m.role}
              </span>
              <span style={{ fontSize: 12, color: pal.inkDim }}>
                {m.debt === 0 ? '10.06.2026' : m.debt < 5 ? '20.05.2026' : '—'}
              </span>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block', padding: '3px 10px', borderRadius: 100,
                  background: debtBg, color: debtColor,
                  fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}>
                  {m.debt === 0 ? '✓' : fmt(m.debt)}
                </span>
              </div>
              <span style={{ color: pal.inkDim, fontSize: 16, textAlign: 'right' }}>›</span>
            </div>
          );
        })}
      </div>

      {/* Member detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : ''} width={520}>
        {selectedMember && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ ...avatar(selectedMember.color, 56), fontSize: 18 }}>{selectedMember.initials}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedMember.firstName} {selectedMember.lastName}</div>
                <div style={{ fontSize: 12, color: pal.inkDim, marginTop: 3 }}>Mitglied seit 2022 · {ROLE_LABELS[selectedMember.role]}</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: selectedMember.debt > 0 ? pal.terra : pal.sage, fontVariantNumeric: 'tabular-nums' }}>
                  {selectedMember.debt > 0 ? fmt(selectedMember.debt) : '✓ Bezahlt'}
                </div>
                <div style={{ fontSize: 10, color: pal.inkDim, textAlign: 'right', marginTop: 2 }}>Offene Schulden</div>
              </div>
            </div>

            {/* Open debts */}
            <h3 style={{ fontSize: 12, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em', marginBottom: 10 }}>OFFENE POSTEN</h3>
            {selectedMember.debt > 0 ? (
              <>
                {[
                  { desc: 'Monatsbeitrag Juni 2026', amount: 5.00, due: '21.06.2026', type: 'monthly_fee' },
                  { desc: 'Strafen Kegelabend 09.06.', amount: selectedMember.debt - 5.00, due: '21.06.2026', type: 'penalty' },
                ].filter(d => d.amount > 0).map((d, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10, background: pal.bg,
                    marginBottom: 6,
                  }}>
                    <span style={badge(d.type === 'monthly_fee' ? 'navy' : 'terra', { fontSize: 9 })}>
                      {d.type === 'monthly_fee' ? 'Beitrag' : 'Strafe'}
                    </span>
                    <span style={{ flex: 1, fontSize: 12 }}>{d.desc}</span>
                    <span style={{ fontSize: 12, color: pal.inkDim }}>Frist {d.due}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: pal.terra, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.amount)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button style={btn('ghost', { flex: 1, justifyContent: 'center', fontSize: 12 })}>Manuelle Strafe</button>
                  <button style={btn('sage', { flex: 1, justifyContent: 'center', fontSize: 12 })}>Als bezahlt markieren</button>
                </div>
              </>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: pal.inkDim, fontSize: 13 }}>
                ✓ Keine offenen Schulden
              </div>
            )}

            {selectedMember.iban && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${pal.cardEdge}` }}>
                <div style={{ fontSize: 10, color: pal.inkDim, fontWeight: 700, marginBottom: 4 }}>HINTERLEGTE IBAN</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{selectedMember.iban}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
