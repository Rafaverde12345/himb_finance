export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          HIMB
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Gestion financiera clara y organizada
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
          Fundacion inicial de la plataforma independiente para comprender,
          organizar y administrar finanzas personales y patrimoniales.
        </p>
      </section>
    </main>
  );
}
