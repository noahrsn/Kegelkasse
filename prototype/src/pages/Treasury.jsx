import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, colorCard, btn, badge } from '../design/calm.js';
import { transactions, kassenstand, group, fmt, fmtDate } from '../mock/data.js';

const CATEGORY_LABELS = {
  member_payment: 'Mitglied',
  event_expense: 'Event',
  equipment_expense: 'Ausstattung',
  other_income: 'Sonstiges',
  other_expense: 'Sonstiges',
};

export default function Treasury() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? transactions
    : transactions.filter(t => t.type === filter);

  const income30 = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense30 = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Kassenbuch</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>Alle Buchungen des Vereinskontos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/treasury/import')} style={btn('ghost', { fontSize: 12 })}>
            ↑ CSV-Import
          </button>
          <button onClick={() => {}} style={btn('dark', { fontSize: 12 })}>
            + Buchung
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
        <div style={colorCard(pal.ink, { color: pal.bg })}>
          <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 700, letterSpacing: '0.04em' }}>KASSENSTAND</span>
          <div style={{
            fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em',
            fontVariantNumeric: 'tabular-nums', marginTop: 8, lineHeight: 1,
          }}>
            {fmt(kassenstand).replace(' €', '')}
            <span style={{ fontWeight: 400, fontSize: 20, opacity: 0.6 }}> €</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
            Eröffnungssaldo {fmt(group.openingBalance)} · {group.openingBalanceDate}
          </div>
        </div>

        <div style={colorCard(pal.sageBg)}>
          <span style={{ fontSize: 10, color: pal.sage, fontWeight: 700, letterSpacing: '0.04em' }}>EINNAHMEN</span>
          <div style={{ fontSize: 30, fontWeight: 700, color: pal.sage, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            +{fmt(income30).replace(' €', '')}<span style={{ fontSize: 16, fontWeight: 400 }}> €</span>
          </div>
          <div style={{ fontSize: 11, color: pal.sage, opacity: 0.7, marginTop: 4 }}>letzte 30 Tage</div>
        </div>

        <div style={colorCard(pal.terraBg)}>
          <span style={{ fontSize: 10, color: pal.terra, fontWeight: 700, letterSpacing: '0.04em' }}>AUSGABEN</span>
          <div style={{ fontSize: 30, fontWeight: 700, color: pal.terra, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            −{fmt(expense30).replace(' €', '')}<span style={{ fontSize: 16, fontWeight: 400 }}> €</span>
          </div>
          <div style={{ fontSize: 11, color: pal.terra, opacity: 0.7, marginTop: 4 }}>letzte 30 Tage</div>
        </div>
      </div>

      {/* Staleness warning */}
      <div style={{
        background: pal.amberBg, borderRadius: 12, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
        border: `1px solid rgba(176,126,42,0.2)`,
      }}>
        <span style={{ fontSize: 15 }}>⚠️</span>
        <span style={{ fontSize: 12, color: pal.inkSoft }}>
          Kassenstand möglicherweise veraltet — letzter CSV-Import: <strong>10.06.2026</strong>
        </span>
        <button onClick={() => navigate('/treasury/import')} style={{ ...btn('ghost', { fontSize: 11 }), marginLeft: 'auto' }}>
          Jetzt importieren
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['all', 'Alle'], ['income', 'Einnahmen'], ['expense', 'Ausgaben']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            style={{
              padding: '7px 14px', borderRadius: 100,
              background: filter === v ? pal.ink : pal.card,
              color: filter === v ? pal.bg : pal.inkSoft,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${filter === v ? pal.ink : pal.cardEdge}`,
            }}
          >{l}</button>
        ))}
      </div>

      {/* Transaction list */}
      <div style={{ ...card(), gap: 0, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${pal.cardEdge}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: pal.inkSoft }}>{filtered.length} Buchungen</span>
        </div>
        {filtered.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px',
              borderBottom: i < filtered.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0,
              background: t.type === 'income' ? pal.sageBg : pal.terraBg,
              color: t.type === 'income' ? pal.sage : pal.terra,
              display: 'grid', placeItems: 'center', fontSize: 15,
            }}>
              {t.type === 'income' ? '↓' : '↑'}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: pal.ink }}>
                {t.description}
              </div>
              <div style={{ fontSize: 11, color: pal.inkDim, marginTop: 2, display: 'flex', gap: 8 }}>
                <span>{fmtDate(t.date)}</span>
                <span>·</span>
                <span style={badge(
                  t.category === 'member_payment' ? 'sage'
                  : t.category.includes('expense') ? 'terra' : 'navy',
                  { fontSize: 9, padding: '2px 7px' }
                )}>{CATEGORY_LABELS[t.category] || t.category}</span>
                {t.source === 'csv_import' && <span style={badge('cream', { fontSize: 9, padding: '2px 7px' })}>CSV</span>}
              </div>
            </div>

            <div style={{
              fontSize: 16, fontWeight: 700,
              color: t.type === 'income' ? pal.sage : pal.terra,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}>
              {t.type === 'income' ? '+' : '−'}{fmt(t.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
