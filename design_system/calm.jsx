// Variant F — Calm Bento
// Soft warm off-white bento. Large rounded cards. Restrained color blocks (sage / terracotta / navy).

const calmPal = {
    bg: '#f3f0eb',
    ink: '#1c1a17',
    inkSoft: '#5c574e',
    inkDim: '#9a948a',
    card: '#fbfaf6',
    cardEdge: '#e5e1d8',
    sage: '#5e7a5a',
    sageBg: '#e2ead8',
    terra: '#b56546',
    terraBg: '#f5dccd',
    navy: '#2b3a55',
    navyBg: '#d8dde7',
    cream: '#efe4d0',
    amber: '#b07e2a',
};

const calmRoster = [
    { n: 'Hans M.', a: '#b07e2a' },
    { n: 'Karin V.', a: '#5e7a5a' },
    { n: 'Martin H.', a: '#2b3a55' },
    { n: 'Petra L.', a: '#b56546' },
    { n: 'Tobias B.', a: '#5e7a5a' },
    { n: 'Lisa K.', a: '#2b3a55' },
    { n: 'Anna S.', a: '#b07e2a' },
    { n: 'Jan F.', a: '#b56546' },
];

function CalmBentoDashboard() {
    return (
        <div style={{
            width: 1440, height: 900,
            background: calmPal.bg,
            color: calmPal.ink,
            fontFamily: "'Geist', 'Inter Tight', system-ui, sans-serif",
            fontSize: 13,
            display: 'grid',
            gridTemplateColumns: '232px 1fr',
        }}>
            <CalmSidebar />
            <CalmMain />
        </div>
    );
}

function CalmSidebar() {
    const items = [
        { l: 'Übersicht', active: true },
        { l: 'Kegelabende', tag: '1' },
        { l: 'Kasse' },
        { l: 'Termine' },
        { l: 'Mitglieder' },
        { l: 'Regelwerk' },
    ];
    return (
        <aside style={{
            padding: '24px 18px',
            display: 'flex', flexDirection: 'column',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, padding: '0 4px' }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: calmPal.ink, color: calmPal.bg,
                    display: 'grid', placeItems: 'center',
                    fontWeight: 700, fontSize: 15,
                }}>K</div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Kegelkasse</div>
                    <div style={{ fontSize: 10, color: calmPal.inkDim, marginTop: 1 }}>v 4.2 · ruhig</div>
                </div>
            </div>

            {/* club switcher */}
            <button style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', borderRadius: 14,
                background: calmPal.card, border: `1px solid ${calmPal.cardEdge}`,
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                marginBottom: 22,
            }}>
                <div style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: calmPal.terraBg, color: calmPal.terra,
                    display: 'grid', placeItems: 'center',
                    fontSize: 13, fontWeight: 700,
                }}>P</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: calmPal.inkDim, fontWeight: 500 }}>Club</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>KC Pin Royal</div>
                </div>
                <span style={{ color: calmPal.inkDim, fontSize: 14 }}>⇅</span>
            </button>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {items.map((it, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', borderRadius: 12,
                        background: it.active ? calmPal.ink : 'transparent',
                        color: it.active ? calmPal.bg : calmPal.inkSoft,
                        cursor: 'pointer', fontSize: 13,
                        fontWeight: it.active ? 600 : 500,
                    }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: it.active ? calmPal.sage : calmPal.inkDim,
                        }} />
                        <span style={{ flex: 1 }}>{it.l}</span>
                        {it.tag && <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 100,
                            background: it.active ? calmPal.bg : calmPal.terraBg,
                            color: it.active ? calmPal.ink : calmPal.terra,
                            fontWeight: 700,
                        }}>{it.tag}</span>}
                    </div>
                ))}
            </nav>

            <div style={{ flex: 1 }} />

            {/* user */}
            <div style={{
                padding: 14, borderRadius: 16,
                background: calmPal.sageBg,
                display: 'flex', alignItems: 'center', gap: 12,
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: calmPal.sage, color: '#fff',
                    display: 'grid', placeItems: 'center',
                    fontWeight: 600, fontSize: 13,
                }}>NR</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Noah Roosen</div>
                    <div style={{ fontSize: 10, color: calmPal.sage, fontWeight: 600, marginTop: 1 }}>Kassenwart</div>
                </div>
            </div>
        </aside>
    );
}

function CalmMain() {
    return (
        <main style={{
            padding: '22px 28px 28px 6px',
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr',
            gridTemplateRows: 'auto 1fr 0.9fr',
            gap: 14,
            overflow: 'hidden',
        }}>
            <CalmHeaderCard />
            <CalmDebtCard />
            <CalmEventCard />
            <CalmTreasuryCard />
            <CalmActivityCard />
            <CalmRosterCard />
        </main>
    );
}

function CalmHeaderCard() {
    return (
        <section style={{
            gridColumn: '1 / 4',
            padding: '18px 24px',
            display: 'flex', alignItems: 'center', gap: 24,
        }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: calmPal.inkDim, letterSpacing: '0.02em' }}>Mittwoch · 14. Mai 2026</div>
                <h1 style={{
                    margin: '4px 0 0',
                    fontFamily: "'Geist', sans-serif",
                    fontSize: 30, fontWeight: 500, letterSpacing: '-0.025em', lineHeight: 1,
                }}>Guten Tag, Noah.</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button style={{
                    padding: '10px 16px', borderRadius: 100,
                    background: calmPal.card, border: `1px solid ${calmPal.cardEdge}`,
                    fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>⌕ Suchen</button>
                <button style={{
                    padding: '10px 16px', borderRadius: 100,
                    background: calmPal.ink, border: 'none', color: calmPal.bg,
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>+ Kegelabend</button>
            </div>
        </section>
    );
}

function CalmCard({ children, bg, style, pad = 22 }) {
    return (
        <section style={{
            background: bg || calmPal.card,
            borderRadius: 24,
            padding: pad,
            display: 'flex', flexDirection: 'column',
            border: bg ? 'none' : `1px solid ${calmPal.cardEdge}`,
            minHeight: 0, overflow: 'hidden',
            ...style,
        }}>{children}</section>
    );
}

function CalmDebtCard() {
    return (
        <CalmCard bg={calmPal.terraBg}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: calmPal.terra, fontWeight: 600, letterSpacing: '0.02em' }}>Meine Schulden</div>
                <span style={{
                    fontSize: 10, padding: '3px 9px', borderRadius: 100,
                    background: '#fff', color: calmPal.terra, fontWeight: 600,
                }}>Frist 21.05.</span>
            </div>
            <div style={{
                marginTop: 12,
                fontFamily: "'Geist', sans-serif",
                fontSize: 68, fontWeight: 500, lineHeight: 0.9,
                letterSpacing: '-0.045em',
                color: calmPal.ink,
                fontVariantNumeric: 'tabular-nums',
            }}>17,60 <span style={{ fontWeight: 400, fontSize: 32, color: calmPal.terra }}>€</span></div>
            <div style={{ marginTop: 4, fontSize: 12, color: calmPal.terra }}>14 Strafen · 2 Beiträge offen</div>

            <div style={{ flex: 1 }} />

            <div style={{
                marginTop: 18, padding: '12px 14px',
                background: 'rgba(255,255,255,0.6)', borderRadius: 14,
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: calmPal.terra, fontWeight: 600, letterSpacing: '0.04em' }}>IBAN</div>
                    <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11.5, color: calmPal.ink, marginTop: 2 }}>DE81 3205 0000 0002 8025 69</div>
                </div>
                <button style={{
                    padding: '8px 14px', borderRadius: 100,
                    background: calmPal.terra, border: 'none', color: '#fff',
                    fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                }}>Begleichen</button>
            </div>
        </CalmCard>
    );
}

function CalmEventCard() {
    return (
        <CalmCard bg={calmPal.navy} style={{ color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: calmPal.cream, fontWeight: 600 }}>Nächster Abend</div>
                <span style={{ fontSize: 11, color: '#fff', opacity: 0.7 }}>in 9 Tagen</span>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                <div style={{
                    fontFamily: "'Geist', sans-serif",
                    fontSize: 72, fontWeight: 500, lineHeight: 0.85,
                    letterSpacing: '-0.04em',
                    color: calmPal.cream,
                }}>23</div>
                <div style={{ paddingBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Sa, Mai</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>19:30 Uhr · Bahn 3+4</div>
                </div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex' }}>
                    {['#5e7a5a', '#b56546', '#b07e2a', '#efe4d0'].map((c, i) => (
                        <div key={i} style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: c, border: `2px solid ${calmPal.navy}`,
                            marginLeft: i === 0 ? 0 : -8,
                            display: 'grid', placeItems: 'center',
                            fontSize: 9, fontWeight: 700, color: calmPal.navy,
                        }}>{['H', 'K', 'M', '+6'][i]}</div>
                    ))}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>9 zugesagt · 3 offen</div>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                <button style={{
                    flex: 1, padding: '9px', borderRadius: 100,
                    background: calmPal.cream, color: calmPal.navy, border: 'none',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                }}>Zusagen</button>
                <button style={{
                    padding: '9px 14px', borderRadius: 100,
                    background: 'rgba(255,255,255,0.1)', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
                }}>Absagen</button>
            </div>
        </CalmCard>
    );
}

function CalmTreasuryCard() {
    return (
        <CalmCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: calmPal.inkSoft, fontWeight: 600 }}>Vereinskasse</div>
                <span style={{
                    fontSize: 10, padding: '3px 9px', borderRadius: 100,
                    background: calmPal.sageBg, color: calmPal.sage, fontWeight: 700,
                }}>▲ +6,2 %</span>
            </div>

            <div style={{
                marginTop: 10,
                fontFamily: "'Geist', sans-serif",
                fontSize: 48, fontWeight: 500, lineHeight: 0.95,
                letterSpacing: '-0.035em',
                fontVariantNumeric: 'tabular-nums',
            }}>1.428,40 <span style={{ fontWeight: 400, fontSize: 22, color: calmPal.inkDim }}>€</span></div>

            <svg viewBox="0 0 280 50" style={{ width: '100%', marginTop: 14 }}>
                <defs>
                    <linearGradient id="calmGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={calmPal.sage} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={calmPal.sage} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d="M0,40 L20,36 L40,38 L60,32 L80,28 L100,30 L120,22 L140,24 L160,18 L180,14 L200,16 L220,10 L240,8 L260,6 L280,5 L280,50 L0,50 Z"
                      fill="url(#calmGrad)" />
                <path d="M0,40 L20,36 L40,38 L60,32 L80,28 L100,30 L120,22 L140,24 L160,18 L180,14 L200,16 L220,10 L240,8 L260,6 L280,5"
                      fill="none" stroke={calmPal.sage} strokeWidth="2" strokeLinecap="round" />
                <circle cx="280" cy="5" r="3.5" fill={calmPal.sage} />
                <circle cx="280" cy="5" r="6" fill={calmPal.sage} opacity="0.2" />
            </svg>

            <div style={{ flex: 1 }} />

            <div style={{
                marginTop: 14, paddingTop: 14, borderTop: `1px solid ${calmPal.cardEdge}`,
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            }}>
                <div>
                    <div style={{ fontSize: 10, color: calmPal.inkDim, letterSpacing: '0.04em' }}>EIN · 30 Tage</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: calmPal.sage, marginTop: 2, fontFamily: "'Geist Mono', monospace" }}>+ 312,40 €</div>
                </div>
                <div>
                    <div style={{ fontSize: 10, color: calmPal.inkDim, letterSpacing: '0.04em' }}>AUS · 30 Tage</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: calmPal.terra, marginTop: 2, fontFamily: "'Geist Mono', monospace" }}>− 84,20 €</div>
                </div>
            </div>
        </CalmCard>
    );
}

function CalmActivityCard() {
    const feed = [
        { who: 'Hans Meier', what: 'reichte Kegelabend ein', when: 'vor 2 Std', tag: 'Freigabe', tagColor: calmPal.amber, tagBg: '#f7eacf' },
        { who: 'Noah Roosen', what: 'buchte 12 × Monatsbeitrag Mai', when: 'vor 5 Std', tag: 'Kasse', tagColor: calmPal.sage, tagBg: calmPal.sageBg },
        { who: 'Karin Voss', what: 'sagte für Pfingstkegeln zu', when: 'gestern', tag: 'Termin', tagColor: calmPal.navy, tagBg: calmPal.navyBg },
        { who: 'Martin Haas', what: 'Verspätungsstrafe gebucht', when: 'gestern', tag: 'Strafe', tagColor: calmPal.terra, tagBg: calmPal.terraBg },
    ];
    return (
        <CalmCard style={{ gridColumn: '1 / 3' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 12, color: calmPal.inkSoft, fontWeight: 600 }}>Aktivität</div>
                <a style={{ fontSize: 11, color: calmPal.inkDim, cursor: 'pointer' }}>Alle ansehen →</a>
            </div>

            <div style={{
                marginTop: 10, padding: '12px 16px', borderRadius: 14,
                background: '#f7eacf', display: 'flex', alignItems: 'center', gap: 12,
            }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: calmPal.amber }} />
                <div style={{ flex: 1, fontSize: 12 }}>
                    <strong style={{ color: calmPal.ink }}>Einreichung wartet auf Freigabe</strong>
                    <span style={{ color: calmPal.inkSoft }}> · Kegelabend 09.05. · H. Meier · 12 Teilnehmer · Σ 4,80 €</span>
                </div>
                <button style={{
                    padding: '6px 14px', borderRadius: 100,
                    background: calmPal.ink, color: calmPal.bg, border: 'none',
                    fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                }}>Prüfen</button>
            </div>

            <div style={{ marginTop: 6, flex: 1, minHeight: 0 }}>
                {feed.map((f, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 4px',
                        borderBottom: i < feed.length - 1 ? `1px solid ${calmPal.cardEdge}` : 'none',
                    }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: calmPal.bg, color: calmPal.inkSoft,
                            border: `1px solid ${calmPal.cardEdge}`,
                            display: 'grid', placeItems: 'center',
                            fontSize: 11, fontWeight: 600,
                        }}>{f.who.split(' ').map(p => p[0]).join('')}</div>
                        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.3 }}>
                            <div><strong>{f.who}</strong> <span style={{ color: calmPal.inkSoft }}>{f.what}</span></div>
                            <div style={{ fontSize: 11, color: calmPal.inkDim, marginTop: 1 }}>{f.when}</div>
                        </div>
                        <span style={{
                            fontSize: 10, padding: '3px 9px', borderRadius: 100,
                            background: f.tagBg, color: f.tagColor, fontWeight: 600,
                        }}>{f.tag}</span>
                    </div>
                ))}
            </div>
        </CalmCard>
    );
}

function CalmRosterCard() {
    return (
        <CalmCard bg={calmPal.cream}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: calmPal.ink, fontWeight: 600 }}>Mitglieder</div>
                <span style={{ fontSize: 11, color: calmPal.amber, fontWeight: 600 }}>12 aktiv</span>
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {calmRoster.map((m, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '5px 10px 5px 5px', borderRadius: 100,
                        background: 'rgba(255,255,255,0.7)',
                    }}>
                        <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: m.a, color: '#fff',
                            display: 'grid', placeItems: 'center',
                            fontSize: 9, fontWeight: 700,
                        }}>{m.n.split(' ').map(p => p[0]).join('')}</div>
                        <span style={{ fontSize: 11, fontWeight: 500 }}>{m.n}</span>
                    </div>
                ))}
                <div style={{
                    padding: '5px 10px', borderRadius: 100,
                    background: calmPal.ink, color: calmPal.bg,
                    fontSize: 11, fontWeight: 600,
                }}>+4 weitere</div>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid rgba(0,0,0,0.08)` }}>
                <div style={{ fontSize: 11, color: calmPal.inkSoft, fontWeight: 600, marginBottom: 8 }}>Top Pudler · Mai</div>
                {[
                    ['Martin H.', '23,80 €', 0.95],
                    ['Petra L.', '11,20 €', 0.45],
                    ['Karin V.', '8,50 €', 0.34],
                ].map(([n, e, p], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, width: 70 }}>{n}</span>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${p * 100}%`, height: '100%', background: calmPal.amber }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", color: calmPal.amber, fontWeight: 600 }}>{e}</span>
                    </div>
                ))}
            </div>
        </CalmCard>
    );
}

window.CalmBentoDashboard = CalmBentoDashboard;
