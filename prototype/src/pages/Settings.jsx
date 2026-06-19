import React, { useState } from 'react';
import { pal, card, btn, badge, avatar, input, label, divider } from '../design/calm.js';
import { group, members, penalties, events, currentUser, fmt } from '../mock/data.js';

const TABS = [
  { id: 'general',    label: 'Allgemein',        role: ['admin', 'präsident', 'kassenwart'] },
  { id: 'finances',   label: 'Finanzen',          role: ['admin', 'kassenwart'] },
  { id: 'catalog',    label: 'Strafenkatalog',    role: ['admin', 'kassenwart'] },
  { id: 'schedule',   label: 'Regeltermine',      role: ['admin', 'präsident'] },
  { id: 'rulebook',   label: 'Vereinsregelwerk',  role: ['admin', 'präsident'] },
  { id: 'members',    label: 'Mitglieder & Rollen', role: ['admin'] },
  { id: 'invite',     label: 'Einladungslink',    role: ['admin', 'präsident'] },
];

export default function Settings() {
  const [tab, setTab] = useState('general');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const visibleTabs = TABS.filter(t => t.role.includes(currentUser.role));

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Club-Einstellungen</h1>
        <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>{group.name}</p>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sidebar tabs */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visibleTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '9px 12px', borderRadius: 10, border: 'none',
                  background: tab === t.id ? pal.ink : 'transparent',
                  color: tab === t.id ? pal.bg : pal.inkSoft,
                  fontFamily: 'inherit', fontSize: 13, fontWeight: tab === t.id ? 600 : 500,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s',
                }}
              >{t.label}</button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {saved && (
            <div style={{
              background: pal.sageBg, borderRadius: 10, padding: '10px 16px',
              fontSize: 13, color: pal.sage, fontWeight: 600, marginBottom: 16,
            }}>✓ Gespeichert</div>
          )}

          {tab === 'general' && <GeneralTab onSave={handleSave} />}
          {tab === 'finances' && <FinancesTab onSave={handleSave} />}
          {tab === 'catalog' && <CatalogTab />}
          {tab === 'schedule' && <ScheduleTab onSave={handleSave} />}
          {tab === 'rulebook' && <RulebookTab onSave={handleSave} />}
          {tab === 'members' && <MembersTab />}
          {tab === 'invite' && <InviteTab />}
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ onSave }) {
  const [name, setName] = useState(group.name);
  return (
    <div style={card()}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Allgemeine Einstellungen</h2>
      <div style={{ marginBottom: 14 }}>
        <span style={label()}>Club-Name</span>
        <input type="text" value={name} onChange={e => setName(e.target.value)} style={input()} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <span style={label()}>Club-Avatar</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: pal.terraBg, color: pal.terra,
            display: 'grid', placeItems: 'center',
            fontSize: 24, fontWeight: 700,
          }}>P</div>
          <button style={btn('ghost', { fontSize: 12 })}>Bild hochladen</button>
        </div>
      </div>
      <button onClick={onSave} style={btn('dark')}>Speichern</button>
    </div>
  );
}

function FinancesTab({ onSave }) {
  const [fee, setFee] = useState(group.monthlyFee.toFixed(2));
  const [feeDay, setFeeDay] = useState(group.feeDay);
  const [iban, setIban] = useState(group.iban);
  const [paypal, setPaypal] = useState(group.paypal);
  const [openingBalance, setOpeningBalance] = useState(group.openingBalance.toFixed(2));
  const [latePaymentFee, setLatePaymentFee] = useState(group.latePaymentFee.toFixed(2));
  const [deadlineType, setDeadlineType] = useState(group.paymentDeadlineType);
  const [deadlineDays, setDeadlineDays] = useState(group.paymentDeadlineDays);

  return (
    <div style={card()}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Finanzen</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <span style={label()}>Monatsbeitrag (€)</span>
          <input type="number" step="0.50" value={fee} onChange={e => setFee(e.target.value)} style={input()} />
        </div>
        <div>
          <span style={label()}>Buchungstag</span>
          <select value={feeDay} onChange={e => setFeeDay(parseInt(e.target.value))} style={{ ...input(), appearance: 'none' }}>
            {[1,5,10,15,20,25].map(d => <option key={d} value={d}>{d}. des Monats</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={label()}>IBAN (Vereinskonto)</span>
        <input type="text" value={iban} onChange={e => setIban(e.target.value)} style={{ ...input(), fontFamily: "'DM Mono', monospace" }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={label()}>PayPal-Link</span>
        <input type="text" value={paypal} onChange={e => setPaypal(e.target.value)} style={input()} />
      </div>

      <div style={divider()} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <span style={label()}>Eröffnungssaldo (€)</span>
          <input type="number" step="1" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} style={input()} />
        </div>
        <div>
          <span style={label()}>Verspätungsstrafe (€)</span>
          <input type="number" step="0.50" value={latePaymentFee} onChange={e => setLatePaymentFee(e.target.value)} style={input()} />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <span style={label()}>Zahlungsfrist-Typ</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['days_before_next_event', 'N Tage vor dem nächsten Kegeltermin (Standard)'],
            ['days_after_booking', 'N Tage ab Buchungsdatum'],
            ['fixed_day_of_month', 'Fester Tag im Monat'],
          ].map(([v, l]) => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="deadline" value={v} checked={deadlineType === v} onChange={() => setDeadlineType(v)} />
              {l}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: pal.inkSoft }}>Anzahl Tage:</span>
          <input type="number" min="0" max="30" value={deadlineDays} onChange={e => setDeadlineDays(parseInt(e.target.value))} style={{ ...input(), width: 80 }} />
        </div>
      </div>

      <button onClick={onSave} style={btn('dark')}>Speichern</button>
    </div>
  );
}

function CatalogTab() {
  return (
    <div style={card()}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Strafenkatalog</h2>
      <p style={{ fontSize: 13, color: pal.inkSoft, marginBottom: 16 }}>
        Bearbeite den Strafenkatalog unter{' '}
        <a href="/penalties" style={{ color: pal.terra, fontWeight: 600, textDecoration: 'none' }}>Strafenkatalog</a>.
      </p>
      {penalties.filter(p => p.active).map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 0', borderBottom: `1px solid ${pal.cardEdge}`,
        }}>
          <span style={{ fontSize: 18 }}>{p.icon}</span>
          <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: pal.terra }}>{p.amount.toFixed(2)} €</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleTab({ onSave }) {
  return (
    <div style={card()}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Regeltermine</h2>
      <p style={{ fontSize: 13, color: pal.inkSoft, marginBottom: 16 }}>
        Wiederkehrende Kegeltermine, die automatisch in den Kalender eingetragen werden.
      </p>
      <div style={{
        padding: '14px 16px', borderRadius: 12,
        background: pal.navyBg, marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: pal.navy }}>Jeden 4. Montag im Monat</div>
        <div style={{ fontSize: 12, color: pal.navy, opacity: 0.75, marginTop: 3 }}>19:30 Uhr · Bahn 3+4 · RSVP: opt-out</div>
      </div>
      <button style={btn('ghost', { fontSize: 12 })}>+ Neuen Regeltermin anlegen</button>
      <div style={divider()} />
      <button onClick={onSave} style={btn('dark')}>Speichern</button>
    </div>
  );
}

function RulebookTab({ onSave }) {
  const [content, setContent] = useState(`# Vereinsregelwerk KC Pin Royal\n\n## §1 Strafen\n\nJeder Pudel kostet 0,10 €. Rinnenwürfe ebenfalls...\n\n## §2 Monatsbeiträge\n\nDer monatliche Beitrag beträgt 5,00 € und wird am 1. des Monats fällig.\n\n## §3 Verhaltensregeln\n\nRespektvoller Umgang wird von allen Mitgliedern erwartet.`);

  return (
    <div style={card()}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Vereinsregelwerk</h2>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        style={{
          width: '100%', padding: '14px', borderRadius: 12,
          border: `1.5px solid ${pal.cardEdge}`, background: pal.bg,
          fontFamily: "'DM Mono', monospace", fontSize: 12, color: pal.ink, outline: 'none',
          resize: 'vertical', minHeight: 300, lineHeight: 1.6,
        }}
      />
      <p style={{ fontSize: 11, color: pal.inkDim, marginTop: 8, marginBottom: 14 }}>Markdown wird unterstützt. Änderungen werden im Aktivitätslog festgehalten.</p>
      <button onClick={onSave} style={btn('dark')}>Regelwerk speichern</button>
    </div>
  );
}

function MembersTab() {
  return (
    <div style={card({ gap: 0, padding: 0, overflow: 'hidden' })}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${pal.cardEdge}` }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Mitglieder & Rollen</h2>
      </div>
      {members.map((m, i) => (
        <div key={m.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderBottom: i < members.length - 1 ? `1px solid ${pal.cardEdge}` : 'none',
        }}>
          <div style={{ ...avatar(m.color, 32), fontSize: 11 }}>{m.initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.firstName} {m.lastName}</div>
          </div>
          <select
            defaultValue={m.role}
            style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${pal.cardEdge}`, fontFamily: 'inherit', fontSize: 12, background: pal.card }}
          >
            <option value="admin">Admin</option>
            <option value="präsident">Präsident</option>
            <option value="kassenwart">Kassenwart</option>
            <option value="mitglied">Mitglied</option>
          </select>
          <button style={{ ...btn('ghost', { fontSize: 11, color: pal.terra }) }}>Entfernen</button>
        </div>
      ))}
    </div>
  );
}

function InviteTab() {
  const [copied, setCopied] = useState(false);
  const link = 'https://kegelkasse.app/join/pin-royal-abc123xyz';

  return (
    <div style={card()}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Einladungslink</h2>
      <p style={{ fontSize: 13, color: pal.inkSoft, marginBottom: 20 }}>
        Teile diesen Link, um neue Mitglieder einzuladen. Jeder mit dem Link kann dem Club beitreten.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        border: `1.5px solid ${pal.cardEdge}`, borderRadius: 12, overflow: 'hidden',
        background: pal.bg, marginBottom: 14,
      }}>
        <span style={{ flex: 1, padding: '11px 14px', fontFamily: "'DM Mono', monospace", fontSize: 12, color: pal.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {link}
        </span>
        <button
          onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{
            ...btn('dark', { borderRadius: 0, fontSize: 12, padding: '11px 16px' }),
            flexShrink: 0,
          }}
        >{copied ? '✓ Kopiert!' : 'Kopieren'}</button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btn('ghost', { fontSize: 12 })}>Per E-Mail versenden</button>
        <button style={btn('terra', { fontSize: 12 })}>Link zurücksetzen</button>
      </div>

      <div style={divider()} />

      <div style={{
        padding: '14px', borderRadius: 12, background: pal.bg,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 120, height: 120, background: pal.card, borderRadius: 8,
          border: `1px solid ${pal.cardEdge}`, display: 'grid', placeItems: 'center',
          fontSize: 11, color: pal.inkDim,
        }}>QR-Code</div>
        <span style={{ fontSize: 11, color: pal.inkDim }}>QR-Code zum Vorzeigen beim nächsten Treffen</span>
      </div>
    </div>
  );
}
