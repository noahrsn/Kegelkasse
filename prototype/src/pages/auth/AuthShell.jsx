import { pal } from '../../design/calm'

/* Mobile-first: zentriertes Formular. Desktop: zweispaltig mit Bento-Schaufenster. */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Schaufenster — nur Desktop */}
      <div className="relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink font-bold text-bg">K</div>
          <span className="font-display text-lg font-medium">Kegelkasse</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Showcase tone={pal.terraBg} fg={pal.terra} label="Meine Schulden" big="17,60 €" sub="14 Strafen offen" />
          <Showcase tone={pal.navy} fg={pal.cream} dark label="Nächster Abend" big="23" sub="Sa · 19:30 · Bahn 3+4" />
          <Showcase tone={pal.sageBg} fg={pal.sage} label="Vereinskasse" big="1.428 €" sub="▲ +6,2 % im Monat" />
          <Showcase tone={pal.cream} fg={pal.amber} label="Top Pudler" big="38" sub="Martin H. · Mai" />
        </div>

        <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">
          Strafen erfassen, Beiträge verwalten, Termine planen — der ruhige Weg, die Vereinskasse
          deines Kegelclubs im Griff zu behalten.
        </p>
      </div>

      {/* Formular */}
      <div className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink font-bold text-bg">K</div>
            <span className="font-display text-lg font-medium">Kegelkasse</span>
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[14px] text-ink-soft">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Showcase({ tone, fg, dark, label, big, sub }) {
  return (
    <div
      className="flex flex-col justify-between rounded-[24px] p-5"
      style={{ background: tone, color: dark ? '#fff' : pal.ink, minHeight: 150 }}
    >
      <div className="text-[12px] font-semibold" style={{ color: fg }}>
        {label}
      </div>
      <div>
        <div className="font-display text-4xl font-medium tracking-tight tnum" style={{ color: dark ? fg : pal.ink }}>
          {big}
        </div>
        <div className="mt-1 text-[11px]" style={{ color: dark ? 'rgba(255,255,255,0.7)' : pal.inkSoft }}>
          {sub}
        </div>
      </div>
    </div>
  )
}
