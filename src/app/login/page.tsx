import LoginForm from '@/components/LoginForm'

export const metadata = {
  title: 'Login | Solar Race Strategy Dashboard',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/30">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff8fcb]">
          Team Access
        </p>
        <h1 className="mt-3 text-3xl font-black text-white">
          Solar Race Strategy Dashboard
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Enter the shared race-team password to access navigation, telemetry,
          strategy, weather, and offline tools.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </section>
    </main>
  )
}


