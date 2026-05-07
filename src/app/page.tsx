import Link from 'next/link'
import CourseMap from '@/components/CourseMap'
import DataManagementPanel from '@/components/DataManagementPanel'
import OfflineReadinessPanel from '@/components/OfflineReadinessPanel'
import RaceDayChecklist from '@/components/RaceDayChecklist'
import WeatherCachePanel from '@/components/WeatherCachePanel'
import { raceRoute, type RiskLevel } from '@/data/raceRoute'

const riskStyles: Record<RiskLevel, string> = {
  low: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-100',
  severe: 'border-red-400/40 bg-red-400/10 text-[#ff8fcb]',
}

export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-lg border border-[#ff3ea5]/20 bg-[#050505] p-5 shadow-2xl shadow-black/20 sm:p-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage: "url('/racer-x2-mark.svg')",
              backgroundPosition: 'center 45%',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'min(64rem, 88vw)',
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(255,62,165,0.18),transparent_22rem),linear-gradient(90deg,rgba(0,0,0,0.1),rgba(0,0,0,0.76))]" />
          <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff8fcb]">
                2026 Cross-Texas Solar Car Challenge
              </p>
              <h1 className="mt-3 flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 text-3xl font-black text-white sm:text-4xl">
                <span className="font-black italic tracking-tight text-[#ff3ea5] drop-shadow-[0_0_16px_rgba(255,62,165,0.45)]">
                  RACER X²
                </span>
                <span>Solar Race Strategy</span>
                <span>Dashboard</span>
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Interactive route navigation, terrain risk, and energy planning for Temple City&apos;s all-female solar car team.
              </p>
            </div>
            <div className="rounded-lg border border-[#ff3ea5]/25 bg-[#ff3ea5]/10 px-4 py-3 text-sm font-semibold text-[#ff8fcb]">
              Static route model ready for telemetry, DEM elevation, live weather, and race-day strategy calls.
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-4 shadow-xl shadow-black/20 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric label="Total race miles" value="619.8" />
          <SummaryMetric label="Hardest terrain day" value="Day 3" />
          <SummaryMetric label="Highest energy management risk" value="Day 4" />
          <SummaryMetric label="Most wind-exposed day" value="Day 5" />
        </section>

        <section className="grid gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff8fcb]">
              Full Route
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              Overall Course Map
            </h2>
          </div>
          <CourseMap days={raceRoute} heightClass="h-[360px] md:h-[500px]" />
        </section>

        <WeatherCachePanel raceRoute={raceRoute} />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {raceRoute.map((raceDay) => (
            <article
              key={raceDay.day}
              className="flex min-h-[24rem] flex-col rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-[#ff3ea5]/40 hover:bg-white/[0.07]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#ff8fcb]">
                    Day {raceDay.day}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-white">
                    {raceDay.start.split(',')[0]} to {raceDay.end.split(',')[0]}
                  </h2>
                </div>
                <RiskBadge risk={raceDay.riskLevel} />
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <dt className="text-slate-400">Miles</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {raceDay.distanceMiles}
                  </dd>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <dt className="text-slate-400">Date</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {raceDay.date}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-sm leading-6 text-slate-300">
                {raceDay.terrainSummary}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {raceDay.highways.map((highway) => (
                  <span
                    key={highway}
                    className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200"
                  >
                    {highway}
                  </span>
                ))}
              </div>

              <Link
                href={`/day/${raceDay.day}`}
                className="mt-auto inline-flex h-11 items-center justify-center rounded-md bg-[#ff3ea5] px-4 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
              >
                View Day
              </Link>
            </article>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CollapsibleTile
            title="Race Day Setup"
            summary="Tablet setup steps before departure"
          >
            <ul className="grid gap-3 text-sm leading-6 text-slate-300">
              <SetupItem text="Open this dashboard on each tablet before the race." />
              <SetupItem text="Let it finish caching before leaving reliable internet." />
              <SetupItem text="Add to home screen if the browser offers installation." />
              <SetupItem text="Keep the app open during driving." />
              <SetupItem text="GPS works offline after page load." />
              <SetupItem text="Elevation API/weather updates require internet, but fallback data remains available." />
            </ul>
          </CollapsibleTile>

          <CollapsibleTile
            title="Offline Readiness"
            summary="PWA cache and install checks"
          >
            <OfflineReadinessPanel />
          </CollapsibleTile>

          <CollapsibleTile
            title="Race-Day Checklist"
            summary="Operational pre-drive checklist"
          >
            <RaceDayChecklist />
          </CollapsibleTile>

          <CollapsibleTile
            title="Data Management"
            summary="Import/export local settings"
          >
            <DataManagementPanel />
          </CollapsibleTile>
        </section>
      </div>
    </main>
  )
}

function CollapsibleTile({
  title,
  summary,
  children,
}: {
  title: string
  summary: string
  children: React.ReactNode
}) {
  return (
    <details className="group rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">{summary}</p>
        </div>
        <span className="rounded border border-[#ff3ea5]/30 bg-[#ff3ea5]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[#ff8fcb]">
          Open
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}

function SetupItem({ text }: { text: string }) {
  return (
    <li className="rounded-md border border-white/10 bg-black/20 p-3">
      {text}
    </li>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={`rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${riskStyles[risk]}`}
    >
      {risk}
    </span>
  )
}


