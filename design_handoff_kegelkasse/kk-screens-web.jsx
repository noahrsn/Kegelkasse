// ── Kegelkasse Web — Desktop Screens ─────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────
function WebSidebar({ screen, onNavigate }) {
  const items = [
    { id:'dashboard', icon:'home',     label:'Dashboard'    },
    { id:'session',   icon:'bowling',  label:'Kegelabend'   },
    { id:'debts',     icon:'wallet',   label:'Schulden'     },
    { id:'calendar',  icon:'calendar', label:'Kalender'     },
    { id:'stats',     icon:'trophy',   label:'Statistiken'  },
    { id:'settings',  icon:'settings', label:'Einstellungen'},
  ];

  return (
    <aside style={{
      width: 240, flexShrink: 0, height: '100vh',
      background: V3.navBg,
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.75rem 1.5rem 1.25rem', borderBottom: `1px solid ${V3.navBorder}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
          <div style={{ fontSize:'1.6rem' }}>🎳</div>
          <div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.1rem', color:'#fff', lineHeight:1 }}>Kegelkasse</div>
            <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', color:'rgba(255,255,255,0.4)', marginTop:2 }}>KC Westfalia 78</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'1rem 0.75rem', display:'flex', flexDirection:'column', gap:'0.15rem', overflowY:'auto' }}>
        {items.map(item => {
          const active = screen === item.id;
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)} style={{
              display:'flex', alignItems:'center', gap:'0.75rem',
              padding:'0.65rem 0.875rem', borderRadius:V3.radiusSm,
              border:'none', cursor:'pointer',
              background: active ? 'rgba(203,194,242,0.15)' : 'transparent',
              color: active ? V3.cardLavender : 'rgba(255,255,255,0.45)',
              fontFamily:"'Nunito', sans-serif", fontWeight: active ? 800 : 700,
              fontSize:'0.875rem', textAlign:'left', width:'100%',
              transition:'all 120ms',
              borderLeft: active ? `3px solid ${V3.cardLavender}` : '3px solid transparent',
            }}>
              <V3Icon name={item.icon} size={18} color={active ? V3.cardLavender : 'rgba(255,255,255,0.4)'} sw={active ? 2.5 : 1.8}/>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding:'1rem', borderTop:`1px solid ${V3.navBorder}`, display:'flex', alignItems:'center', gap:'0.75rem' }}>
        <V3Avatar name="Noah Roosen" size={36}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.82rem', color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Noah Roosen</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', color:'rgba(255,255,255,0.4)' }}>Admin</div>
        </div>
        <button onClick={() => onNavigate('login')} style={{ background:'none', border:'none', cursor:'pointer', padding:4, opacity:0.5 }}>
          <V3Icon name="logout" size={16} color="#fff"/>
        </button>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────────────────────────────────────
function WebTopbar({ title, subtitle, action }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'1.5rem 2rem',
      borderBottom:`1px solid ${V3.border}`,
      background:V3.bg,
      position:'sticky', top:0, zIndex:10,
    }}>
      <div>
        <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.3rem', color:V3.text1 }}>{title}</div>
        {subtitle && <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.78rem', color:V3.text3, marginTop:2 }}>{subtitle}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
        {action}
        <button style={{ width:40, height:40, borderRadius:'50%', background:V3.white, border:'none', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:V3.shadow, cursor:'pointer' }}>
          <V3Icon name="bell" size={18} color={V3.text2}/>
        </button>
        <V3Avatar name="Noah Roosen" size={40}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function WebDashboard({ onNavigate }) {
  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>
      <WebTopbar title="Hallo, Noah 👋" subtitle="Do., 24. April 2026 · KC Westfalia 78"/>

      <div style={{ padding:'1.75rem 2rem' }}>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
          {[
            { label:'Meine Schulden', val:'8,70 €',    sub:'5 Positionen',         bg:V3.cardLavender, click:'debts'    },
            { label:'Vereinskasse',   val:'312,50 €',  sub:'Kassenstand',          bg:V3.cardCream,    click:'treasury'  },
            { label:'Anwesenheit',    val:'83 %',      sub:'Letzte 6 Abende',      bg:V3.cardMint,     click:null        },
            { label:'Nächster Abend', val:'26.04.',    sub:'Regulärer Kegelabend', bg:V3.cardPeach,    click:'calendar'  },
          ].map(s => (
            <Card3 key={s.label} bg={s.bg} style={{ padding:'1.25rem', cursor:s.click?'pointer':'default' }} onClick={s.click ? () => onNavigate(s.click) : undefined}>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.68rem', color:V3.text2, textTransform:'uppercase', letterSpacing:'0.08em', opacity:0.7 }}>{s.label}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'2rem', color:V3.text1, lineHeight:1.1, marginTop:'0.4rem' }}>{s.val}</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:V3.text2, marginTop:3 }}>{s.sub}</div>
            </Card3>
          ))}
        </div>

        {/* Main bento */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'1rem', marginBottom:'1.5rem', alignItems:'start' }}>

          {/* Left col */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

            {/* Session CTA */}
            <Card3 style={{ overflow:'hidden' }} onClick={() => onNavigate('session')}>
              <div style={{ padding:'1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', cursor:'pointer' }}>
                <div>
                  <Badge3 type="warning">Heute</Badge3>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.25rem', color:V3.text1, marginTop:'0.5rem' }}>Regulärer Kegelabend erfassen</div>
                  <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.82rem', color:V3.text3, marginTop:3 }}>10 Mitglieder eingetragen · 26.04.2026</div>
                </div>
                <div style={{ width:60, height:60, borderRadius:'50%', background:V3.orange, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 20px ${V3.orange}45`, flexShrink:0 }}>
                  <V3Icon name="bowling" size={28} color="#fff" sw={2}/>
                </div>
              </div>
              <div style={{ background:V3.orangeDim, borderTop:`1px solid ${V3.orange}20`, padding:'0.65rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.82rem', color:V3.orange, fontWeight:700 }}>1 Einreichung wartet auf Genehmigung</span>
                <Btn3 small variant="orange" style={{ fontSize:'0.75rem' }}>Prüfen →</Btn3>
              </div>
            </Card3>

            {/* Next events preview */}
            <div>
              <SectionHead3 action="Alle" onAction={() => onNavigate('calendar')}>Nächste Termine</SectionHead3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                {MOCK3.events.slice(0,4).map((ev, i) => {
                  const bgs = [V3.cardLavender, V3.cardPeach, V3.white, V3.cardCream];
                  return (
                    <Card3 key={ev.id} bg={bgs[i]} style={{ padding:'1.1rem', cursor:'pointer' }} onClick={() => onNavigate('calendar')}>
                      <Badge3 type={i===0?'purple':'neutral'}>{ev.tag}</Badge3>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.92rem', color:V3.text1, marginTop:'0.5rem', lineHeight:1.2 }}>{ev.title}</div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.75rem', color:V3.text2, marginTop:4 }}>{ev.date}</div>
                      <div style={{ display:'flex', gap:2, marginTop:'0.625rem', height:4, borderRadius:V3.pill, overflow:'hidden' }}>
                        <div style={{ flex:ev.rsvp.yes, background:V3.teal, minWidth:ev.rsvp.yes?2:0 }}/>
                        <div style={{ flex:ev.rsvp.no, background:V3.red, minWidth:ev.rsvp.no?2:0 }}/>
                        <div style={{ flex:ev.rsvp.open, background:'rgba(0,0,0,0.1)', minWidth:ev.rsvp.open?2:0 }}/>
                      </div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', color:V3.text3, marginTop:3 }}>
                        <span style={{ color:V3.teal, fontWeight:800 }}>✓{ev.rsvp.yes}</span> · <span style={{ color:V3.red, fontWeight:800 }}>✗{ev.rsvp.no}</span> · {ev.rsvp.open} offen
                      </div>
                    </Card3>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right col */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

            {/* Awards */}
            <div>
              <SectionHead3>April · Titel</SectionHead3>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                {MOCK3.awards.map(a => (
                  <Card3 key={a.title} bg={a.bg} style={{ padding:'1rem 1.1rem', display:'flex', alignItems:'center', gap:'0.875rem' }}>
                    <div style={{ fontSize:'2rem', flexShrink:0 }}>{a.emoji}</div>
                    <div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.82rem', color:V3.text1 }}>{a.title}</div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.72rem', color:V3.text2 }}>{a.holder} · {a.sub}</div>
                    </div>
                  </Card3>
                ))}
              </div>
            </div>

            {/* Activity */}
            <div>
              <SectionHead3>Aktivitäten</SectionHead3>
              <Card3 style={{ padding:0, overflow:'hidden' }}>
                {MOCK3.logs.map((l, i) => (
                  <div key={l.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.875rem 1rem', borderBottom: i < MOCK3.logs.length-1 ? `1px solid ${V3.border}` : 'none' }}>
                    <div style={{ width:34, height:34, borderRadius:V3.radiusSm, background:V3.purpleDim, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <V3Icon name={l.icon} size={15} color={V3.purpleMid}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.8rem', color:V3.text1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        <strong>{l.actor}</strong> — {l.action}
                      </div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', color:V3.text3, marginTop:1 }}>{l.time}</div>
                    </div>
                  </div>
                ))}
              </Card3>
            </div>
          </div>
        </div>

        {/* Members quick view */}
        <div>
          <SectionHead3>Mitglieder</SectionHead3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'0.75rem' }}>
            {MOCK3.members.slice(0,10).map(m => (
              <Card3 key={m.id} style={{ padding:'1rem', textAlign:'center' }}>
                <V3Avatar name={m.name} size={44}/>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.75rem', color:V3.text1, marginTop:'0.5rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name.split(' ')[0]}</div>
                {m.debt > 0
                  ? <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.68rem', color:V3.red, fontWeight:800, marginTop:2 }}>{m.debt.toFixed(2).replace('.',',')} €</div>
                  : <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.68rem', color:V3.teal, fontWeight:800, marginTop:2 }}>✓ Offen</div>
                }
              </Card3>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION (WEB)
// ─────────────────────────────────────────────────────────────────────────────
function WebSession({ onNavigate }) {
  const [members, setMembers] = React.useState(MOCK3.members.map(m => ({ ...m, sp:[] })));
  const [sheet, setSheet]     = React.useState(null);
  const [submitted, setSubmitted] = React.useState(false);

  const addPenalty = (mId, p) => {
    setMembers(prev => prev.map(m => m.id===mId ? { ...m, sp:[...m.sp,p] } : m));
    setSheet(null);
  };
  const togglePresent = mId => setMembers(prev => prev.map(m => m.id===mId ? { ...m, present:!m.present } : m));

  const totalP   = members.reduce((s,m) => s + m.sp.length, 0);
  const presentN = members.filter(m => m.present).length;
  const totalAmt = members.reduce((s,m) => s + m.sp.reduce((a,p) => a+p.amount,0), 0);

  if (submitted) return (
    <div style={{ background:V3.bg, minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'1.25rem', textAlign:'center', padding:'2rem' }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:V3.cardMint, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <V3Icon name="check" size={36} color={V3.teal} sw={2.5}/>
      </div>
      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'2rem', color:V3.text1 }}>Eingereicht!</div>
      <div style={{ fontFamily:"'Nunito', sans-serif", color:V3.text3 }}>Der Kassenwart prüft und genehmigt den Abend.</div>
      <Btn3 onClick={() => { setSubmitted(false); onNavigate('dashboard'); }}>← Dashboard</Btn3>
    </div>
  );

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>
      <WebTopbar
        title="Kegelabend erfassen"
        subtitle={`26.04.2026 · ${presentN}/${members.length} anwesend · ${totalP} Strafen · ${totalAmt.toFixed(2).replace('.',',')} €`}
        action={<Btn3 small onClick={() => setSubmitted(true)}>Einreichen</Btn3>}
      />

      <div style={{ padding:'1.75rem 2rem', display:'grid', gridTemplateColumns:'1fr 300px', gap:'1.5rem', alignItems:'start' }}>

        {/* Member grid */}
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'0.75rem' }}>
            {members.map(m => {
              const total = m.sp.reduce((a,p) => a+p.amount, 0);
              const hasP  = m.sp.length > 0;
              return (
                <Card3 key={m.id} style={{ padding:'1rem', opacity:m.present?1:0.4, border: hasP?`2px solid ${V3.orange}45`:undefined, cursor:m.present?'pointer':'default' }} onClick={() => m.present && setSheet(m.id)}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                    <V3Avatar name={m.name} size={44}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.9rem', color:V3.text1 }}>{m.name}</div>
                      {hasP ? (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:4 }}>
                          {m.sp.slice(0,3).map((p,i) => (
                            <span key={i} style={{ background:V3.orangeDim, color:V3.orange, borderRadius:V3.pill, padding:'1px 7px', fontSize:'0.62rem', fontWeight:800, fontFamily:"'Nunito', sans-serif" }}>{p.name}</span>
                          ))}
                          {m.sp.length>3 && <span style={{ fontSize:'0.62rem', color:V3.text3 }}>+{m.sp.length-3}</span>}
                        </div>
                      ) : (
                        <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:V3.text3, marginTop:2 }}>Keine Strafen</div>
                      )}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.35rem', flexShrink:0 }}>
                      {hasP && <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1rem', color:V3.orange }}>{total.toFixed(2).replace('.',',')} €</div>}
                      <button onClick={e => { e.stopPropagation(); togglePresent(m.id); }} style={{
                        background:m.present?V3.tealDim:V3.redDim, color:m.present?V3.teal:V3.red,
                        border:'none', borderRadius:V3.pill, padding:'3px 10px',
                        fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', fontWeight:800, cursor:'pointer',
                      }}>{m.present?'Anwesend':'Abwesend'}</button>
                    </div>
                  </div>
                </Card3>
              );
            })}
          </div>
        </div>

        {/* Penalty panel */}
        <div style={{ position:'sticky', top:80 }}>
          <Card3 style={{ overflow:'hidden' }}>
            <div style={{ padding:'1rem', background:V3.cardLavender }}>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.9rem', color:V3.purple }}>
                {sheet ? `Strafe für ${members.find(m=>m.id===sheet)?.name.split(' ')[0]}` : 'Mitglied auswählen'}
              </div>
              {sheet && <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:V3.text2, marginTop:2 }}>Kategorie tippen zum Hinzufügen</div>}
            </div>
            <div style={{ padding:'0.875rem', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
              {MOCK3.catalog.map(p => (
                <button key={p.id} onClick={() => sheet && addPenalty(sheet, p)} style={{
                  background:V3.bg, border:`1.5px solid ${V3.border}`, borderRadius:V3.radiusSm,
                  padding:'0.875rem 0.75rem', cursor:sheet?'pointer':'default',
                  fontFamily:"'Nunito', sans-serif", textAlign:'left',
                  opacity:sheet?1:0.4, transition:'all 100ms',
                  display:'flex', flexDirection:'column', gap:3,
                }}>
                  <span style={{ fontWeight:800, fontSize:'0.82rem', color:V3.text1 }}>{p.name}</span>
                  <span style={{ fontWeight:900, fontSize:'0.88rem', color:V3.orange }}>{p.amount.toFixed(2).replace('.',',')} €</span>
                </button>
              ))}
            </div>
          </Card3>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBTS (WEB)
// ─────────────────────────────────────────────────────────────────────────────
function WebDebts({ onNavigate }) {
  const open  = MOCK3.debts.filter(d => !d.paid);
  const paid  = MOCK3.debts.filter(d =>  d.paid);
  const total = open.reduce((s,d) => s+d.amount, 0);

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>
      <WebTopbar title="Meine Schulden" subtitle="Offene Positionen und Zahlungshistorie"/>

      <div style={{ padding:'1.75rem 2rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', alignItems:'start' }}>

          {/* Left: hero + open list */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <Card3 bg={V3.cardPeach} style={{ padding:'2rem', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-50, right:-50, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.25)' }}/>
              <div style={{ position:'relative', zIndex:1 }}>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.75rem', color:V3.text2, textTransform:'uppercase', letterSpacing:'0.08em' }}>Offener Betrag</div>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'4.5rem', color:V3.text1, lineHeight:1, marginTop:'0.25rem' }}>{total.toFixed(2).replace('.',',')} €</div>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.85rem', color:V3.text2, marginTop:'0.25rem' }}>{open.length} offene Positionen</div>
                <div style={{ display:'flex', gap:'0.75rem', marginTop:'1.25rem' }}>
                  <Btn3 small>Jetzt begleichen</Btn3>
                  <Btn3 small variant="white">Zahlungsinfo</Btn3>
                </div>
              </div>
            </Card3>

            <Card3 bg={V3.cardMint} style={{ padding:'1rem 1.25rem' }}>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.68rem', color:V3.teal, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.4rem' }}>Überweisen an</div>
              <div style={{ fontFamily:"'Courier New', monospace", fontSize:'0.92rem', color:V3.text1, fontWeight:700 }}>DE81 3205 0000 0002 8025 69</div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.75rem', color:V3.text2, marginTop:'0.3rem' }}>Verwendungszweck: Kegelkasse – Noah Roosen</div>
            </Card3>
          </div>

          {/* Right: item lists */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <SectionHead3>{`Offen (${open.length})`}</SectionHead3>
              <Card3 style={{ padding:0, overflow:'hidden' }}>
                {open.map((d,i) => (
                  <div key={d.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.875rem 1.25rem', borderBottom:i<open.length-1?`1px solid ${V3.border}`:'none' }}>
                    <div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.9rem', color:V3.text1 }}>{d.desc}</div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.7rem', color:V3.text3, marginTop:2 }}>{d.date} · {d.type}</div>
                    </div>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, color:V3.red, fontSize:'1rem' }}>{d.amount.toFixed(2).replace('.',',')} €</div>
                  </div>
                ))}
              </Card3>
            </div>
            <div>
              <SectionHead3>{`Bezahlt (${paid.length})`}</SectionHead3>
              <Card3 style={{ padding:0, overflow:'hidden' }}>
                {paid.map((d,i) => (
                  <div key={d.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.875rem 1.25rem', borderBottom:i<paid.length-1?`1px solid ${V3.border}`:'none', opacity:0.5 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                        <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.9rem', color:V3.text1 }}>{d.desc}</div>
                        <Badge3 type="success">Bezahlt</Badge3>
                      </div>
                      <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.7rem', color:V3.text3, marginTop:2 }}>{d.date} · {d.type}</div>
                    </div>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, color:V3.text3, fontSize:'1rem' }}>{d.amount.toFixed(2).replace('.',',')} €</div>
                  </div>
                ))}
              </Card3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR (WEB)
// ─────────────────────────────────────────────────────────────────────────────
function WebCalendar({ onNavigate }) {
  const [rsvp, setRsvp] = React.useState({ 1:'yes', 2:null, 3:null, 4:'yes' });
  const cardBgs = [V3.cardLavender, V3.cardPeach, V3.cardCream, V3.white];

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>
      <WebTopbar title="Kalender" subtitle="Termine & Veranstaltungen" action={<Btn3 small><V3Icon name="plus" size={14} color="#fff" sw={2.5}/> Event</Btn3>}/>
      <div style={{ padding:'1.75rem 2rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1rem' }}>
          {MOCK3.events.map((ev, idx) => {
            const myRsvp = rsvp[ev.id];
            return (
              <Card3 key={ev.id} bg={cardBgs[idx%cardBgs.length]} style={{ padding:'1.5rem' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1rem' }}>
                  <div>
                    <Badge3 type={idx===0?'purple':'neutral'}>{ev.tag}</Badge3>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'1.1rem', color:V3.text1, marginTop:'0.5rem' }}>{ev.title}</div>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.85rem', color:V3.text2, marginTop:2 }}>{ev.date}</div>
                  </div>
                </div>
                <div style={{ display:'flex', height:6, borderRadius:V3.pill, overflow:'hidden', gap:2, marginBottom:'0.5rem' }}>
                  <div style={{ flex:ev.rsvp.yes, background:V3.teal, minWidth:ev.rsvp.yes?4:0 }}/>
                  <div style={{ flex:ev.rsvp.no, background:V3.red, minWidth:ev.rsvp.no?4:0 }}/>
                  <div style={{ flex:ev.rsvp.open, background:'rgba(0,0,0,0.1)', minWidth:ev.rsvp.open?4:0 }}/>
                </div>
                <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:V3.text2, marginBottom:'1rem' }}>
                  <span style={{ color:V3.teal, fontWeight:800 }}>✓ {ev.rsvp.yes}</span> · <span style={{ color:V3.red, fontWeight:800 }}>✗ {ev.rsvp.no}</span> · {ev.rsvp.open} ausstehend
                </div>
                <div style={{ display:'flex', gap:'0.625rem' }}>
                  {[['yes','Zusagen',V3.teal],['no','Absagen',V3.red]].map(([val,label,col]) => (
                    <button key={val} onClick={() => setRsvp(r => ({ ...r, [ev.id]:r[ev.id]===val?null:val }))} style={{
                      flex:1, padding:'0.6rem', borderRadius:V3.radiusSm, cursor:'pointer',
                      fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.85rem',
                      border:`2px solid ${myRsvp===val?col:'rgba(0,0,0,0.1)'}`,
                      background:myRsvp===val?col:'rgba(255,255,255,0.5)',
                      color:myRsvp===val?'#fff':V3.text2, transition:'all 120ms',
                    }}>{label}</button>
                  ))}
                </div>
              </Card3>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS (WEB)
// ─────────────────────────────────────────────────────────────────────────────
function WebStats({ onNavigate }) {
  const rank = [
    { name:'Felix Hofer',  pudel:34, anw:'82 %', paid:'87,50 €' },
    { name:'Noah Roosen',  pudel:28, anw:'91 %', paid:'62,30 €' },
    { name:'Timo Berger',  pudel:22, anw:'67 %', paid:'48,00 €' },
    { name:'Jan Voss',     pudel:19, anw:'75 %', paid:'34,20 €' },
    { name:'Lars Meister', pudel:12, anw:'100%', paid:'31,00 €' },
  ];
  const max = rank[0].pudel;

  return (
    <div style={{ background:V3.bg, minHeight:'100%' }}>
      <WebTopbar title="Statistiken" subtitle="April 2026 · KC Westfalia 78"/>
      <div style={{ padding:'1.75rem 2rem' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem', alignItems:'start' }}>

          {/* Left: Awards + ranking */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <SectionHead3>April · Titel</SectionHead3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem' }}>
                {MOCK3.awards.map(a => (
                  <Card3 key={a.title} bg={a.bg} style={{ padding:'1.25rem', textAlign:'center' }}>
                    <div style={{ fontSize:'2.2rem' }}>{a.emoji}</div>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.82rem', color:V3.text1, marginTop:'0.5rem' }}>{a.title}</div>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', color:V3.text2, marginTop:2 }}>{a.holder.split(' ')[0]}</div>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.65rem', color:V3.text3, marginTop:1 }}>{a.sub}</div>
                  </Card3>
                ))}
              </div>
            </div>

            <div>
              <SectionHead3>Ewige Tabelle — Pudel</SectionHead3>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                {rank.map((r, i) => (
                  <Card3 key={r.name} bg={i===0?V3.cardCream:V3.white} style={{ padding:'1rem 1.25rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.875rem' }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:i===0?'rgba(0,0,0,0.08)':V3.purpleDim, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.9rem', color:i===0?'#7A5F10':V3.text3 }}>{i+1}</div>
                      <V3Avatar name={r.name} size={38}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.9rem', color:V3.text1 }}>{r.name}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:5 }}>
                          <div style={{ flex:1, height:4, background:'rgba(59,45,130,0.08)', borderRadius:V3.pill, overflow:'hidden' }}>
                            <div style={{ width:`${(r.pudel/max)*100}%`, height:'100%', background:i===0?V3.orange:V3.purpleMid, borderRadius:V3.pill }}/>
                          </div>
                          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'0.9rem', color:i===0?V3.orange:V3.text2, minWidth:28, textAlign:'right' }}>{r.pudel}</div>
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.7rem', color:V3.text3 }}>{r.anw}</div>
                        <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.7rem', color:i===0?V3.orange:V3.text3, fontWeight:i===0?800:600 }}>{r.paid}</div>
                      </div>
                    </div>
                  </Card3>
                ))}
              </div>
            </div>
          </div>

          {/* Right: per-member stats */}
          <div>
            <SectionHead3>Mitglieder-Übersicht</SectionHead3>
            <Card3 style={{ padding:0, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:0 }}>
                {/* Header */}
                {['Mitglied','Schulden','Abende','Strafen'].map(h => (
                  <div key={h} style={{ padding:'0.65rem 1rem', borderBottom:`1px solid ${V3.border}`, fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.65rem', color:V3.text3, textTransform:'uppercase', letterSpacing:'0.08em', background:V3.purpleDim, textAlign:h!=='Mitglied'?'right':'left' }}>{h}</div>
                ))}
                {MOCK3.members.map((m, i) => [
                  <div key={`n${m.id}`} style={{ display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.75rem 1rem', borderBottom:i<MOCK3.members.length-1?`1px solid ${V3.border}`:'none' }}>
                    <V3Avatar name={m.name} size={30}/>
                    <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.82rem', color:V3.text1 }}>{m.name}</div>
                  </div>,
                  <div key={`d${m.id}`} style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'0.75rem 1rem', borderBottom:i<MOCK3.members.length-1?`1px solid ${V3.border}`:'none' }}>
                    <span style={{ fontFamily:"'Nunito', sans-serif", fontWeight:800, fontSize:'0.82rem', color:m.debt>0?V3.red:V3.teal }}>{m.debt>0?`${m.debt.toFixed(2).replace('.',',')} €`:'✓'}</span>
                  </div>,
                  <div key={`a${m.id}`} style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'0.75rem 1rem', borderBottom:i<MOCK3.members.length-1?`1px solid ${V3.border}`:'none' }}>
                    <span style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.82rem', color:V3.text2 }}>{m.present?'Anw.':'Abw.'}</span>
                  </div>,
                  <div key={`p${m.id}`} style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'0.75rem 1rem', borderBottom:i<MOCK3.members.length-1?`1px solid ${V3.border}`:'none' }}>
                    <span style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.82rem', color:V3.text2 }}>—</span>
                  </div>,
                ])}
              </div>
            </Card3>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN (WEB)
// ─────────────────────────────────────────────────────────────────────────────
function WebLogin({ onLogin }) {
  const [email, setEmail] = React.useState('noah@kegelclub.de');
  const [pw, setPw]       = React.useState('');
  const inputStyle = {
    width:'100%', padding:'0.85rem 1rem', borderRadius:V3.radiusSm,
    border:`1.5px solid ${V3.border}`, background:V3.white,
    fontFamily:"'Nunito', sans-serif", fontSize:'0.95rem', color:V3.text1,
    outline:'none', boxSizing:'border-box', boxShadow:V3.shadow,
  };
  return (
    <div style={{ minHeight:'100vh', display:'grid', gridTemplateColumns:'1fr 1fr', background:V3.bg }}>
      {/* Left brand */}
      <div style={{ background:V3.cardLavender, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'3rem', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-80, right:-80, width:300, height:300, borderRadius:'50%', background:'rgba(255,255,255,0.25)' }}/>
        <div style={{ position:'absolute', bottom:-60, left:-60, width:220, height:220, borderRadius:'50%', background:'rgba(255,255,255,0.15)' }}/>
        <div style={{ position:'relative', zIndex:1, textAlign:'center' }}>
          <div style={{ fontSize:'6rem' }}>🎳</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'3rem', color:V3.purple, marginTop:'0.5rem', lineHeight:1 }}>Kegelkasse</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'1.1rem', color:V3.text2, marginTop:'0.75rem' }}>KC Westfalia 78 · Digital &amp; Einfach</div>
          <div style={{ display:'flex', gap:'0.75rem', justifyContent:'center', marginTop:'2rem', flexWrap:'wrap' }}>
            {[['🎳','Strafen erfassen'],['💰','Kasse im Blick'],['📅','Termine planen']].map(([e,t]) => (
              <div key={t} style={{ background:'rgba(255,255,255,0.5)', borderRadius:V3.pill, padding:'0.5rem 1rem', fontFamily:"'Nunito', sans-serif", fontWeight:700, fontSize:'0.82rem', color:V3.purple }}>
                {e} {t}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Right form */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'3rem' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontWeight:900, fontSize:'2rem', color:V3.text1, marginBottom:'0.25rem' }}>Willkommen zurück!</div>
          <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.9rem', color:V3.text3, marginBottom:'2rem' }}>Meld dich an und los geht's.</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem', marginBottom:'1.5rem' }}>
            <div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', fontWeight:800, color:V3.text3, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.4rem' }}>E-Mail</div>
              <input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)}/>
            </div>
            <div>
              <div style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.72rem', fontWeight:800, color:V3.text3, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.4rem' }}>Passwort</div>
              <input type="password" style={inputStyle} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••"/>
            </div>
          </div>
          <Btn3 onClick={onLogin} full>Anmelden</Btn3>
          <div style={{ textAlign:'center', marginTop:'1.25rem', fontSize:'0.85rem', color:V3.text3, fontFamily:"'Nunito', sans-serif" }}>
            Noch kein Konto?{' '}
            <button onClick={onLogin} style={{ background:'none', border:'none', color:V3.purple, fontWeight:800, cursor:'pointer', fontFamily:"'Nunito', sans-serif" }}>Registrieren</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WebSidebar, WebTopbar, WebDashboard, WebSession, WebDebts, WebCalendar, WebStats, WebLogin });
