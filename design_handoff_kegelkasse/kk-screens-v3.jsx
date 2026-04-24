// ── Kegelkasse v3 — Screens ───────────────────────────────────────────────────

const MOCK3 = {
  user: { name: 'Noah Roosen', role: 'Admin' },
  group: { name: 'KC Westfalia 78', balance: 312.50, members: 12 },
  myDebt: 8.70,
  nextEvent: { title: 'Regulärer Kegelabend', date: '26.04.2026' },
  members: [
    { id:1,  name:'Noah Roosen',  debt:8.70,  present:true,  sp:[] },
    { id:2,  name:'Lars Meister', debt:0,     present:true,  sp:[] },
    { id:3,  name:'Timo Berger',  debt:14.20, present:false, sp:[] },
    { id:4,  name:'Jan Voss',     debt:3.10,  present:true,  sp:[] },
    { id:5,  name:'Kai Schulte',  debt:0,     present:true,  sp:[] },
    { id:6,  name:'Felix Hofer',  debt:22.00, present:true,  sp:[] },
    { id:7,  name:'Marc Richter', debt:1.50,  present:true,  sp:[] },
    { id:8,  name:'Stefan Wolf',  debt:0,     present:false, sp:[] },
    { id:9,  name:'Ben Krause',   debt:5.00,  present:true,  sp:[] },
    { id:10, name:'Dirk Lange',   debt:0,     present:true,  sp:[] },
  ],
  catalog: [
    { id:1, name:'Pudel',           amount:0.10 },
    { id:2, name:'Rinnenwurf',      amount:0.10 },
    { id:3, name:'Verspätung',      amount:0.50 },
    { id:4, name:'Abwesenheit',     amount:1.00 },
    { id:5, name:'Handy',           amount:0.25 },
    { id:6, name:'Schuh vergessen', amount:0.50 },
    { id:7, name:'Falscher Ball',   amount:0.20 },
    { id:8, name:'Strike-Jubel',    amount:0.10 },
  ],
  debts: [
    { id:1, date:'26.04.', type:'Strafe',        desc:'Pudel',         amount:0.10, paid:false },
    { id:2, date:'26.04.', type:'Strafe',        desc:'Rinnenwurf',    amount:0.10, paid:false },
    { id:3, date:'01.04.', type:'Monatsbeitrag', desc:'April 2026',    amount:5.00, paid:false },
    { id:4, date:'29.03.', type:'Strafe',        desc:'Verspätung',    amount:0.50, paid:false },
    { id:5, date:'29.03.', type:'Strafe',        desc:'Pudel × 3',     amount:0.30, paid:false },
    { id:6, date:'01.03.', type:'Monatsbeitrag', desc:'März 2026',     amount:5.00, paid:true  },
    { id:7, date:'22.03.', type:'Strafe',        desc:'Handy',         amount:0.25, paid:true  },
  ],
  logs: [
    { id:1, actor:'Lars Meister', action:'Kegelabend eingereicht',          time:'Heute, 22:14', icon:'bowling' },
    { id:2, actor:'Noah Roosen',  action:'Pudel für Jan Voss',              time:'Heute, 21:38', icon:'wallet'  },
    { id:3, actor:'System',       action:'Zahlung Lars Meister zugeordnet', time:'25.04., 10:02',icon:'check'   },
    { id:4, actor:'Felix Hofer',  action:'Zusage für 26.04.',               time:'24.04., 18:45',icon:'calendar'},
  ],
  events: [
    { id:1, title:'Regulärer Kegelabend',    date:'26.04.2026', tag:'Regeltermin', rsvp:{yes:8,no:1,open:3}  },
    { id:2, title:'Vereinsausflug Sauerland',date:'23.–25.05.', tag:'Mehrtägig',  rsvp:{yes:6,no:2,open:4}  },
    { id:3, title:'Regulärer Kegelabend',    date:'31.05.2026', tag:'Regeltermin', rsvp:{yes:0,no:0,open:12} },
    { id:4, title:'Sommerfest',              date:'14.06.2026', tag:'Event',       rsvp:{yes:10,no:0,open:2} },
  ],
  awards: [
    { emoji:'👑', title:'Pudelkönig',  holder:'Felix Hofer',  sub:'8 Pudel',   bg:'#F5C4A8' },
    { emoji:'🏃', title:'Streber',     holder:'Lars Meister', sub:'100 % Anw.',bg:'#CBC2F2' },
    { emoji:'💰', title:'Goldesel',    holder:'Timo Berger',  sub:'14,20 €',   bg:'#B4E4D4' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
function V3Login({ onLogin }) {
  const [email, setEmail] = React.useState('noah@kegelclub.de');
  const [pw, setPw]       = React.useState('');

  return (
    <div style={{ minHeight:'100%', background:V3.bg, display:'flex', flexDirection:'column' }}>

      {/* Top illustration area */}
      <div style={{
        flex:'0 0 42%', background:V3.cardLavender,
        borderRadius:`0 0 ${V3.radiusLg} ${V3.radiusLg}`,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        padding:'2.5rem 2rem', position:'relative', overflow:'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.25)' }}/>
        <div style={{ position:'absolute', bottom:-40, left:-40, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.15)' }}/>
        {/* Bowling pin illustration */}
        <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' }}>
          <div style={{ fontSize:'4rem' }}>🎳</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'2rem', color:V3.purple, letterSpacing:'-0.01em', lineHeight:1 }}>Kegelkasse</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.9rem', color:V3.text2, textAlign:'center' }}>KC Westfalia 78 · Digital &amp; Einfach</div>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'2rem 1.5rem', gap:'1rem' }}>
        <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.5rem', color:V3.text1, marginBottom:'0.25rem' }}>Willkommen zurück!</div>

        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          <div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', fontWeight:800, color:V3.text3, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.4rem' }}>E-Mail</div>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@kegelclub.de" style={{
              width:'100%', padding:'0.8rem 1rem', borderRadius:V3.radiusSm,
              border:`1.5px solid ${V3.border}`, background:V3.white,
              fontFamily:"'Nunito', sans-serif", fontSize:'0.95rem', color:V3.text1, outline:'none',
              boxSizing:'border-box', boxShadow:V3.shadow,
            }}/>
          </div>
          <div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', fontWeight:800, color:V3.text3, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.4rem' }}>Passwort</div>
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" style={{
              width:'100%', padding:'0.8rem 1rem', borderRadius:V3.radiusSm,
              border:`1.5px solid ${V3.border}`, background:V3.white,
              fontFamily:"'Nunito', sans-serif", fontSize:'0.95rem', color:V3.text1, outline:'none',
              boxSizing:'border-box', boxShadow:V3.shadow,
            }}/>
          </div>
        </div>

        <Btn3 onClick={onLogin} full style={{ marginTop:'0.5rem' }}>Anmelden</Btn3>

        <div style={{ textAlign:'center', fontSize:'0.82rem', color:V3.text3, fontFamily:"'Nunito', sans-serif" }}>
          Noch kein Konto?{' '}
          <button onClick={onLogin} style={{ background:'none', border:'none', color:V3.purple, fontWeight:800, cursor:'pointer', fontFamily:"'Nunito', sans-serif" }}>Registrieren</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function V3Dashboard({ onNavigate }) {
  const [filter, setFilter] = React.useState('Heute');
  const filters = ['Heute','Strafen','Abende','Kasse','Mitglieder'];

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>

      {/* Top bar */}
      <div style={{ padding:'1.25rem 1.25rem 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.3rem', color:V3.text1, lineHeight:1.1 }}>Hallo, Noah 👋</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.78rem', color:V3.text3, marginTop:2 }}>KC Westfalia 78 · Do., 24. April</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <button style={{ width:40, height:40, borderRadius:'50%', background:V3.white, border:'none', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:V3.shadow, cursor:'pointer' }}>
            <V3Icon name="bell" size={18} color={V3.text2}/>
          </button>
          <V3Avatar name="Noah Roosen" size={40}/>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display:'flex', gap:'0.5rem', padding:'1rem 1.25rem', overflowX:'auto', scrollbarWidth:'none' }}>
        {filters.map(f => <Pill3 key={f} active={filter===f} onClick={() => setFilter(f)}>{f}</Pill3>)}
      </div>

      <div style={{ padding:'0 1rem', paddingBottom:90 }}>

        {/* Hero card — Nächster Abend */}
        <Card3 bg={V3.cardPeach} style={{ padding:'1.5rem', marginBottom:'0.75rem', position:'relative', overflow:'visible' }} onClick={() => onNavigate('calendar')}>
          <div style={{ position:'absolute', top:-16, right:20, fontSize:'5rem', opacity:0.35, pointerEvents:'none', userSelect:'none' }}>🎳</div>
          <div style={{ position:'relative', zIndex:1 }}>
            <Badge3 type="warning">Nächster Termin</Badge3>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.4rem', color:V3.text1, marginTop:'0.5rem', lineHeight:1.1 }}>Regulärer<br/>Kegelabend</div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'1rem', color:V3.text2, marginTop:'0.3rem' }}>Sonntag, 26. April 2026</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'1rem' }}>
              <div style={{ display:'flex', gap:'-8px' }}>
                {MOCK3.members.slice(0,5).map(m => (
                  <div key={m.id} style={{ marginRight:-10 }}><V3Avatar name={m.name} size={30}/></div>
                ))}
                <div style={{ width:30, height:30, borderRadius:'50%', background:V3.purple, color:'#fff', fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.62rem', display:'flex', alignItems:'center', justifyContent:'center', marginRight:-10 }}>+5</div>
              </div>
              <div style={{ width:36, height:36, borderRadius:'50%', background:V3.purple, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px ${V3.purple}40`, flexShrink:0 }}>
                <V3Icon name="chevronR" size={18} color="#fff" sw={2.5}/>
              </div>
            </div>
          </div>
        </Card3>

        {/* Bento grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gridTemplateRows:'auto auto', gap:'0.75rem', marginBottom:'0.75rem' }}>

          {/* Schulden — tall left card */}
          <Card3 bg={V3.cardLavender} style={{ gridRow:'span 2', padding:'1.25rem', display:'flex', flexDirection:'column', justifyContent:'space-between' }} onClick={() => onNavigate('debts')}>
            <div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.72rem', color:V3.purple, textTransform:'uppercase', letterSpacing:'0.08em', opacity:0.7 }}>Meine Schulden</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'2.8rem', color:V3.purple, lineHeight:1, marginTop:'0.5rem' }}>8,70</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'1rem', color:V3.purple, opacity:0.65 }}>Euro offen</div>
              <div style={{ marginTop:'0.6rem', fontSize:'0.72rem', color:V3.purple, opacity:0.6, fontFamily:"'Nunito', sans-serif" }}>5 Positionen</div>
            </div>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(59,45,130,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <V3Icon name="chevronR" size={18} color={V3.purple} sw={2.5}/>
            </div>
          </Card3>

          {/* Kassensaldo */}
          <Card3 bg={V3.cardCream} style={{ padding:'1.1rem' }} onClick={() => onNavigate('treasury')}>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.65rem', color:V3.text2, textTransform:'uppercase', letterSpacing:'0.08em', opacity:0.7 }}>Vereinskasse</div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.8rem', color:V3.text1, lineHeight:1.1, marginTop:'0.3rem' }}>312,50</div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:V3.text2, marginTop:2 }}>Euro</div>
          </Card3>

          {/* Anwesenheit */}
          <Card3 bg={V3.cardMint} style={{ padding:'1.1rem' }}>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.65rem', color:'#1A5C44', textTransform:'uppercase', letterSpacing:'0.08em', opacity:0.7 }}>Anwesenheit</div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.8rem', color:'#1A5C44', lineHeight:1.1, marginTop:'0.3rem' }}>83 %</div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:'#1A5C44', marginTop:2, opacity:0.75 }}>Letzte 6 Abende</div>
          </Card3>
        </div>

        {/* Session CTA */}
        <Card3 style={{ marginBottom:'1.25rem', overflow:'visible' }} onClick={() => onNavigate('session')}>
          <div style={{
            padding:'1.1rem 1.25rem',
            display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem',
          }}>
            <div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1rem', color:V3.text1 }}>Kegelabend erfassen</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.78rem', color:V3.text3, marginTop:2 }}>10 Mitglieder · 26.04.2026</div>
            </div>
            <div style={{
              width:52, height:52, borderRadius:'50%', flexShrink:0,
              background:V3.orange,
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:`0 4px 16px ${V3.orange}45`,
            }}>
              <V3Icon name="bowling" size={24} color="#fff" sw={2}/>
            </div>
          </div>
          {/* Alert strip */}
          <div style={{ background:V3.orangeDim, borderTop:`1px solid ${V3.orange}20`, padding:'0.55rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.78rem', color:V3.orange, fontWeight:700 }}>1 Einreichung wartet auf Genehmigung</div>
            <V3Icon name="chevronR" size={16} color={V3.orange} sw={2.5}/>
          </div>
        </Card3>

        {/* Awards */}
        <SectionHead3 action="Alle">April · Titel</SectionHead3>
        <div style={{ display:'flex', gap:'0.625rem', marginBottom:'1.25rem', overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
          {MOCK3.awards.map(a => (
            <Card3 key={a.title} bg={a.bg} style={{ padding:'1rem', minWidth:120, flexShrink:0 }}>
              <div style={{ fontSize:'1.8rem', marginBottom:'0.4rem' }}>{a.emoji}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.8rem', color:V3.text1 }}>{a.title}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.72rem', color:V3.text2, marginTop:2 }}>{a.holder.split(' ')[0]}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', color:V3.text3, marginTop:1 }}>{a.sub}</div>
            </Card3>
          ))}
        </div>

        {/* Activity */}
        <SectionHead3>Aktivitäten</SectionHead3>
        <Card3 style={{ padding:0, overflow:'hidden' }}>
          {MOCK3.logs.map((l, i) => (
            <div key={l.id} style={{
              display:'flex', alignItems:'center', gap:'0.875rem',
              padding:'0.875rem 1rem',
              borderBottom: i < MOCK3.logs.length - 1 ? `1px solid ${V3.border}` : 'none',
            }}>
              <div style={{ width:36, height:36, borderRadius:V3.radiusSm, background:V3.purpleDim, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <V3Icon name={l.icon} size={16} color={V3.purpleMid}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.82rem', color:V3.text1 }}>
                  {l.actor} <span style={{ color:V3.text3, fontWeight:600 }}>— {l.action}</span>
                </div>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.68rem', color:V3.text3, marginTop:2 }}>{l.time}</div>
              </div>
            </div>
          ))}
        </Card3>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────────────────────────────────────
function V3Session({ onBack }) {
  const [members, setMembers] = React.useState(MOCK3.members.map(m => ({ ...m, sp:[] })));
  const [sheet, setSheet]     = React.useState(null);
  const [submitted, setSubmitted] = React.useState(false);

  const addPenalty = (mId, p) => {
    setMembers(prev => prev.map(m => m.id === mId ? { ...m, sp:[...m.sp, p] } : m));
    setSheet(null);
  };
  const togglePresent = (mId, e) => {
    e.stopPropagation();
    setMembers(prev => prev.map(m => m.id === mId ? { ...m, present:!m.present } : m));
  };

  const totalP = members.reduce((s, m) => s + m.sp.length, 0);
  const presentN = members.filter(m => m.present).length;
  const totalAmt = members.reduce((s, m) => s + m.sp.reduce((a, p) => a + p.amount, 0), 0);

  if (submitted) return (
    <div style={{ background:V3.bg, minHeight:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem', gap:'1.25rem', textAlign:'center' }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:V3.cardMint, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <V3Icon name="check" size={36} color={V3.teal} sw={2.5}/>
      </div>
      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.6rem', color:V3.text1 }}>Eingereicht!</div>
      <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.9rem', color:V3.text3 }}>Der Kassenwart prüft und genehmigt den Abend.</div>
      <Btn3 onClick={onBack}>← Zurück</Btn3>
    </div>
  );

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>

      {/* Header island */}
      <div style={{ background:V3.cardLavender, padding:'1.25rem', borderRadius:`0 0 ${V3.radiusLg} ${V3.radiusLg}`, marginBottom:'1rem', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
          <button onClick={onBack} style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.5)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <V3Icon name="x" size={18} color={V3.purple} sw={2.5}/>
          </button>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1rem', color:V3.purple }}>Kegelabend · 26.04.</div>
          <Btn3 small onClick={() => setSubmitted(true)}>Einreichen</Btn3>
        </div>
        {/* Stats row */}
        <div style={{ display:'flex', gap:'0.5rem' }}>
          {[
            [`${presentN}/${members.length}`, 'Anwesend'],
            [`${totalP}`, 'Strafen'],
            [`${totalAmt.toFixed(2).replace('.',',')} €`, 'Gesamt'],
          ].map(([val, label]) => (
            <div key={label} style={{ flex:1, background:'rgba(255,255,255,0.5)', borderRadius:V3.radiusSm, padding:'0.6rem 0.5rem', textAlign:'center' }}>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1rem', color:V3.purple }}>{val}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.62rem', color:V3.text2, fontWeight:700 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Member list */}
      <div style={{ padding:'0 1rem', paddingBottom:90 }}>
        {members.map(m => {
          const total = m.sp.reduce((a, p) => a + p.amount, 0);
          const hasP = m.sp.length > 0;
          return (
            <Card3 key={m.id} style={{
              marginBottom:'0.6rem', opacity: m.present ? 1 : 0.4,
              border: hasP ? `2px solid ${V3.orange}50` : 'none',
            }}>
              <div onClick={() => m.present && setSheet(m.id)} style={{ padding:'1rem', display:'flex', alignItems:'center', gap:'0.875rem', cursor: m.present ? 'pointer' : 'default' }}>
                <V3Avatar name={m.name} size={42}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.9rem', color:V3.text1 }}>{m.name}</div>
                  {hasP ? (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:4 }}>
                      {m.sp.slice(0, 4).map((p, i) => (
                        <span key={i} style={{ background:V3.orangeDim, color:V3.orange, borderRadius:V3.pill, padding:'1px 8px', fontSize:'0.65rem', fontWeight:800, fontFamily:"'Nunito', sans-serif" }}>{p.name}</span>
                      ))}
                      {m.sp.length > 4 && <span style={{ fontSize:'0.65rem', color:V3.text3, fontFamily:"'Nunito', sans-serif" }}>+{m.sp.length-4}</span>}
                    </div>
                  ) : (
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:V3.text3, marginTop:2 }}>Tippen für Strafe</div>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.35rem', flexShrink:0 }}>
                  {hasP && <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.1rem', color:V3.orange }}>{total.toFixed(2).replace('.',',')} €</div>}
                  <button onClick={e => togglePresent(m.id, e)} style={{
                    background: m.present ? V3.tealDim : V3.redDim,
                    color: m.present ? V3.teal : V3.red,
                    border:'none', borderRadius:V3.pill, padding:'3px 10px',
                    fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', fontWeight:800, cursor:'pointer',
                  }}>{m.present ? 'Anwesend' : 'Abwesend'}</button>
                </div>
              </div>
            </Card3>
          );
        })}
      </div>

      {/* Bottom Sheet */}
      {sheet !== null && (() => {
        const m = members.find(x => x.id === sheet);
        return (
          <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
            <div onClick={() => setSheet(null)} style={{ flex:1, background:'rgba(26,16,40,0.4)', backdropFilter:'blur(4px)' }}/>
            <div style={{ background:V3.white, borderRadius:`${V3.radiusLg} ${V3.radiusLg} 0 0`, boxShadow:`0 -4px 40px rgba(59,45,130,0.2)`, padding:'1.25rem', paddingBottom:`calc(1.25rem + env(safe-area-inset-bottom))`, maxHeight:'70vh', overflowY:'auto' }}>
              <div style={{ width:40, height:4, background:V3.border, borderRadius:99, margin:'0 auto 1rem' }}/>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1rem' }}>
                <V3Avatar name={m.name} size={40}/>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1rem', color:V3.text1 }}>Strafe für {m.name.split(' ')[0]}</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                {MOCK3.catalog.map(p => (
                  <button key={p.id} onClick={() => addPenalty(sheet, p)} style={{
                    background:V3.bg, border:`1.5px solid ${V3.border}`, borderRadius:V3.radius,
                    padding:'1rem 0.875rem', cursor:'pointer', textAlign:'left',
                    fontFamily:"'Nunito', sans-serif", display:'flex', justifyContent:'space-between', alignItems:'center',
                    transition:'background 120ms',
                  }}>
                    <span style={{ fontWeight:800, fontSize:'0.85rem', color:V3.text1 }}>{p.name}</span>
                    <span style={{ fontWeight:900, fontSize:'0.85rem', color:V3.orange }}>{p.amount.toFixed(2).replace('.',',')} €</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBTS
// ─────────────────────────────────────────────────────────────────────────────
function V3Debts({ onBack }) {
  const open  = MOCK3.debts.filter(d => !d.paid);
  const paid  = MOCK3.debts.filter(d =>  d.paid);
  const total = open.reduce((s, d) => s + d.amount, 0);

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>

      {/* Hero header */}
      <div style={{ background:V3.cardPeach, padding:'1.25rem', borderRadius:`0 0 ${V3.radiusLg} ${V3.radiusLg}`, marginBottom:'1.25rem', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.25)' }}/>
        <button onClick={onBack} style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.5)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', marginBottom:'1rem', position:'relative', zIndex:1 }}>
          <V3Icon name="x" size={18} color={V3.text1} sw={2.5}/>
        </button>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.75rem', color:V3.text2, textTransform:'uppercase', letterSpacing:'0.08em' }}>Offener Betrag</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'4rem', color:V3.text1, lineHeight:1, marginTop:'0.25rem' }}>{total.toFixed(2).replace('.',',')} €</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.82rem', color:V3.text2, marginTop:'0.25rem' }}>{open.length} offene Positionen</div>
          <div style={{ display:'flex', gap:'0.6rem', marginTop:'1rem' }}>
            <Btn3 small variant="primary">Jetzt begleichen</Btn3>
            <Btn3 small variant="white">Zahlungsinfo</Btn3>
          </div>
        </div>
      </div>

      <div style={{ padding:'0 1rem', paddingBottom:90 }}>

        {/* IBAN card */}
        <Card3 bg={V3.cardMint} style={{ padding:'1rem 1.25rem', marginBottom:'1.25rem' }}>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.68rem', color:V3.teal, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.4rem' }}>Überweisen an</div>
          <div style={{ fontFamily:"'Courier New', monospace", fontSize:'0.88rem', color:V3.text1, fontWeight:700, letterSpacing:'0.04em' }}>DE81 3205 0000 0002 8025 69</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.75rem', color:V3.text2, marginTop:'0.3rem' }}>Verwendungszweck: Kegelkasse – Noah Roosen</div>
        </Card3>

        {/* Open items */}
        <SectionHead3>{`Offen (${open.length})`}</SectionHead3>
        <Card3 style={{ padding:0, overflow:'hidden', marginBottom:'1.25rem' }}>
          {open.map((d, i) => (
            <div key={d.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.875rem 1.25rem', borderBottom: i < open.length - 1 ? `1px solid ${V3.border}` : 'none' }}>
              <div>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.88rem', color:V3.text1 }}>{d.desc}</div>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.7rem', color:V3.text3, marginTop:2 }}>{d.date} · {d.type}</div>
              </div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, color:V3.red, fontSize:'0.95rem' }}>{d.amount.toFixed(2).replace('.',',')} €</div>
            </div>
          ))}
        </Card3>

        {/* Paid items */}
        <SectionHead3>{`Bezahlt (${paid.length})`}</SectionHead3>
        <Card3 style={{ padding:0, overflow:'hidden' }}>
          {paid.map((d, i) => (
            <div key={d.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.875rem 1.25rem', borderBottom: i < paid.length - 1 ? `1px solid ${V3.border}` : 'none', opacity:0.5 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.88rem', color:V3.text1 }}>{d.desc}</div>
                  <Badge3 type="success">Bezahlt</Badge3>
                </div>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.7rem', color:V3.text3, marginTop:2 }}>{d.date} · {d.type}</div>
              </div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, color:V3.text3, fontSize:'0.95rem' }}>{d.amount.toFixed(2).replace('.',',')} €</div>
            </div>
          ))}
        </Card3>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────────────────────────────────────────
function V3Calendar({ onBack }) {
  const [rsvp, setRsvp] = React.useState({ 1:'yes', 2:null, 3:null, 4:'yes' });
  const tagColors = {
    'Regeltermin': { bg:V3.cardLavender, text:V3.purple },
    'Mehrtägig':   { bg:V3.cardCream,    text:'#7A5F10' },
    'Event':       { bg:V3.cardPeach,    text:'#7A3A18' },
  };
  const cardBgs = [V3.cardLavender, V3.cardCream, V3.white, V3.cardPeach];

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>
      <div style={{ background:V3.bg, padding:'1.25rem', position:'sticky', top:0, zIndex:10, borderBottom:`1px solid ${V3.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <button onClick={onBack} style={{ width:36, height:36, borderRadius:'50%', background:V3.white, border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:V3.shadow }}>
              <V3Icon name="x" size={18} color={V3.text2} sw={2.5}/>
            </button>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.1rem', color:V3.text1 }}>Kalender</div>
          </div>
          <Btn3 small><V3Icon name="plus" size={14} color="#fff" sw={2.5}/> Event</Btn3>
        </div>
      </div>

      <div style={{ padding:'1rem', paddingBottom:90 }}>
        {MOCK3.events.map((ev, idx) => {
          const tc = tagColors[ev.tag] || { bg:V3.white, text:V3.text2 };
          const myRsvp = rsvp[ev.id];
          return (
            <Card3 key={ev.id} bg={cardBgs[idx % cardBgs.length]} style={{ marginBottom:'0.75rem', padding:'1.25rem' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1rem' }}>
                <div>
                  <span style={{ background:'rgba(255,255,255,0.6)', borderRadius:V3.pill, padding:'0.2rem 0.7rem', fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.65rem', color:tc.text }}>{ev.tag}</span>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.05rem', color:V3.text1, marginTop:'0.5rem' }}>{ev.title}</div>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.82rem', color:V3.text2, marginTop:2 }}>{ev.date}</div>
                </div>
              </div>

              {/* RSVP bar */}
              <div style={{ display:'flex', height:6, borderRadius:V3.pill, overflow:'hidden', gap:2, marginBottom:'0.5rem' }}>
                <div style={{ flex:ev.rsvp.yes, background:V3.teal, minWidth:ev.rsvp.yes?4:0 }}/>
                <div style={{ flex:ev.rsvp.no, background:V3.red, minWidth:ev.rsvp.no?4:0 }}/>
                <div style={{ flex:ev.rsvp.open, background:'rgba(0,0,0,0.12)', minWidth:ev.rsvp.open?4:0 }}/>
              </div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.68rem', color:V3.text2, marginBottom:'0.875rem' }}>
                <span style={{ color:V3.teal, fontWeight:800 }}>✓ {ev.rsvp.yes}</span> · <span style={{ color:V3.red, fontWeight:800 }}>✗ {ev.rsvp.no}</span> · {ev.rsvp.open} ausstehend
              </div>

              <div style={{ display:'flex', gap:'0.5rem' }}>
                {[['yes','Zusagen',V3.teal],['no','Absagen',V3.red]].map(([val, label, col]) => (
                  <button key={val} onClick={() => setRsvp(r => ({ ...r, [ev.id]: r[ev.id]===val ? null : val }))} style={{
                    flex:1, padding:'0.55rem', borderRadius:V3.radiusSm, cursor:'pointer',
                    fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.82rem',
                    border:`2px solid ${myRsvp===val ? col : 'rgba(0,0,0,0.1)'}`,
                    background: myRsvp===val ? col : 'rgba(255,255,255,0.5)',
                    color: myRsvp===val ? '#fff' : V3.text2, transition:'all 120ms',
                  }}>{label}</button>
                ))}
              </div>
            </Card3>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────
function V3Stats({ onBack }) {
  const rank = [
    { name:'Felix Hofer',  pudel:34, anw:'82 %', paid:'87,50 €' },
    { name:'Noah Roosen',  pudel:28, anw:'91 %', paid:'62,30 €' },
    { name:'Timo Berger',  pudel:22, anw:'67 %', paid:'48,00 €' },
    { name:'Jan Voss',     pudel:19, anw:'75 %', paid:'34,20 €' },
    { name:'Lars Meister', pudel:12, anw:'100%', paid:'31,00 €' },
  ];
  const max = rank[0].pudel;
  const rankBgs = [V3.cardCream, V3.white, V3.white, V3.white, V3.white];

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>
      {/* Header */}
      <div style={{ background:V3.cardLavender, padding:'1.25rem', borderRadius:`0 0 ${V3.radiusLg} ${V3.radiusLg}`, marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
          <button onClick={onBack} style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.5)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <V3Icon name="x" size={18} color={V3.purple} sw={2.5}/>
          </button>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1rem', color:V3.purple }}>Statistiken · April 2026</div>
          <div style={{ width:36 }}/>
        </div>
        {/* Awards bento */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.6rem' }}>
          {MOCK3.awards.map((a, i) => (
            <div key={a.title} style={{ background:'rgba(255,255,255,0.6)', borderRadius:V3.radius, padding:'0.875rem 0.625rem', textAlign:'center' }}>
              <div style={{ fontSize:'1.6rem' }}>{a.emoji}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.72rem', color:V3.purple, marginTop:'0.3rem' }}>{a.title}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', color:V3.text2, marginTop:1 }}>{a.holder.split(' ')[0]}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:'0 1rem', paddingBottom:90 }}>
        <SectionHead3>Ewige Tabelle — Pudel</SectionHead3>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
          {rank.map((r, i) => (
            <Card3 key={r.name} bg={rankBgs[i]} style={{ padding:'1rem 1.25rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.875rem' }}>
                <div style={{
                  width:32, height:32, borderRadius:'50%', flexShrink:0,
                  background: i===0 ? V3.cardCream : V3.purpleDim,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:"'Nunito', sans-serif", fontWeight:900,
                  fontSize:'0.9rem', color: i===0 ? '#7A5F10' : V3.text3,
                }}>{i+1}</div>
                <V3Avatar name={r.name} size={38}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.88rem', color:V3.text1 }}>{r.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:5 }}>
                    <div style={{ flex:1, height:4, background:'rgba(59,45,130,0.08)', borderRadius:V3.pill, overflow:'hidden' }}>
                      <div style={{ width:`${(r.pudel/max)*100}%`, height:'100%', background: i===0 ? V3.orange : V3.purpleMid, borderRadius:V3.pill }}/>
                    </div>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.9rem', color: i===0 ? V3.orange : V3.text2, minWidth:28, textAlign:'right' }}>{r.pudel}</div>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.68rem', color:V3.text3 }}>{r.anw} Anw.</div>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.68rem', color: i===0 ? V3.orange : V3.text3, fontWeight: i===0 ? 800 : 600 }}>{r.paid}</div>
                </div>
              </div>
            </Card3>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER
// ─────────────────────────────────────────────────────────────────────────────
function V3Placeholder({ name, onBack }) {
  return (
    <div style={{ background:V3.bg, minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'1rem', padding:'2rem', textAlign:'center' }}>
      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.5rem', color:V3.text3 }}>{name}</div>
      <div style={{ fontSize:'0.85rem', color:V3.text3 }}>Noch nicht ausgebaut.</div>
      <Btn3 variant="ghost" onClick={onBack}>← Zurück</Btn3>
    </div>
  );
}

Object.assign(window, { V3Login, V3Dashboard, V3Session, V3Debts, V3Calendar, V3Stats, V3Placeholder, MOCK3 });
