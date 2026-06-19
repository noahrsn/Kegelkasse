import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { pal, card, btn, badge, avatar } from '../design/calm.js';
import { members, penalties, sessionParticipants, sessions, getMember, fmt } from '../mock/data.js';
import { BottomSheet } from '../components/Modal.jsx';
import Modal from '../components/Modal.jsx';

export default function SessionRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = sessions.find(s => s.id === id) || sessions[0];
  const isPending = session.status === 'submitted';

  const [participants, setParticipants] = useState(
    sessionParticipants.map(p => ({ ...p, penaltyCounts: Object.fromEntries(p.penalties.map(x => [x.id, x.count])) }))
  );
  const [selectedMember, setSelectedMember] = useState(null);
  const [showLateModal, setShowLateModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [submitted, setSubmitted] = useState(isPending);

  const totalAmount = participants.reduce((sum, p) => {
    return sum + p.penalties.reduce((s, pen) => {
      const cat = penalties.find(x => x.id === pen.id);
      const count = p.penaltyCounts[pen.id] ?? pen.count;
      return s + (cat ? cat.amount * count : 0);
    }, 0);
  }, 0);

  const getMemberPenaltyTotal = (p) => {
    return p.penalties.reduce((s, pen) => {
      const cat = penalties.find(x => x.id === pen.id);
      const count = p.penaltyCounts[pen.id] ?? pen.count;
      return s + (cat ? cat.amount * count : 0);
    }, 0);
  };

  const addPenalty = (memberId, penaltyId) => {
    setParticipants(prev => prev.map(p => {
      if (p.userId !== memberId) return p;
      const existing = p.penalties.find(x => x.id === penaltyId);
      if (existing) {
        return { ...p, penaltyCounts: { ...p.penaltyCounts, [penaltyId]: (p.penaltyCounts[penaltyId] ?? existing.count) + 1 } };
      } else {
        const cat = penalties.find(x => x.id === penaltyId);
        return { ...p, penalties: [...p.penalties, { id: penaltyId, count: 1, amount: cat.amount }], penaltyCounts: { ...p.penaltyCounts, [penaltyId]: 1 } };
      }
    }));
  };

  const removePenalty = (memberId, penaltyId) => {
    setParticipants(prev => prev.map(p => {
      if (p.userId !== memberId) return p;
      const current = p.penaltyCounts[penaltyId] ?? 0;
      if (current <= 1) {
        return { ...p, penalties: p.penalties.filter(x => x.id !== penaltyId), penaltyCounts: { ...p.penaltyCounts, [penaltyId]: 0 } };
      }
      return { ...p, penaltyCounts: { ...p.penaltyCounts, [penaltyId]: current - 1 } };
    }));
  };

  const selectedParticipant = selectedMember ? participants.find(p => p.userId === selectedMember) : null;
  const selectedMemberData = selectedMember ? getMember(selectedMember) : null;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/sessions')} style={btn('ghost', { fontSize: 12, padding: '7px 12px', flexShrink: 0 })}>← Zurück</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Kegelabend</h1>
            <span style={badge(submitted ? 'amber' : 'cream')}>
              {submitted ? 'Eingereicht' : 'Entwurf'}
            </span>
          </div>
          <p style={{ fontSize: 12, color: pal.inkSoft, marginTop: 2 }}>
            {new Date(session.date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}{participants.length} Teilnehmer · Σ {fmt(totalAmount)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!submitted && (
            <>
              <button onClick={() => setShowLateModal(true)} style={btn('ghost', { fontSize: 12 })}>
                + Nachzügler
              </button>
              <button onClick={() => setShowSubmitModal(true)} style={btn('dark', { fontSize: 12 })}>
                Einreichen →
              </button>
            </>
          )}
          {submitted && isPending && (
            <button onClick={() => setShowApproveModal(true)} style={btn('sage', { fontSize: 12 })}>
              ✓ Genehmigen
            </button>
          )}
        </div>
      </div>

      {/* Participant list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {participants.map(p => {
          const m = getMember(p.userId);
          if (!m) return null;
          const memberTotal = getMemberPenaltyTotal(p);

          return (
            <div
              key={p.userId}
              onClick={() => !submitted && setSelectedMember(p.userId)}
              style={{
                ...card({ flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: '14px 16px' }),
                cursor: submitted ? 'default' : 'pointer',
                border: selectedMember === p.userId ? `2px solid ${pal.ink}` : `1px solid ${pal.cardEdge}`,
                transition: 'box-shadow 0.12s',
              }}
              onMouseEnter={e => !submitted && (e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ position: 'relative' }}>
                <div style={{ ...avatar(m.color, 38), fontSize: 13 }}>{m.initials}</div>
                {p.isLate && (
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: pal.terra, color: '#fff',
                    fontSize: 9, display: 'grid', placeItems: 'center',
                    border: `2px solid ${pal.card}`,
                  }}>⏰</div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{m.firstName} {m.lastName}</span>
                  {p.isLate && <span style={badge('terra', { fontSize: 9 })}>Nachzügler</span>}
                </div>

                {p.penalties.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                    {p.penalties.map(pen => {
                      const cat = penalties.find(x => x.id === pen.id);
                      const count = p.penaltyCounts[pen.id] ?? pen.count;
                      if (!cat || count === 0) return null;
                      return (
                        <div
                          key={pen.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 8,
                            background: pal.terraBg,
                          }}
                        >
                          <span style={{ fontSize: 12 }}>{cat.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: pal.terra }}>{count}× {cat.name}</span>
                          {!submitted && (
                            <div style={{ display: 'flex', gap: 2, marginLeft: 2 }}>
                              <button
                                onClick={e => { e.stopPropagation(); removePenalty(p.userId, pen.id); }}
                                style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(181,101,70,0.2)', color: pal.terra, cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'grid', placeItems: 'center' }}
                              >−</button>
                              <button
                                onClick={e => { e.stopPropagation(); addPenalty(p.userId, pen.id); }}
                                style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(181,101,70,0.2)', color: pal.terra, cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'grid', placeItems: 'center' }}
                              >+</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: pal.inkDim, marginTop: 4 }}>
                    {submitted ? 'Keine Strafen' : 'Tippen zum Strafen erfassen'}
                  </p>
                )}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 700,
                  color: memberTotal > 0 ? pal.terra : pal.inkDim,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {memberTotal > 0 ? fmt(memberTotal) : '—'}
                </div>
                {!submitted && (
                  <div style={{ fontSize: 10, color: pal.inkDim, marginTop: 2 }}>tippen</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals bar */}
      <div style={{
        marginTop: 16, ...card({ flexDirection: 'row', alignItems: 'center', background: pal.ink, gap: 20 }),
        border: 'none', color: pal.bg,
      }}>
        <span style={{ fontSize: 13, flex: 1, opacity: 0.75 }}>Gesamtsumme Strafen</span>
        <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAmount)}</span>
      </div>

      {/* Penalty sheet */}
      <BottomSheet
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        title={selectedMemberData ? `Strafen: ${selectedMemberData.firstName} ${selectedMemberData.lastName}` : ''}
      >
        {selectedParticipant && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {penalties.filter(p => p.active).map(pen => {
                const count = selectedParticipant.penaltyCounts[pen.id] ?? 0;
                return (
                  <div key={pen.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    background: count > 0 ? pal.terraBg : pal.bg,
                    border: `1px solid ${count > 0 ? 'rgba(181,101,70,0.25)' : pal.cardEdge}`,
                    transition: 'all 0.12s',
                  }}>
                    <span style={{ fontSize: 20 }}>{pen.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{pen.name}</div>
                      <div style={{ fontSize: 11, color: pal.terra, fontWeight: 600 }}>{fmt(pen.amount)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => removePenalty(selectedMember, pen.id)}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', border: 'none',
                          background: count > 0 ? pal.terra : pal.cardEdge,
                          color: count > 0 ? '#fff' : pal.inkDim, cursor: 'pointer',
                          fontSize: 16, lineHeight: 1, display: 'grid', placeItems: 'center',
                        }}
                      >−</button>
                      <span style={{ width: 24, textAlign: 'center', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {count}
                      </span>
                      <button
                        onClick={() => addPenalty(selectedMember, pen.id)}
                        style={{
                          width: 28, height: 28, borderRadius: '50%', border: 'none',
                          background: pal.ink, color: pal.bg, cursor: 'pointer',
                          fontSize: 16, lineHeight: 1, display: 'grid', placeItems: 'center',
                        }}
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setSelectedMember(null)}
              style={btn('dark', { width: '100%', justifyContent: 'center', padding: '12px', borderRadius: 12 })}
            >Fertig</button>
          </>
        )}
      </BottomSheet>

      {/* Late arrival modal */}
      <Modal open={showLateModal} onClose={() => setShowLateModal(false)} title="Nachzügler hinzufügen" width={400}>
        <p style={{ fontSize: 13, color: pal.inkSoft, marginBottom: 14 }}>
          Der Durchschnitt aller bisherigen Strafen wird dem Nachzügler automatisch zugewiesen.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {members
            .filter(m => !participants.find(p => p.userId === m.id))
            .map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setParticipants(prev => [...prev, {
                    userId: m.id, isLate: true,
                    penalties: [{ id: 'p-3', count: 1, amount: 0.50 }],
                    penaltyCounts: { 'p-3': 1 },
                  }]);
                  setShowLateModal(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 12, border: `1px solid ${pal.cardEdge}`, background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = pal.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ ...avatar(m.color, 30), fontSize: 10 }}>{m.initials}</div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{m.firstName} {m.lastName}</span>
              </button>
            ))}
          {members.filter(m => !participants.find(p => p.userId === m.id)).length === 0 && (
            <p style={{ fontSize: 13, color: pal.inkDim, padding: '12px 0' }}>Alle Mitglieder sind bereits dabei.</p>
          )}
        </div>
      </Modal>

      {/* Submit confirm */}
      <Modal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} title="Kegelabend einreichen?" width={400}>
        <p style={{ fontSize: 13, color: pal.inkSoft, marginBottom: 20 }}>
          Der Abend wird zur Genehmigung an den Kassenwart gesendet. Danach können keine Strafen mehr geändert werden.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowSubmitModal(false)} style={btn('ghost', { flex: 1, justifyContent: 'center' })}>Abbrechen</button>
          <button onClick={() => { setSubmitted(true); setShowSubmitModal(false); }} style={btn('dark', { flex: 2, justifyContent: 'center' })}>Einreichen →</button>
        </div>
      </Modal>

      {/* Approve confirm */}
      <Modal open={showApproveModal} onClose={() => setShowApproveModal(false)} title="Kegelabend genehmigen?" width={400}>
        <p style={{ fontSize: 13, color: pal.inkSoft, marginBottom: 8 }}>
          Folgende Schulden werden für alle Teilnehmer gebucht:
        </p>
        <div style={{ ...card({ background: pal.sageBg, padding: '14px 16px', gap: 6, marginBottom: 20 }), border: 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: pal.sage }}>Gesamtsumme: {fmt(totalAmount)}</div>
          <div style={{ fontSize: 12, color: pal.inkSoft }}>{participants.length} Teilnehmer · je {fmt(totalAmount / participants.length)} Ø</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowApproveModal(false)} style={btn('ghost', { flex: 1, justifyContent: 'center' })}>Abbrechen</button>
          <button onClick={() => { setShowApproveModal(false); navigate('/sessions'); }} style={btn('sage', { flex: 2, justifyContent: 'center' })}>✓ Genehmigen</button>
        </div>
      </Modal>
    </div>
  );
}
