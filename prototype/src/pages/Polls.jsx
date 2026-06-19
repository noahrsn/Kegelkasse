import React, { useState } from 'react';
import { pal, card, colorCard, btn, badge, avatar } from '../design/calm.js';
import { polls, getMember, currentUser } from '../mock/data.js';
import Modal from '../components/Modal.jsx';

export default function Polls() {
  const [tab, setTab] = useState('open');
  const [items, setItems] = useState(polls);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newPoll, setNewPoll] = useState({ question: '', options: ['', ''] });

  const open = items.filter(p => p.status === 'open');
  const closed = items.filter(p => p.status === 'closed');

  const vote = (pollId, optionId) => {
    setItems(prev => prev.map(p => {
      if (p.id !== pollId) return p;
      const alreadyVoted = p.myVote;
      const updated = {
        ...p,
        myVote: alreadyVoted === optionId ? null : optionId,
        options: p.options.map(o => ({
          ...o,
          votes: alreadyVoted === o.id
            ? o.votes - 1
            : o.id === optionId
              ? o.votes + 1 + (alreadyVoted !== null ? 0 : 0)
              : o.votes,
        })),
      };
      return updated;
    }));
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Abstimmungen</h1>
          <p style={{ fontSize: 13, color: pal.inkSoft, marginTop: 3 }}>
            {open.length} offen · {closed.length} abgeschlossen
          </p>
        </div>
        <button onClick={() => setShowNew(true)} style={btn('dark', { fontSize: 12 })}>+ Neue Abstimmung</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: pal.card, borderRadius: 12, padding: 4, border: `1px solid ${pal.cardEdge}`, width: 'fit-content' }}>
        {[['open', `Offen (${open.length})`], ['closed', `Abgeschlossen (${closed.length})`]].map(([t, l]) => (
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(tab === 'open' ? open : closed).map(poll => (
          <PollCard
            key={poll.id}
            poll={poll}
            onVote={(optId) => vote(poll.id, optId)}
            onExpand={() => setSelected(poll)}
          />
        ))}
        {(tab === 'open' ? open : closed).length === 0 && (
          <div style={{ textAlign: 'center', color: pal.inkSoft, fontSize: 13, padding: '40px 0' }}>
            {tab === 'open' ? 'Keine offenen Abstimmungen.' : 'Noch keine abgeschlossenen Abstimmungen.'}
          </div>
        )}
      </div>

      {/* New poll modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Neue Abstimmung" width={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, marginBottom: 6 }}>FRAGE</div>
            <input
              value={newPoll.question}
              onChange={e => setNewPoll(p => ({ ...p, question: e.target.value }))}
              placeholder="Worüber soll abgestimmt werden?"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${pal.cardEdge}`, background: pal.bg, fontFamily: 'inherit', fontSize: 13, outline: 'none', color: pal.ink }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.inkDim, marginBottom: 8 }}>ANTWORTOPTIONEN</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {newPoll.options.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={opt}
                    onChange={e => setNewPoll(p => ({ ...p, options: p.options.map((o, j) => j === i ? e.target.value : o) }))}
                    placeholder={`Option ${i + 1}`}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${pal.cardEdge}`, background: pal.bg, fontFamily: 'inherit', fontSize: 13, outline: 'none', color: pal.ink }}
                  />
                  {newPoll.options.length > 2 && (
                    <button
                      onClick={() => setNewPoll(p => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                      style={{ ...btn('ghost', { fontSize: 11, padding: '0 10px', color: pal.terra }) }}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
            {newPoll.options.length < 5 && (
              <button
                onClick={() => setNewPoll(p => ({ ...p, options: [...p.options, ''] }))}
                style={{ ...btn('ghost', { fontSize: 12, marginTop: 8 }) }}
              >+ Option hinzufügen</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNew(false)} style={btn('ghost', { flex: 1, justifyContent: 'center' })}>Abbrechen</button>
            <button
              onClick={() => {
                const filled = newPoll.options.filter(o => o.trim());
                if (newPoll.question && filled.length >= 2) {
                  setItems(prev => [{
                    id: `poll-${Date.now()}`,
                    question: newPoll.question,
                    status: 'open',
                    createdBy: currentUser.id,
                    createdAt: new Date().toISOString().slice(0, 10),
                    deadline: null,
                    myVote: null,
                    totalVoters: 12,
                    options: filled.map((o, i) => ({ id: `new-o${i}`, text: o, votes: 0, voters: [] })),
                  }, ...prev]);
                  setNewPoll({ question: '', options: ['', ''] });
                  setShowNew(false);
                  setTab('open');
                }
              }}
              style={btn('dark', { flex: 2, justifyContent: 'center' })}
            >Abstimmung starten</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PollCard({ poll, onVote, onExpand }) {
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const maxVotes = Math.max(...poll.options.map(o => o.votes), 1);
  const creator = getMember(poll.createdBy);

  return (
    <div style={card({ gap: 0 })}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={badge(poll.status === 'open' ? 'sage' : 'cream')}>
              {poll.status === 'open' ? '● Offen' : '✓ Abgeschlossen'}
            </span>
            {poll.myVote && <span style={badge('navy', { fontSize: 9 })}>Abgestimmt</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{poll.question}</div>
        </div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {poll.options.map(opt => {
          const pct = total > 0 ? opt.votes / total : 0;
          const isMyVote = poll.myVote === opt.id;
          const isWinner = poll.status === 'closed' && opt.votes === maxVotes;

          return (
            <button
              key={opt.id}
              onClick={() => poll.status === 'open' && onVote(opt.id)}
              disabled={poll.status === 'closed'}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                borderRadius: 10, border: `1.5px solid ${isMyVote ? pal.navy : isWinner ? pal.sage : pal.cardEdge}`,
                background: isWinner ? pal.sageBg : isMyVote ? pal.navyBg : pal.bg,
                position: 'relative', overflow: 'hidden',
                fontFamily: 'inherit', cursor: poll.status === 'open' ? 'pointer' : 'default',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                width: `${pct * 100}%`,
                background: isWinner ? `${pal.sage}22` : isMyVote ? `${pal.navy}18` : `${pal.cardEdge}66`,
                transition: 'width 0.4s ease',
                borderRadius: 10,
              }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: isMyVote || isWinner ? 700 : 500, color: isMyVote ? pal.navy : pal.ink }}>
                  {isWinner && '🏆 '}{opt.text}
                  {isMyVote && <span style={{ fontSize: 10, color: pal.navy, fontWeight: 600, marginLeft: 6 }}>Deine Wahl</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pal.inkSoft, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {opt.votes} ({Math.round(pct * 100)} %)
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${pal.cardEdge}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {creator && (
            <>
              <div style={{ ...(() => {
                const s = { width: 18, height: 18, borderRadius: '50%', background: creator.color + '33', color: creator.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700 };
                return s;
              })() }}>{creator.initials}</div>
              <span style={{ fontSize: 11, color: pal.inkDim }}>{creator.firstName} {creator.lastName[0]}. · {poll.createdAt}</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: pal.inkDim }}>{total} von {poll.totalVoters} Stimmen</span>
          {poll.deadline && (
            <span style={{ fontSize: 11, color: pal.amber, fontWeight: 600 }}>Bis {poll.deadline}</span>
          )}
        </div>
      </div>
    </div>
  );
}
