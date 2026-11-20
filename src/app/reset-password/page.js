"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

const BUTTON_CLASS =
  "inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60";

export default function ResetPasswordPage() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setHasSession(Boolean(session));
        setReady(true);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) {
          return;
        }
        if (sessionError) {
          throw sessionError;
        }
        setHasSession(Boolean(data.session));
        setReady(true);
      })
      .catch((sessionError) => {
        if (active) {
          setError(sessionError.message);
          setReady(true);
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }

      setPassword("");
      setPasswordConfirmation("");
      setNotice("Tu contraseña se actualizó. Ya puedes volver a HIMB.");
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          HIMB
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          Crear una contraseña nueva
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Elige una contraseña de al menos 8 caracteres para proteger tu cuenta.
        </p>

        {!ready ? (
          <p className="mt-6 text-sm text-slate-600">Verificando el enlace…</p>
        ) : hasSession ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Nueva contraseña
              <input
                autoComplete="new-password"
                className={FIELD_CLASS}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirmar contraseña
              <input
                autoComplete="new-password"
                className={FIELD_CLASS}
                minLength={8}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
                type="password"
                value={passwordConfirmation}
              />
            </label>
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p
                className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                role="status"
              >
                {notice}
              </p>
            ) : null}
            <button className={BUTTON_CLASS} disabled={submitting} type="submit">
              {submitting ? "Actualizando…" : "Actualizar contraseña"}
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
              Este enlace no es válido o ya expiró. Solicita uno nuevo desde el inicio de sesión.
            </p>
            <Link className={BUTTON_CLASS} href="/">
              Volver a HIMB
            </Link>
          </div>
        )}

        {error && !hasSession ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            No se pudo verificar el enlace: {error}
          </p>
        ) : null}

        {hasSession ? (
          <Link
            className="mt-5 block text-center text-sm font-medium text-emerald-800 hover:underline"
            href="/"
          >
            Volver a HIMB
          </Link>
        ) : null}
      </section>
    </main>
  );
}
