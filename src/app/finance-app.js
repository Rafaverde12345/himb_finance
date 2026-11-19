"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

const EMPTY_DATA = {
  accounts: [],
  budgets: [],
  categories: [],
  goals: [],
  transactions: [],
};

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

const BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60";

const ACCOUNT_TYPES = [
  ["checking", "Cuenta corriente"],
  ["savings", "Ahorros"],
  ["cash", "Efectivo"],
  ["credit", "Tarjeta de crédito"],
  ["investment", "Inversión"],
  ["other", "Otra"],
];

function formatMoney(value, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(value));
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es");
}

function FormField({ children, label }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function Panel({ children, description, title }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }) {
  return <p className="py-3 text-sm text-slate-500">{children}</p>;
}

function CategoryName({ categoryId, categories }) {
  return categories.find((category) => category.id === categoryId)?.name ?? "Sin categoría";
}

function AccountName({ accountId, accounts }) {
  return accounts.find((account) => account.id === accountId)?.name ?? "Cuenta no disponible";
}

export default function FinanceApp() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const sessionRef = useRef(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(EMPTY_DATA);
  const [loadedForUser, setLoadedForUser] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(
    async (userId) => {
      const results = await Promise.all([
        supabase
          .from("himb_accounts")
          .select("id, name, account_type, currency, opening_balance, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("himb_categories")
          .select("id, name, kind, created_at")
          .order("name")
          .limit(100),
        supabase
          .from("himb_transactions")
          .select("id, account_id, category_id, kind, amount, description, occurred_on")
          .order("occurred_on", { ascending: false })
          .limit(100),
        supabase
          .from("himb_budgets")
          .select("id, name, category_id, monthly_limit, period_start")
          .order("period_start", { ascending: false })
          .limit(100),
        supabase
          .from("himb_goals")
          .select("id, name, target_amount, current_amount, target_date")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const failedQuery = results.find((result) => result.error);
      if (failedQuery) {
        throw failedQuery.error;
      }

      if (sessionRef.current?.user?.id !== userId) {
        return;
      }

      setData({
        accounts: results[0].data,
        categories: results[1].data,
        transactions: results[2].data,
        budgets: results[3].data,
        goals: results[4].data,
      });
      setLoadedForUser(userId);
      setLoadError("");
    },
    [supabase],
  );

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      setAuthLoading(false);
      setActionError("");
      setNotice("");
    });

    supabase.auth
      .getSession()
      .then(({ data: sessionData, error }) => {
        if (!active) {
          return;
        }
        if (error) {
          throw error;
        }
        sessionRef.current = sessionData.session;
        setSession(sessionData.session);
        setAuthLoading(false);
      })
      .catch((error) => {
        if (active) {
          setLoadError(error.message);
          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    loadData(session.user.id).catch((error) => {
      if (active && sessionRef.current?.user?.id === session.user.id) {
        setLoadedForUser(session.user.id);
        setLoadError(error.message);
      }
    });

    return () => {
      active = false;
    };
  }, [loadData, session]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthSubmitting(true);
    setActionError("");
    setNotice("");

    try {
      const result =
        authMode === "signup"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        throw result.error;
      }

      if (authMode === "signup" && !result.data.session) {
        setNotice("Cuenta creada. Revisa tu correo para confirmar el registro.");
      } else {
        setNotice("Sesión iniciada.");
      }
      setPassword("");
    } catch (error) {
      setActionError(error.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    setActionError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function saveRecord(event, table, makePayload) {
    event.preventDefault();
    const form = event.currentTarget;
    const userId = session?.user?.id;

    if (!userId) {
      setActionError("Inicia sesión antes de guardar datos.");
      return;
    }

    setSaving(true);
    setActionError("");
    setLoadError("");
    setNotice("");
    let saved = false;

    try {
      const payload = makePayload(new FormData(form));
      const { error } = await supabase.from(table).insert(payload);
      if (error) {
        throw error;
      }

      saved = true;
      form.reset();
      await loadData(userId);
      setNotice("Registro guardado.");
    } catch (error) {
      setActionError(
        saved
          ? `El registro se guardó, pero no se pudo actualizar la lista: ${error.message}`
          : error.message,
      );
    } finally {
      setSaving(false);
    }
  }

  const dataIsLoading = Boolean(session) && loadedForUser !== session.user.id;

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-slate-600">Conectando con HIMB…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            HIMB
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            Tu espacio financiero
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Inicia sesión para consultar y guardar tu información financiera.
          </p>

          {loadError ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            No se pudo recuperar la sesión: {loadError}
          </p>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleAuthSubmit}>
            <FormField label="Correo electrónico">
              <input
                autoComplete="email"
                className={FIELD_CLASS}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </FormField>
            <FormField label="Contraseña">
              <input
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                className={FIELD_CLASS}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </FormField>
            {actionError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {actionError}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                {notice}
              </p>
            ) : null}
            <button className={`${BUTTON_CLASS} w-full`} disabled={authSubmitting} type="submit">
              {authSubmitting
                ? "Procesando…"
                : authMode === "signup"
                  ? "Crear cuenta"
                  : "Iniciar sesión"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            {authMode === "signup" ? "¿Ya tienes cuenta?" : "¿Primera vez en HIMB?"}{" "}
            <button
              className="font-semibold text-emerald-800 underline-offset-4 hover:underline"
              onClick={() => {
                setAuthMode(authMode === "signup" ? "signin" : "signup");
                setActionError("");
                setNotice("");
              }}
              type="button"
            >
              {authMode === "signup" ? "Inicia sesión" : "Crear cuenta"}
            </button>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              HIMB
            </p>
            <p className="mt-1 text-sm text-slate-600">{session.user.email}</p>
          </div>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={handleSignOut} type="button">
            Cerrar sesión
          </button>
        </header>

        <div className="py-7">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Panel financiero
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Tus registros son privados y están protegidos por usuario.
          </p>
        </div>

        {actionError ? (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {actionError}
          </p>
        ) : null}
        {loadError ? (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            No se pudieron cargar los datos: {loadError}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            {notice}
          </p>
        ) : null}

        {dataIsLoading ? (
          <p className="mb-6 text-sm text-slate-600">Cargando tus datos…</p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel description="Agrega categorías para clasificar ingresos y gastos." title="Categorías">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
              onSubmit={(event) =>
                saveRecord(event, "himb_categories", (form) => ({
                  name: String(form.get("name")).trim(),
                  kind: form.get("kind"),
                }))
              }
            >
              <FormField label="Nombre">
                <input className={FIELD_CLASS} maxLength={100} name="name" required />
              </FormField>
              <FormField label="Tipo">
                <select className={FIELD_CLASS} name="kind">
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </select>
              </FormField>
              <button className={`${BUTTON_CLASS} self-end`} disabled={saving} type="submit">
                Agregar
              </button>
            </form>
            {data.categories.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {data.categories.map((category) => (
                  <li className="flex justify-between py-2 text-sm" key={category.id}>
                    <span className="font-medium text-slate-800">{category.name}</span>
                    <span className="text-slate-500">
                      {category.kind === "income" ? "Ingreso" : "Gasto"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay categorías.</EmptyState>
            )}
          </Panel>

          <Panel description="Registra tus cuentas y saldos iniciales." title="Cuentas">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) =>
                saveRecord(event, "himb_accounts", (form) => ({
                  name: String(form.get("name")).trim(),
                  account_type: form.get("account_type"),
                  currency: String(form.get("currency")).toUpperCase(),
                  opening_balance: Number(form.get("opening_balance")),
                }))
              }
            >
              <FormField label="Nombre">
                <input className={FIELD_CLASS} maxLength={100} name="name" required />
              </FormField>
              <FormField label="Tipo de cuenta">
                <select className={FIELD_CLASS} name="account_type">
                  {ACCOUNT_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Moneda (ISO 4217)">
                <input
                  className={FIELD_CLASS}
                  defaultValue="BRL"
                  maxLength={3}
                  minLength={3}
                  name="currency"
                  pattern="[A-Za-z]{3}"
                  required
                />
              </FormField>
              <FormField label="Saldo inicial">
                <input
                  className={FIELD_CLASS}
                  defaultValue="0"
                  min="-999999999999"
                  name="opening_balance"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <button className={`${BUTTON_CLASS} sm:col-span-2`} disabled={saving} type="submit">
                Agregar cuenta
              </button>
            </form>
            {data.accounts.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {data.accounts.map((account) => (
                  <li className="flex justify-between gap-3 py-2 text-sm" key={account.id}>
                    <span className="font-medium text-slate-800">{account.name}</span>
                    <span className="text-slate-600">
                      {formatMoney(account.opening_balance, account.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay cuentas.</EmptyState>
            )}
          </Panel>

          <Panel description="Cada movimiento se asocia a una cuenta." title="Ingresos y gastos">
            {data.accounts.length ? (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(event) =>
                  saveRecord(event, "himb_transactions", (form) => ({
                    account_id: form.get("account_id"),
                    category_id: form.get("category_id") || null,
                    kind: form.get("kind"),
                    amount: Number(form.get("amount")),
                    description: String(form.get("description")).trim(),
                    occurred_on: form.get("occurred_on"),
                  }))
                }
              >
                <FormField label="Tipo">
                  <select className={FIELD_CLASS} name="kind">
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                  </select>
                </FormField>
                <FormField label="Importe">
                  <input
                    className={FIELD_CLASS}
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </FormField>
                <FormField label="Cuenta">
                  <select className={FIELD_CLASS} name="account_id" required>
                    {data.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Categoría (opcional)">
                  <select className={FIELD_CLASS} name="category_id">
                    <option value="">Sin categoría</option>
                    {data.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Fecha">
                  <input
                    className={FIELD_CLASS}
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    name="occurred_on"
                    required
                    type="date"
                  />
                </FormField>
                <FormField label="Descripción">
                  <input className={FIELD_CLASS} maxLength={240} name="description" />
                </FormField>
                <button className={`${BUTTON_CLASS} sm:col-span-2`} disabled={saving} type="submit">
                  Guardar movimiento
                </button>
              </form>
            ) : (
              <EmptyState>Agrega una cuenta antes de guardar movimientos.</EmptyState>
            )}
            {data.transactions.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {data.transactions.map((transaction) => (
                  <li className="flex flex-wrap justify-between gap-2 py-2 text-sm" key={transaction.id}>
                    <span className="font-medium text-slate-800">
                      {transaction.description || (transaction.kind === "income" ? "Ingreso" : "Gasto")}
                      <span className="ml-2 font-normal text-slate-500">
                        {AccountName({ accountId: transaction.account_id, accounts: data.accounts })} ·{" "}
                        {CategoryName({ categoryId: transaction.category_id, categories: data.categories })}
                      </span>
                    </span>
                    <span className={transaction.kind === "income" ? "text-emerald-700" : "text-slate-700"}>
                      {formatMoney(
                        transaction.amount,
                        data.accounts.find((account) => account.id === transaction.account_id)?.currency,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay movimientos.</EmptyState>
            )}
          </Panel>

          <Panel description="Organiza límites mensuales, opcionalmente por categoría." title="Presupuestos">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) =>
                saveRecord(event, "himb_budgets", (form) => ({
                  name: String(form.get("name")).trim(),
                  category_id: form.get("category_id") || null,
                  monthly_limit: Number(form.get("monthly_limit")),
                  period_start: `${form.get("period_start")}-01`,
                }))
              }
            >
              <FormField label="Nombre">
                <input className={FIELD_CLASS} maxLength={100} name="name" required />
              </FormField>
              <FormField label="Categoría (opcional)">
                <select className={FIELD_CLASS} name="category_id">
                  <option value="">General</option>
                  {data.categories
                    .filter((category) => category.kind === "expense")
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Límite mensual">
                <input
                  className={FIELD_CLASS}
                  min="0.01"
                  name="monthly_limit"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <FormField label="Mes">
                <input
                  className={FIELD_CLASS}
                  defaultValue={new Date().toISOString().slice(0, 7)}
                  name="period_start"
                  required
                  type="month"
                />
              </FormField>
              <button className={`${BUTTON_CLASS} sm:col-span-2`} disabled={saving} type="submit">
                Crear presupuesto
              </button>
            </form>
            {data.budgets.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {data.budgets.map((budget) => (
                  <li className="flex justify-between gap-3 py-2 text-sm" key={budget.id}>
                    <span className="font-medium text-slate-800">
                      {budget.name}
                      <span className="ml-2 font-normal text-slate-500">
                        {CategoryName({ categoryId: budget.category_id, categories: data.categories })} ·{" "}
                        {formatDate(budget.period_start)}
                      </span>
                    </span>
                    <span className="text-slate-600">{formatMoney(budget.monthly_limit)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay presupuestos.</EmptyState>
            )}
          </Panel>

          <Panel description="Define objetivos de ahorro y su progreso actual." title="Metas">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) =>
                saveRecord(event, "himb_goals", (form) => ({
                  name: String(form.get("name")).trim(),
                  target_amount: Number(form.get("target_amount")),
                  current_amount: Number(form.get("current_amount") || 0),
                  target_date: form.get("target_date") || null,
                }))
              }
            >
              <FormField label="Nombre">
                <input className={FIELD_CLASS} maxLength={100} name="name" required />
              </FormField>
              <FormField label="Fecha objetivo (opcional)">
                <input className={FIELD_CLASS} name="target_date" type="date" />
              </FormField>
              <FormField label="Importe objetivo">
                <input
                  className={FIELD_CLASS}
                  min="0.01"
                  name="target_amount"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <FormField label="Ahorrado hasta ahora">
                <input
                  className={FIELD_CLASS}
                  defaultValue="0"
                  min="0"
                  name="current_amount"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <button className={`${BUTTON_CLASS} sm:col-span-2`} disabled={saving} type="submit">
                Crear meta
              </button>
            </form>
            {data.goals.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {data.goals.map((goal) => (
                  <li className="flex justify-between gap-3 py-2 text-sm" key={goal.id}>
                    <span className="font-medium text-slate-800">
                      {goal.name}
                      <span className="ml-2 font-normal text-slate-500">
                        {goal.target_date ? `Hasta ${formatDate(goal.target_date)}` : "Sin fecha objetivo"}
                      </span>
                    </span>
                    <span className="text-slate-600">
                      {formatMoney(goal.current_amount)} / {formatMoney(goal.target_amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay metas.</EmptyState>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
