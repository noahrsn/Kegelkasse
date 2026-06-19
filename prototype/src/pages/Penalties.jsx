import React, { useState } from 'react';
import { pal, card, btn, badge } from '../design/calm.js';
import { penalties as initialPenalties, fmt } from '../mock/data.js';
import Modal from '../components/Modal.jsx';

export default function Penalties() {
  const [items, setItems] = useState(initialPenalties);
  const [showAdd, setShowAdd] = useState(false);
  const [newPenalty, setNewPenalty] = useState({ name: '', amount: '', icon: '🎳' });

  const toggle = (id) => setItems(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));

  const ICONS = ['🎳', '🚫', '⏰', '📱', '😤', '🚶', '❌', '📜', '🍺', '💬', '🎯', '⛳'];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Strafenkatalog</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>
            {items.filter(p => p.active).length} aktive Strafen
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={btn('dark', { fontSize: 12 })}>+ Neue Strafe</button>
      </div>

      <div style={card({ gap: 0, padding: 0, overflow: 'hidden', marginBottom: 16 })}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${pal.cardEdge}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em' }}>AKTIVE STRAFEN</span>
        </div>
        {items.filter(p => p.active).map((p, i, arr) => (
          <PenaltyRow key={p.id} penalty={p} onToggle={toggle} last={i === arr.length - 1} />
        ))}
      </div>

      {items.filter(p => !p.active).length > 0 && (
        <div style={card({ gap: 0, padding: 0, overflow: 'hidden' })}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${pal.cardEdge}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, letterSpacing: '0.04em' }}>DEAKTIVIERT</span>
          </div>
          {items.filter(p => !p.active).map((p, i, arr) => (
            <PenaltyRow key={p.id} penalty={p} onToggle={toggle} last={i === arr.length - 1} inactive />
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Neue Strafe" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, marginBottom: 6 }}>ICON</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setNewPenalty(p => ({ ...p, icon: ic }))}
                  style={{
                    width: 38, height: 38, borderRadius: 10, fontSize: 18,
                    border: `2px solid ${newPenalty.icon === ic ? pal.ink : pal.cardEdge}`,
                    background: newPenalty.icon === ic ? pal.bg : 'transparent',
                    cursor: 'pointer',
                  }}
                >{ic}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, marginBottom: 6 }}>BEZEICHNUNG</div>
            <input
              value={newPenalty.name}
              onChange={e => setNewPenalty(p => ({ ...p, name: e.target.value }))}
              placeholder="z.B. Handy klingelt"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${pal.cardEdge}`, background: pal.card, fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, marginBottom: 6 }}>BETRAG (€)</div>
            <input
              type="number"
              step="0.10"
              value={newPenalty.amount}
              onChange={e => setNewPenalty(p => ({ ...p, amount: e.target.value }))}
              placeholder="0,50"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${pal.cardEdge}`, background: pal.card, fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(false)} style={btn('ghost', { flex: 1, justifyContent: 'center' })}>Abbrechen</button>
            <button
              onClick={() => {
                if (newPenalty.name && newPenalty.amount) {
                  setItems(prev => [...prev, { id: `p-new-${Date.now()}`, ...newPenalty, amount: parseFloat(newPenalty.amount), active: true }]);
                  setNewPenalty({ name: '', amount: '', icon: '🎳' });
                  setShowAdd(false);
                }
              }}
              style={btn('dark', { flex: 2, justifyContent: 'center' })}
            >Hinzufügen</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PenaltyRow({ penalty: p, onToggle, last, inactive }) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(p.amount.toFixed(2));

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px',
      borderBottom: last ? 'none' : `1px solid ${pal.cardEdge}`,
      opacity: inactive ? 0.55 : 1,
    }}>
      <span style={{ fontSize: 22 }}>{p.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
        {!editing ? (
          <div style={{ fontSize: 12, color: pal.terra, fontWeight: 600, marginTop: 2 }}>{p.amount.toFixed(2)} €</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              value={editAmount}
              onChange={e => setEditAmount(e.target.value)}
              style={{ width: 70, padding: '4px 8px', borderRadius: 8, border: `1.5px solid ${pal.ink}`, fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
            />
            <span style={{ fontSize: 12, color: pal.inkSoft }}>€</span>
            <button onClick={() => setEditing(false)} style={btn('dark', { fontSize: 11, padding: '4px 10px' })}>OK</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {!inactive && !editing && (
          <button onClick={() => setEditing(true)} style={btn('ghost', { fontSize: 11, padding: '5px 10px' })}>Bearbeiten</button>
        )}
        <button
          onClick={() => onToggle(p.id)}
          style={btn(inactive ? 'sage' : 'ghost', { fontSize: 11, padding: '5px 10px', color: inactive ? '#fff' : pal.terra })}
        >
          {inactive ? 'Aktivieren' : 'Deaktivieren'}
        </button>
      </div>
    </div>
  );
}
