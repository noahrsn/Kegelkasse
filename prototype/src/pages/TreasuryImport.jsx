import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pal, card, btn, badge, avatar } from '../design/calm.js';
import { csvImportPreview, getMember, fmt } from '../mock/data.js';

export default function TreasuryImport() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('upload');
  const [rows, setRows] = useState(csvImportPreview.map(r => ({ ...r, confirmed: r.confidence === 'iban', assignedUserId: r.matchedUserId })));

  const matchCount = rows.filter(r => r.confirmed).length;
  const total = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/treasury')} style={btn('ghost', { fontSize: 12, padding: '7px 12px' })}>← Zurück</button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>CSV-Import</h1>
          <p style={{ fontSize: 12, color: pal.inkSoft, marginTop: 2 }}>Sparkasse-Kontoauszug importieren</p>
        </div>
      </div>

      {/* Progress steps */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28 }}>
        {[['upload', 'Hochladen'], ['preview', 'Vorschau & Zuordnung'], ['done', 'Abschließen']].map(([s, l], i) => (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ flex: 1, height: 2, background: stage === 'upload' && i > 0 ? pal.cardEdge : pal.sage, alignSelf: 'center', margin: '0 4px' }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                background: ['upload', 'preview', 'done'].indexOf(stage) >= i ? pal.sage : pal.cardEdge,
                color: ['upload', 'preview', 'done'].indexOf(stage) >= i ? '#fff' : pal.inkDim,
                display: 'grid', placeItems: 'center',
              }}>{i + 1}</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: stage === s ? pal.ink : pal.inkDim }}>{l}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {stage === 'upload' && (
        <div style={card({ alignItems: 'center', padding: 48, textAlign: 'center' })}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>CSV-Datei auswählen</h2>
          <p style={{ fontSize: 13, color: pal.inkSoft, maxWidth: 400, marginBottom: 24 }}>
            Exportiere den Kontoauszug aus dem Sparkassen-Online-Banking als CSV und lade ihn hier hoch.
          </p>
          <button
            onClick={() => setStage('preview')}
            style={btn('dark', { fontSize: 13, padding: '11px 24px' })}
          >Beispieldatei laden →</button>
          <p style={{ fontSize: 11, color: pal.inkDim, marginTop: 12 }}>Für den Prototyp wird eine Demo-CSV geladen</p>
        </div>
      )}

      {stage === 'preview' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ ...card({ background: pal.sageBg, padding: '10px 16px' }), border: 'none', flex: 1 }}>
              <div style={{ fontSize: 10, color: pal.sage, fontWeight: 700 }}>ERKANNT</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: pal.sage }}>{rows.length} Buchungen</div>
            </div>
            <div style={{ ...card({ background: pal.amberBg, padding: '10px 16px' }), border: 'none', flex: 1 }}>
              <div style={{ fontSize: 10, color: pal.amber, fontWeight: 700 }}>ZUGEORDNET</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: pal.amber }}>{matchCount} / {rows.length}</div>
            </div>
            <div style={{ ...card({ padding: '10px 16px' }), flex: 1 }}>
              <div style={{ fontSize: 10, color: pal.inkDim, fontWeight: 700 }}>GESAMTEINNAHMEN</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: pal.sage }}>{fmt(total)}</div>
            </div>
          </div>

          <div style={card({ gap: 0, padding: 0, overflow: 'hidden', marginBottom: 16 })}>
            <div style={{
              display: 'grid', gridTemplateColumns: '70px 1fr 1fr 110px 80px',
              padding: '10px 14px', borderBottom: `1px solid ${pal.cardEdge}`,
              fontSize: 10, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em',
            }}>
              <span>DATUM</span><span>NAME</span><span>ZUORDNUNG</span><span>BETRAG</span><span></span>
            </div>

            {rows.map((row, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '70px 1fr 1fr 110px 80px',
                alignItems: 'center', gap: 8, padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
                background: row.amount < 0 ? `${pal.terraBg}44` : 'transparent',
              }}>
                <span style={{ fontSize: 11, color: pal.inkDim }}>{row.date}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{row.name}</div>
                  {row.desc && <div style={{ fontSize: 10, color: pal.inkDim, marginTop: 1 }}>{row.desc}</div>}
                </div>
                <div>
                  {row.confidence === 'iban' && row.assignedUserId && (
                    <span style={{ ...badge('sage', { fontSize: 10 }), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ✓ IBAN · {getMember(row.assignedUserId)?.firstName} {getMember(row.assignedUserId)?.lastName}
                    </span>
                  )}
                  {row.confidence === 'name' && (
                    <span style={{ ...badge('amber', { fontSize: 10 }), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ? Name-Match (prüfen)
                    </span>
                  )}
                  {row.confidence === 'expense' && (
                    <span style={badge('terra', { fontSize: 10 })}>Ausgabe</span>
                  )}
                  {row.confidence === 'none' && (
                    <select style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: `1px solid ${pal.cardEdge}`, fontFamily: 'inherit' }}>
                      <option value="">— nicht zugeordnet</option>
                    </select>
                  )}
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: row.amount > 0 ? pal.sage : pal.terra,
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                }}>
                  {row.amount > 0 ? '+' : ''}{fmt(Math.abs(row.amount))}
                </span>
                <span style={badge(
                  row.confirmed ? 'sage' : row.confidence === 'none' ? 'cream' : 'amber',
                  { fontSize: 9, textAlign: 'center' }
                )}>
                  {row.confirmed ? 'Bestätigt' : row.confidence === 'none' ? 'Offen' : 'Prüfen'}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setStage('upload')} style={btn('ghost')}>Zurück</button>
            <button onClick={() => setStage('done')} style={btn('sage', { fontSize: 13 })}>
              {matchCount} Buchungen importieren →
            </button>
          </div>
        </>
      )}

      {stage === 'done' && (
        <div style={card({ alignItems: 'center', padding: 48, textAlign: 'center' })}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: pal.sageBg,
            display: 'grid', placeItems: 'center', fontSize: 28, margin: '0 auto 16px',
          }}>✓</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: pal.sage }}>Import erfolgreich</h2>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginBottom: 6 }}>
            {matchCount} Buchungen importiert · {rows.filter(r => r.confidence === 'none').length} offen
          </p>
          <p style={{ fontSize: 12, color: pal.inkDim, marginBottom: 24 }}>
            Offene Buchungen können im Kassenbuch manuell zugeordnet werden.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/members')} style={btn('ghost')}>Schulden ansehen</button>
            <button onClick={() => navigate('/treasury')} style={btn('dark')}>Zum Kassenbuch →</button>
          </div>
        </div>
      )}
    </div>
  );
}
