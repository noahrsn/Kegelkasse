import { Link, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, AvatarStack, Avatar, Bar } from '../components/ui'
import { pal, eur } from '../design/calm'
import { activity, members, club, events, topPudler, currentUser } from '../mock/data'

export default function Dashboard() {
  const navigate = useNavigate()
  const next = events.find((e) => !e.past)
  const me = members.find((m) => m.id === currentUser.id)

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <header className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">
            Mittwoch · 23. Juni 2026
          </div>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Guten Tag, Noah.
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="soft" size="md" className="hidden sm:inline-flex">
            ⌕ Suchen
          </Button>
          <Button onClick={() => navigate('/sessions/new')}>+ Kegelabend</Button>
        </div>
      </header>

      {/* Bento-Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Schulden → Mitglieder */}
        <Card
          tone="terra"
          onClick={() => navigate('/members')}
          className="flex cursor-pointer flex-col animate-rise transition hover:brightness-[0.99]"
          style={{ animationDelay: '40ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold tracking-wide text-terra">Meine Schulden</div>
            <Badge tone="terra" className="bg-white/70">
              Frist 21.06.
            </Badge>
          </div>
          <div className="mt-3 font-display text-6xl font-medium leading-[0.9] tracking-tight tnum text-ink">
            {eur(me.debt)} <span className="text-3xl font-normal text-terra">€</span>
          </div>
          <div className="mt-1.5 text-[12px] text-terra">14 Strafen · 2 Beiträge offen</div>
          <div className="flex-1" />
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/60 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-terra">IBAN</div>
              <div className="truncate font-mono text-[11.5px] text-ink">{club.iban}</div>
            </div>
            <Button
              variant="terra"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                navigate('/profile')
              }}
            >
              Begleichen
            </Button>
          </div>
        </Card>

        {/* Nächster Abend → Termine */}
        <Card
          tone="navy"
          onClick={() => navigate('/calendar')}
          className="flex cursor-pointer flex-col animate-rise transition hover:brightness-[1.03]"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-cream">Nächster Abend</div>
            <span className="text-[11px] text-white/70">in 4 Tagen</span>
          </div>
          <div className="mt-4 flex items-end gap-3.5">
            <div className="font-display text-7xl font-medium leading-[0.8] tracking-tight" style={{ color: pal.cream }}>
              27
            </div>
            <div className="pb-1.5">
              <div className="text-sm font-semibold">Sa, Juni</div>
              <div className="mt-0.5 text-[11px] text-white/70">19:30 Uhr · {next.lane}</div>
            </div>
          </div>
          <div className="flex-1" />
          <div className="mt-4 flex items-center gap-2.5">
            <AvatarStack names={members.slice(0, 4).map((m) => m.name)} ringColor={pal.navy} />
            <div className="text-[11px] text-white/75">8 zugesagt · 2 keine Antwort</div>
          </div>
          <div className="mt-3.5 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate('/calendar/e1')
              }}
              className="flex-1 rounded-full py-2.5 text-[12px] font-semibold"
              style={{ background: pal.cream, color: pal.navy }}
            >
              Zusagen
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate('/calendar/e1')
              }}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-[12px] font-medium text-white"
            >
              Absagen
            </button>
          </div>
        </Card>

        {/* Vereinskasse → Kassenbuch */}
        <Card
          onClick={() => navigate('/treasury')}
          className="flex cursor-pointer flex-col animate-rise transition hover:border-ink/20"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink-soft">Vereinskasse</div>
            <Badge tone="sage">▲ +6,2 %</Badge>
          </div>
          <div className="mt-2.5 font-display text-5xl font-medium leading-none tracking-tight tnum">
            {eur(club.treasuryBalance)} <span className="text-2xl font-normal text-ink-dim">€</span>
          </div>
          <Sparkline />
          <div className="flex-1" />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-card-edge pt-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink-dim">Ein · 30 Tage</div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-sage">+ 312,40 €</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink-dim">Aus · 30 Tage</div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-terra">− 84,20 €</div>
            </div>
          </div>
        </Card>

        {/* Aktivität */}
        <Card className="flex flex-col sm:col-span-2 animate-rise" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink-soft">Aktivität</div>
            <span className="text-[11px] text-ink-dim">Alle ansehen →</span>
          </div>

          {/* Freigabe-Hinweis */}
          <Link
            to="/sessions/s1/review"
            className="mt-3 flex items-center gap-3 rounded-2xl bg-amber-bg p-3 transition hover:brightness-[0.98]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />
            <div className="flex-1 text-[12px] leading-snug">
              <strong className="text-ink">Einreichung wartet auf Freigabe</strong>
              <span className="text-ink-soft"> · 09.05. · H. Meier · 12 Teilnehmer · Σ 14,80 €</span>
            </div>
            <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-bg">
              Prüfen
            </span>
          </Link>

          <div className="mt-1.5">
            {activity.slice(0, 5).map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-2.5"
                style={{ borderBottom: i < 4 ? `1px solid ${pal.cardEdge}` : 'none' }}
              >
                <Avatar name={f.who} size={32} />
                <div className="flex-1 text-[13px] leading-tight">
                  <div>
                    <strong>{f.who}</strong> <span className="text-ink-soft">{f.what}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-dim">{f.when}</div>
                </div>
                <Badge tone={f.tone}>{f.tag}</Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Mitglieder + Top Pudler → Mitglieder */}
        <Card
          tone="cream"
          onClick={() => navigate('/members')}
          className="flex cursor-pointer flex-col animate-rise transition hover:brightness-[0.99]"
          style={{ animationDelay: '200ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink">Mitglieder</div>
            <span className="text-[11px] font-semibold text-amber">12 aktiv →</span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {members.slice(0, 7).map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 rounded-full bg-white/70 py-1 pl-1 pr-2.5">
                <Avatar name={m.name} size={20} />
                <span className="text-[11px] font-medium">{m.name.split(' ')[0]}</span>
              </div>
            ))}
            <span className="rounded-full bg-ink px-2.5 py-1.5 text-[11px] font-semibold text-bg">
              +5 weitere
            </span>
          </div>
          <div className="flex-1" />
          <div className="mt-4 border-t border-black/10 pt-4">
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate('/stats')
              }}
              className="mb-2 text-[11px] font-semibold text-ink-soft hover:text-ink"
            >
              Top Pudler · Mai →
            </button>
            {topPudler.slice(0, 3).map(([n, e, p], i) => (
              <div key={i} className="mt-1.5 flex items-center gap-2.5">
                <span className="w-16 text-[11px] font-medium">{n.split(' ')[0]} {n.split(' ')[1]?.[0]}.</span>
                <div className="flex-1">
                  <Bar value={p} color={pal.amber} />
                </div>
                <span className="font-mono text-[11px] font-semibold text-amber">{eur(e)} €</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Sparkline() {
  return (
    <svg viewBox="0 0 280 50" className="mt-3.5 w-full">
      <defs>
        <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={pal.sage} stopOpacity="0.25" />
          <stop offset="100%" stopColor={pal.sage} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,40 L20,36 L40,38 L60,32 L80,28 L100,30 L120,22 L140,24 L160,18 L180,14 L200,16 L220,10 L240,8 L260,6 L280,5 L280,50 L0,50 Z"
        fill="url(#spark)"
      />
      <path
        d="M0,40 L20,36 L40,38 L60,32 L80,28 L100,30 L120,22 L140,24 L160,18 L180,14 L200,16 L220,10 L240,8 L260,6 L280,5"
        fill="none"
        stroke={pal.sage}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="280" cy="5" r="3.5" fill={pal.sage} />
    </svg>
  )
}
