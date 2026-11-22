"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

const EMPTY_DATA = {
  accounts: [],
  budgets: [],
  categories: [],
  goals: [],
  transfers: [],
  transactions: [],
};

const BOARD_BLOCK_TYPES = [
  { type: "income", label: "Ingresos", newTitle: "Nuevo ingreso", icon: "⊕", tone: "#15924a" },
  { type: "expense", label: "Gastos", newTitle: "Nuevo gasto", icon: "⊖", tone: "#d33a3a" },
  { type: "asset", label: "Activo", newTitle: "Nuevo activo", icon: "⇧", tone: "#1976d2" },
  { type: "liability", label: "Pasivo", newTitle: "Nuevo pasivo", icon: "⇩", tone: "#b88700" },
  { type: "patrimony", label: "Patrimonio", newTitle: "Nuevo patrimonio", icon: "≡", tone: "#1976d2" },
];
const BOARD_STORAGE_EVENT = "himb-finance-board-change";

function subscribeToBoardBlocks(storageKey, notify) {
  const handleStorage = (event) => {
    if (event.key === storageKey || event.key === `${storageKey}:hidden-cards` || event.key === null) {
      notify();
    }
  };
  const handleBoardChange = (event) => {
    if (event.detail === storageKey) {
      notify();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(BOARD_STORAGE_EVENT, handleBoardChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(BOARD_STORAGE_EVENT, handleBoardChange);
  };
}

function getBoardBlocksSnapshot(storageKey) {
  return typeof window === "undefined" ? "[]" : window.localStorage.getItem(storageKey) ?? "[]";
}

function getHiddenBoardCardsSnapshot(storageKey) {
  if (typeof window === "undefined") {
    return "[]";
  }

  try {
    return window.localStorage.getItem(`${storageKey}:hidden-cards`) ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerBoardBlocksSnapshot() {
  return "[]";
}

function createBoardItemId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

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

const NAV_ITEMS = [
  ["overview", "Resumen", "Vista general"],
  ["analysis", "Análisis", "Gráficas por período"],
  ["activity", "Movimientos", "Ingresos y gastos"],
  ["accounts", "Cuentas", "Saldos y medios"],
  ["planning", "Planificación", "Presupuestos y metas"],
  ["categories", "Categorías", "Clasificación"],
];

function formatMoney(value, currency = "BRL") {
  return new Intl.NumberFormat("es", {
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

async function fetchAllRows(createQuery) {
  const pageSize = 1000;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await createQuery().range(offset, offset + pageSize - 1);
    if (error) {
      throw error;
    }

    rows.push(...data);
    if (data.length < pageSize) {
      return rows;
    }
  }
}

function MonthlyCashFlowChart({ currency, months }) {
  const left = 58;
  const top = 14;
  const chartWidth = 430;
  const chartHeight = 145;
  const baseline = top + chartHeight;
  const maxValue = Math.max(0, ...months.flatMap((month) => [month.income, month.expenses]));
  const scale = maxValue || 1;
  const groupWidth = chartWidth / months.length;
  const barWidth = 17;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Leyenda">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
          Ingresos
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
          Gastos
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          aria-label={`Ingresos y gastos de los últimos seis meses en ${currency}`}
          className="h-auto min-w-[520px] w-full"
          role="img"
          viewBox="0 0 520 205"
        >
          <title>Ingresos y gastos mensuales en {currency}</title>
          {Array.from({ length: 5 }, (_, index) => {
            const value = (scale / 4) * (4 - index);
            const y = top + (chartHeight / 4) * index;

            return (
              <g key={index}>
                <line
                  className="stroke-slate-200"
                  x1={left}
                  x2={left + chartWidth}
                  y1={y}
                  y2={y}
                />
                <text
                  className="fill-slate-500 text-[10px]"
                  textAnchor="end"
                  x={left - 8}
                  y={y + 3}
                >
                  {new Intl.NumberFormat("es", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value)}
                </text>
              </g>
            );
          })}
          {months.map((month, index) => {
            const center = left + groupWidth * index + groupWidth / 2;
            const incomeHeight = (month.income / scale) * chartHeight;
            const expenseHeight = (month.expenses / scale) * chartHeight;

            return (
              <g key={month.key}>
                <rect
                  fill="#059669"
                  height={incomeHeight}
                  rx="3"
                  width={barWidth}
                  x={center - barWidth - 2}
                  y={baseline - incomeHeight}
                >
                  <title>
                    {month.label}: ingresos {formatMoney(month.income, currency)}
                  </title>
                </rect>
                <rect
                  fill="#f43f5e"
                  height={expenseHeight}
                  rx="3"
                  width={barWidth}
                  x={center + 2}
                  y={baseline - expenseHeight}
                >
                  <title>
                    {month.label}: gastos {formatMoney(month.expenses, currency)}
                  </title>
                </rect>
                <text
                  className="fill-slate-600 text-[10px]"
                  textAnchor="middle"
                  x={center}
                  y={baseline + 18}
                >
                  {month.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function FinanceBoardCard({
  children,
  currency,
  dark,
  id,
  onDelete,
  onDragStart,
  position,
  title,
  total,
  tone,
  type,
}) {
  const styles = {
    income: dark
      ? "border-[#34d27b] text-[#34d27b]"
      : "border-[#15924a] text-[#15924a]",
    expense: dark ? "border-[#ff5a5a] text-[#ff5a5a]" : "border-[#d33a3a] text-[#d33a3a]",
    asset: dark ? "border-[#3bb0ff] text-[#3bb0ff]" : "border-[#1976d2] text-[#1976d2]",
    liability: dark ? "border-[#f5c842] text-[#f5c842]" : "border-[#b88700] text-[#8a6500]",
    patrimony: dark ? "border-[#3bb0ff] text-[#3bb0ff]" : "border-[#1976d2] text-[#1976d2]",
  };

  return (
    <section
      className={`absolute flex max-h-[440px] w-[340px] flex-col overflow-hidden rounded-[10px] border shadow-[0_6px_20px_rgba(0,0,0,.12)] ${
        dark ? "border-[#34363c] bg-[#27282c] text-[#e9eaee] shadow-black/50" : "border-[#cfd4de] bg-white text-[#1f2430]"
      }`}
      data-board-card
      style={{ colorScheme: dark ? "dark" : "light", left: position.x, top: position.y }}
    >
      <header
        className={`flex cursor-grab touch-none items-center gap-2 border-b-2 px-3 py-2 active:cursor-grabbing ${
          dark ? "border-[#34363c] bg-[#1e1f22]" : "border-[#cfd4de] bg-[#f4f5f8]"
        }`}
        onPointerDown={(event) => {
          if (!event.target.closest("input, button")) {
            onDragStart(id, event, position);
          }
        }}
        style={{ borderBottomColor: tone }}
      >
        <span aria-hidden="true" className={`text-xl ${dark ? "text-[#8b909b]" : "text-slate-400"}`}>⠿</span>
        <h2 className={`min-w-0 flex-1 truncate text-sm font-bold ${styles[type]}`}>
          {title}
        </h2>
        <strong className={`whitespace-nowrap text-sm tabular-nums ${styles[type]}`}>
          {formatMoney(total, currency)}
        </strong>
        {onDelete ? (
          <button
            aria-label="Quitar cuadro"
            title="Quitar cuadro de la pizarra"
            className={`rounded px-1.5 text-xs font-medium ${dark ? "text-[#8b909b] hover:text-[#ff5a5a]" : "text-slate-500 hover:text-rose-700"}`}
            onClick={onDelete}
            type="button"
          >
            ×
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function FinanceBoard({
  currency,
  currencies,
  endDateLabel,
  endDate,
  onCurrencyChange,
  onEndDateChange,
  onStartDateChange,
  rangeValid,
  startDate,
  userId,
  wealthAccounts,
}) {
  const storageKey = `himb-finance-board-v1:${userId}`;
  const subscribe = useCallback(
    (notify) => subscribeToBoardBlocks(storageKey, notify),
    [storageKey],
  );
  const getSnapshot = useCallback(() => getBoardBlocksSnapshot(storageKey), [storageKey]);
  const blocksSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerBoardBlocksSnapshot,
  );
  const hiddenCardsSnapshot = useSyncExternalStore(
    subscribe,
    useCallback(() => getHiddenBoardCardsSnapshot(storageKey), [storageKey]),
    getServerBoardBlocksSnapshot,
  );
  let hiddenCards = [];
  try {
    const parsedHiddenCards = JSON.parse(hiddenCardsSnapshot);
    if (Array.isArray(parsedHiddenCards)) {
      hiddenCards = parsedHiddenCards.filter((id) => ["income", "expense", "wealth"].includes(id));
    }
  } catch {
    hiddenCards = [];
  }
  let customBlocks = [];
  let blockLoadError = "";
  try {
    const parsedBlocks = JSON.parse(blocksSnapshot);
    if (
      !Array.isArray(parsedBlocks) ||
      parsedBlocks.some(
        (block) =>
          !block ||
          typeof block.id !== "string" ||
          !BOARD_BLOCK_TYPES.some((option) => option.type === block.type) ||
          typeof block.title !== "string" ||
          (Array.isArray(block.folders)
            ? block.folders.some(
                (folder) =>
                  !folder ||
                  typeof folder.id !== "string" ||
                  typeof folder.title !== "string" ||
                  !Array.isArray(folder.items) ||
                  folder.items.some(
                    (item) =>
                      !item ||
                      typeof item.id !== "string" ||
                      typeof item.name !== "string" ||
                      !Number.isFinite(Number(item.amount)),
                  ),
              )
            : !Array.isArray(block.items) ||
              block.items.some(
                (item) =>
                  !item ||
                  typeof item.id !== "string" ||
                  typeof item.name !== "string" ||
                  !Number.isFinite(Number(item.amount)),
              )),
      )
    ) {
      throw new Error("Los cuadros guardados no tienen un formato válido.");
    }
    customBlocks = parsedBlocks.map((block) => ({
      ...block,
      folders:
        block.folders ??
        (block.items?.length
          ? [{ id: `${block.id}-folder-general`, title: "General", items: block.items }]
          : []),
    }));
    for (const [id, type, title] of [
      ["income", "income", "Ingresos"],
      ["expense", "expense", "Gastos"],
    ]) {
      if (!customBlocks.some((block) => block.id === id)) {
        customBlocks.push({ id, type, title, folders: [] });
      }
    }
  } catch (error) {
    customBlocks = [];
    blockLoadError = `No se pudieron leer los cuadros guardados: ${error.message}`;
  }
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 0.9 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [positions, setPositions] = useState({
    income: { x: 32, y: 32 },
    expense: { x: 32, y: 490 },
    wealth: { x: 408, y: 32 },
  });
  const [expandedGroups, setExpandedGroups] = useState({});
  const [dark, setDark] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const boardRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === boardRef.current);
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () =>
      setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      if (drag.kind === "card") {
        setPositions((current) => ({
          ...current,
          [drag.id]: {
            x: drag.position.x + (event.clientX - drag.startX) / camera.scale,
            y: drag.position.y + (event.clientY - drag.startY) / camera.scale,
          },
        }));
      } else {
        setCamera((current) => ({
          ...current,
          x: drag.camera.x + event.clientX - drag.startX,
          y: drag.camera.y + event.clientY - drag.startY,
        }));
      }
    };
    const stopDragging = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [camera.scale]);

  const beginCardDrag = (id, event, position) => {
    event.preventDefault();
    dragRef.current = {
      kind: "card",
      id,
      startX: event.clientX,
      startY: event.clientY,
      position,
    };
  };
  const beginCanvasPan = (event) => {
    if (event.target.closest("[data-board-card]")) {
      return;
    }

    dragRef.current = {
      kind: "canvas",
      startX: event.clientX,
      startY: event.clientY,
      camera,
    };
  };
  const zoomBy = (factor) => {
    const viewport = viewportRef.current;
    setCamera((current) => {
      const scale = Math.min(1.5, Math.max(0.45, current.scale * factor));
      const ratio = scale / current.scale;
      const centerX = (viewport?.clientWidth ?? 0) / 2;
      const centerY = (viewport?.clientHeight ?? 0) / 2;
      return {
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        scale,
      };
    });
  };
  const focusCard = (position) => {
    setCamera((current) => ({
      ...current,
      x: viewportSize.width / 2 - (position.x + 170) * current.scale,
      y: viewportSize.height / 2 - (position.y + 220) * current.scale,
    }));
  };
  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !(current[groupId] ?? true),
    }));
  };
  const netWorth = wealthAccounts.reduce((total, account) => total + account.amount, 0);
  const assetAccounts = wealthAccounts.filter((account) => account.account_type !== "credit");
  const liabilityAccounts = wealthAccounts.filter((account) => account.account_type === "credit");
  const assetTotal = assetAccounts.reduce((total, account) => total + account.amount, 0);
  const liabilityTotal = -liabilityAccounts.reduce((total, account) => total + account.amount, 0);
  const background = dark ? "#17181b" : "#eef0f4";
  const dots = dark ? "#34363c" : "#cfd4de";
  const muted = dark ? "text-[#8b909b]" : "text-[#7b8394]";
  const border = dark ? "border-[#34363c]" : "border-[#cfd4de]";
  const groupBackground = dark ? "bg-[#1e1f22]" : "bg-[#f4f5f8]";

  const saveCustomBlocks = (nextBlocks) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextBlocks));
      window.dispatchEvent(new CustomEvent(BOARD_STORAGE_EVENT, { detail: storageKey }));
      setStorageError("");
    } catch (error) {
      setStorageError(`No se pudieron guardar los cuadros: ${error.message}`);
    }
  };
  const saveHiddenCards = (nextCards) => {
    try {
      window.localStorage.setItem(`${storageKey}:hidden-cards`, JSON.stringify(nextCards));
      window.dispatchEvent(new CustomEvent(BOARD_STORAGE_EVENT, { detail: storageKey }));
      setStorageError("");
    } catch (error) {
      setStorageError(`No se pudieron actualizar los cuadros: ${error.message}`);
    }
  };
  const updateCustomBlock = (id, update) => {
    saveCustomBlocks(customBlocks.map((block) => (block.id === id ? update(block) : block)));
  };
  const addCustomBlock = (type, id) => {
    const definition = BOARD_BLOCK_TYPES.find((option) => option.type === type);
    if (!definition) {
      return;
    }
    saveCustomBlocks([
      ...customBlocks,
      { id, type, title: definition.newTitle, folders: [] },
    ]);
    setPositions((current) => ({
      ...current,
      [id]: {
        x: 408 + (customBlocks.length % 2) * 376,
        y: 490 + Math.floor(customBlocks.length / 2) * 458,
      },
    }));
  };
  const addCustomFolder = (block, folderId) => {
    updateCustomBlock(block.id, (current) => ({
      ...current,
      folders: [...current.folders, { id: folderId, title: "Nueva carpeta", items: [] }],
    }));
  };
  const addCustomItem = (block, folderId, itemId) => {
    updateCustomBlock(block.id, (current) => ({
      ...current,
      folders: current.folders.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              items: [...folder.items, { id: itemId, name: "Nueva partida", amount: 0 }],
            }
          : folder,
      ),
    }));
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === boardRef.current) {
        await document.exitFullscreen();
      } else {
        if (!boardRef.current?.requestFullscreen) {
          throw new Error("Este navegador no permite pantalla completa.");
        }
        await boardRef.current.requestFullscreen();
      }
      setFullscreenError("");
    } catch (error) {
      setFullscreenError(`No se pudo cambiar a pantalla completa: ${error.message}`);
    }
  };

  const locatorCards = [
    ...(!hiddenCards.includes("wealth")
      ? [{
          id: "wealth",
          title: "Patrimonio neto",
          position: positions.wealth,
          tone: dark ? "#3bb0ff" : "#1976d2",
        }]
      : []),
    ...customBlocks
      .filter((block) => !["income", "expense"].includes(block.id) || !hiddenCards.includes(block.id))
      .map((block, index) => ({
        id: block.id,
        title: block.title || "Cuadro sin nombre",
        tone: dark
          ? {
              income: "#34d27b",
              expense: "#ff5a5a",
              asset: "#3bb0ff",
              liability: "#f5c842",
              patrimony: "#3bb0ff",
            }[block.type]
          : BOARD_BLOCK_TYPES.find((option) => option.type === block.type).tone,
        position:
          positions[block.id] ?? {
            x: 408 + (index % 2) * 376,
            y: 490 + Math.floor(index / 2) * 458,
          },
      })),
  ].flatMap((card) => {
    if (!viewportSize.width || !viewportSize.height) return [];
    const left = camera.x + card.position.x * camera.scale;
    const top = camera.y + card.position.y * camera.scale;
    const width = 340 * camera.scale;
    const height = 440 * camera.scale;
    if (
      left + width > 0 &&
      left < viewportSize.width &&
      top + height > 0 &&
      top < viewportSize.height
    ) {
      return [];
    }
    const targetX = left + width / 2;
    const targetY = top + height / 2;
    const angle = Math.atan2(targetY - viewportSize.height / 2, targetX - viewportSize.width / 2);
    return [{
      ...card,
      markerX: Math.min(viewportSize.width - 24, Math.max(24, targetX)),
      markerY: Math.min(viewportSize.height - 24, Math.max(24, targetY)),
      angle,
    }];
  });

  return (
    <section
      aria-label="Pizarra financiera"
      className={
        isFullscreen
          ? `flex h-screen w-screen flex-col overflow-hidden border-0 shadow-none ${dark ? "bg-[#17181b]" : "bg-[#eef0f4]"}`
          : `overflow-hidden rounded-2xl border shadow-sm ${border}`
      }
      ref={boardRef}
      style={{ color: dark ? "#e9eaee" : "#1f2430", colorScheme: dark ? "dark" : "light" }}
    >
      <div className={`shrink-0 space-y-3 border-b p-3 ${border} ${dark ? "bg-[#27282c]" : "bg-white"}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Desde", startDate, onStartDateChange],
            ["Hasta", endDate, onEndDateChange],
          ].map(([label, value, onChange]) => (
            <label className={`block text-xs font-medium ${dark ? "text-[#e9eaee]" : "text-slate-700"}`} key={label}>
              {label}
              <input
                className={`${FIELD_CLASS} ${dark ? "border-[#34363c] bg-[#1e1f22] text-[#e9eaee]" : ""}`}
                onChange={(event) => onChange(event.target.value)}
                style={{ color: dark ? "#e9eaee" : "#0f172a", colorScheme: dark ? "dark" : "light" }}
                type="date"
                value={value}
              />
            </label>
          ))}
          <label className={`block text-xs font-medium ${dark ? "text-[#e9eaee]" : "text-slate-700"}`}>
            Moneda
            <select
              className={`${FIELD_CLASS} ${dark ? "border-[#34363c] bg-[#1e1f22] text-[#e9eaee]" : ""}`}
              disabled={!currencies.length}
              onChange={(event) => onCurrencyChange(event.target.value)}
              style={{ color: dark ? "#e9eaee" : "#0f172a", colorScheme: dark ? "dark" : "light" }}
              value={currency}
            >
              {currencies.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              {!currencies.length ? <option value="">Sin cuentas</option> : null}
            </select>
          </label>
        </div>
        {!rangeValid ? (
          <p className="text-sm text-rose-500" role="alert">
            Selecciona un período válido: la fecha de inicio debe ser anterior o igual a la fecha
            final.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {hiddenCards.includes("income") ? (
              <button
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${border} ${groupBackground} hover:opacity-80`}
                onClick={() => saveHiddenCards(hiddenCards.filter((id) => id !== "income"))}
                type="button"
              >
                Mostrar Ingresos
              </button>
            ) : null}
            {hiddenCards.includes("expense") ? (
              <button
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${border} ${groupBackground} hover:opacity-80`}
                onClick={() => saveHiddenCards(hiddenCards.filter((id) => id !== "expense"))}
                type="button"
              >
                Mostrar Gastos
              </button>
            ) : null}
            {hiddenCards.includes("wealth") ? (
              <button
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${border} ${groupBackground} hover:opacity-80`}
                onClick={() => saveHiddenCards(hiddenCards.filter((id) => id !== "wealth"))}
                type="button"
              >
                Mostrar Patrimonio
              </button>
            ) : null}
            {BOARD_BLOCK_TYPES.map((option) => (
              <button
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${border} ${groupBackground} hover:opacity-80`}
                key={option.type}
                onClick={() => addCustomBlock(option.type, createBoardItemId("custom"))}
                type="button"
              >
                + {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Alejar"
              className={`rounded-lg border px-3 py-1.5 text-sm ${border} ${groupBackground}`}
              onClick={() => zoomBy(1 / 1.2)}
              type="button"
            >
              −
            </button>
            <span aria-live="polite" className={`min-w-12 text-center text-xs tabular-nums ${muted}`}>
              {Math.round(camera.scale * 100)}%
            </span>
            <button
              aria-label="Acercar"
              className={`rounded-lg border px-3 py-1.5 text-sm ${border} ${groupBackground}`}
              onClick={() => zoomBy(1.2)}
              type="button"
            >
              +
            </button>
            <button
              className={`rounded-lg border px-3 py-1.5 text-sm ${border} ${groupBackground}`}
              onClick={() => {
                setCamera({ x: 0, y: 0, scale: 0.9 });
                setPositions({
                  income: { x: 32, y: 32 },
                  expense: { x: 32, y: 490 },
                  wealth: { x: 408, y: 32 },
                });
              }}
              type="button"
            >
              Centrar
            </button>
            <button
              aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"}
              className={`rounded-lg border px-3 py-1.5 text-sm ${border} ${groupBackground}`}
              onClick={() => setDark((value) => !value)}
              type="button"
            >
              {dark ? "☀" : "☾"}
            </button>
            <button
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${border} ${groupBackground}`}
              onClick={toggleFullscreen}
              type="button"
            >
              {isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            </button>
          </div>
        </div>
        <p className={`text-xs ${muted}`}>
          Ingresos y Gastos son cuadros manuales. Añade carpetas como subtítulos y partidas dentro
          de cada una. Arrastra las tarjetas para organizarlas, el fondo para moverte y usa la rueda
          para acercar o alejar; los cambios se guardan en este navegador.
        </p>
        {blockLoadError || storageError || fullscreenError ? (
          <p className="text-sm text-rose-500" role="alert">
            {blockLoadError || storageError || fullscreenError}
          </p>
        ) : null}
      </div>

      <div
        className={`relative min-h-[480px] flex-1 select-none overflow-hidden touch-none ${
          isFullscreen ? "min-h-0" : "h-[min(76vh,760px)]"
        }`}
        onPointerDown={beginCanvasPan}
        onWheel={(event) => {
          event.preventDefault();
          zoomBy(Math.exp(-event.deltaY * 0.003));
        }}
        ref={viewportRef}
        style={{
          backgroundColor: background,
          backgroundImage: `radial-gradient(${dots} 1.2px, transparent 1.2px)`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          backgroundSize: `${24 * camera.scale}px ${24 * camera.scale}px`,
          cursor: "grab",
          overscrollBehavior: "contain",
        }}
      >
        <div
          className="absolute left-0 top-0 h-[3000px] w-[1600px]"
          data-board-pan-area
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transformOrigin: "top left",
          }}
        >
          {!hiddenCards.includes("wealth") ? <FinanceBoardCard
            currency={currency}
            dark={dark}
            id="wealth"
            onDelete={() => saveHiddenCards([...hiddenCards, "wealth"])}
            onDragStart={beginCardDrag}
            position={positions.wealth}
            title="≡ Patrimonio neto"
            tone={dark ? "#3bb0ff" : "#1976d2"}
            total={netWorth}
            type="patrimony"
          >
            <div className="min-h-24 overflow-y-auto py-2">
              <div className={`mx-3 mb-2 flex justify-between rounded-md px-2 py-1.5 text-xs font-semibold ${groupBackground}`}>
                <span>Activos</span>
                <span className="tabular-nums">{formatMoney(assetTotal, currency)}</span>
              </div>
              {assetAccounts.map((account) => (
                <div className="flex justify-between gap-2 px-4 py-1.5 text-sm" key={account.id}>
                  <span className="min-w-0 truncate">{account.name}</span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatMoney(account.amount, currency)}
                  </span>
                </div>
              ))}
              <div className={`mx-3 mb-2 mt-3 flex justify-between rounded-md px-2 py-1.5 text-xs font-semibold ${groupBackground}`}>
                <span>Pasivos</span>
                <span className="tabular-nums">{formatMoney(liabilityTotal, currency)}</span>
              </div>
              {liabilityAccounts.map((account) => (
                <div className="flex justify-between gap-2 px-4 py-1.5 text-sm" key={account.id}>
                  <span className="min-w-0 truncate">{account.name}</span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatMoney(-account.amount, currency)}
                  </span>
                </div>
              ))}
              {!wealthAccounts.length ? (
                <p className={`px-4 py-4 text-center text-sm ${muted}`}>
                  No hay cuentas en esta moneda.
                </p>
              ) : null}
            </div>
            <footer className={`border-t px-3 py-2 text-xs ${border} ${muted}`}>
              Saldo al {endDateLabel}
            </footer>
          </FinanceBoardCard> : null}

          {customBlocks
            .filter((block) => !["income", "expense"].includes(block.id) || !hiddenCards.includes(block.id))
            .map((block, index) => {
              const definition = BOARD_BLOCK_TYPES.find((option) => option.type === block.type);
              const tone = dark
                ? {
                    income: "#34d27b",
                    expense: "#ff5a5a",
                    asset: "#3bb0ff",
                    liability: "#f5c842",
                    patrimony: "#3bb0ff",
                  }[block.type]
                : definition.tone;
              const fallbackPosition = {
                x: 408 + (index % 2) * 376,
                y: 490 + Math.floor(index / 2) * 458,
              };
              const total = block.folders.reduce(
                (sum, folder) =>
                  sum + folder.items.reduce((folderSum, item) => folderSum + Number(item.amount), 0),
                0,
              );

            return (
              <FinanceBoardCard
                currency={currency}
                dark={dark}
                id={block.id}
                key={block.id}
                onDelete={() =>
                  ["income", "expense"].includes(block.id)
                    ? saveHiddenCards([...hiddenCards, block.id])
                    : saveCustomBlocks(customBlocks.filter((item) => item.id !== block.id))
                }
                onDragStart={beginCardDrag}
                position={positions[block.id] ?? fallbackPosition}
                title={
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span aria-hidden="true">{definition.icon}</span>
                    <input
                      aria-label="Nombre del cuadro"
                      className={`min-w-0 flex-1 bg-transparent text-sm font-bold outline-none focus:ring-1 ${
                        dark ? "text-[#e9eaee] focus:ring-[#8b909b]" : "text-[#1f2430] focus:ring-slate-400"
                      }`}
                      maxLength={60}
                      onChange={(event) =>
                        updateCustomBlock(block.id, (current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      style={{ color: dark ? "#e9eaee" : "#1f2430" }}
                      value={block.title}
                    />
                  </div>
                }
                tone={tone}
                total={total}
                type={block.type}
              >
                <div className="max-h-[320px] min-h-24 overflow-y-auto py-1">
                  {block.folders.map((folder) => (
                    <section className={`border-b px-2 py-1.5 ${border}`} key={folder.id}>
                      <div className="flex items-center gap-1">
                        <input
                          aria-label="Nombre de la carpeta"
                          className={`min-w-0 flex-1 rounded px-1 py-1 text-xs font-bold outline-none focus:ring-1 ${dark ? "text-[#e9eaee] focus:ring-[#8b909b]" : "text-[#1f2430] focus:ring-slate-400"}`}
                          maxLength={60}
                          onChange={(event) => updateCustomBlock(block.id, (current) => ({
                            ...current,
                            folders: current.folders.map((entry) => entry.id === folder.id ? { ...entry, title: event.target.value } : entry),
                          }))}
                          placeholder="Nombre de carpeta"
                          style={{ color: dark ? "#e9eaee" : "#1f2430" }}
                          value={folder.title}
                        />
                        <button
                          aria-label={`Eliminar carpeta ${folder.title}`}
                          className={`rounded px-1 ${dark ? "text-[#8b909b] hover:text-[#ff5a5a]" : "text-slate-500 hover:text-rose-700"}`}
                          onClick={() => updateCustomBlock(block.id, (current) => ({
                            ...current,
                            folders: current.folders.filter((entry) => entry.id !== folder.id),
                          }))}
                          title="Eliminar carpeta y sus partidas"
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                      {folder.items.map((item) => (
                        <div className="flex items-center gap-1" key={item.id}>
                          <input
                            aria-label="Nombre de la partida"
                            className={`min-w-0 flex-1 rounded px-1 py-1 text-sm outline-none focus:ring-1 ${dark ? "text-[#e9eaee] focus:ring-[#8b909b]" : "text-[#1f2430] focus:ring-slate-400"}`}
                            maxLength={60}
                            onChange={(event) => updateCustomBlock(block.id, (current) => ({
                              ...current,
                              folders: current.folders.map((entry) => entry.id === folder.id ? {
                                ...entry,
                                items: entry.items.map((part) => part.id === item.id ? { ...part, name: event.target.value } : part),
                              } : entry),
                            }))}
                            style={{ color: dark ? "#e9eaee" : "#1f2430" }}
                            value={item.name}
                          />
                          <input
                            aria-label={`Importe de ${item.name}`}
                            className={`w-28 rounded px-1 py-1 text-right text-sm tabular-nums outline-none focus:ring-1 ${dark ? "text-[#e9eaee] focus:ring-[#8b909b]" : "text-[#1f2430] focus:ring-slate-400"}`}
                            min="0"
                            onChange={(event) => updateCustomBlock(block.id, (current) => ({
                              ...current,
                              folders: current.folders.map((entry) => entry.id === folder.id ? {
                                ...entry,
                                items: entry.items.map((part) => part.id === item.id ? { ...part, amount: event.target.value } : part),
                              } : entry),
                            }))}
                            step="0.01"
                            style={{ color: dark ? "#e9eaee" : "#1f2430", colorScheme: dark ? "dark" : "light" }}
                            type="number"
                            value={item.amount}
                          />
                          <button
                            aria-label={`Eliminar ${item.name}`}
                            className={`rounded px-1 ${dark ? "text-[#8b909b] hover:text-[#ff5a5a]" : "text-slate-500 hover:text-rose-700"}`}
                            onClick={() => updateCustomBlock(block.id, (current) => ({
                              ...current,
                              folders: current.folders.map((entry) => entry.id === folder.id ? {
                                ...entry,
                                items: entry.items.filter((part) => part.id !== item.id),
                              } : entry),
                            }))}
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        className={`mt-1 rounded-lg border border-dashed px-2 py-1 text-xs ${dark ? "border-[#34363c] text-[#e9eaee] hover:text-white" : "border-[#cfd4de] text-slate-700 hover:text-slate-950"}`}
                        onClick={() => addCustomItem(block, folder.id, createBoardItemId("item"))}
                        type="button"
                      >
                        + Partida
                      </button>
                    </section>
                  ))}
                </div>
                <footer className={`border-t px-3 py-2 ${border}`}>
                  <button
                    className={`rounded-lg border border-dashed px-2 py-1 text-xs ${dark ? "border-[#34363c] text-[#e9eaee] hover:text-white" : "border-[#cfd4de] text-slate-700 hover:text-slate-950"}`}
                    onClick={() => addCustomFolder(block, createBoardItemId("folder"))}
                    type="button"
                  >
                    + Carpeta
                  </button>
                </footer>
              </FinanceBoardCard>
            );
          })}
        </div>
        {locatorCards.map((card) => (
          <button
            aria-label={`Ir al cuadro ${card.title}`}
            className={`absolute z-10 flex h-8 w-8 items-center justify-center rounded-full border shadow-md transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              dark
                ? "border-[#3bb0ff] bg-[#1e1f22] text-[#3bb0ff]"
                : "border-[#1976d2] bg-white text-[#1976d2]"
            }`}
            key={card.id}
            onClick={(event) => {
              event.stopPropagation();
              focusCard(card.position);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              left: card.markerX,
              top: card.markerY,
              color: card.tone,
              borderColor: card.tone,
              transform: `translate(-50%, -50%) rotate(${card.angle}rad)`,
            }}
            title={`Ir al cuadro: ${card.title}`}
            type="button"
          >
            <span aria-hidden="true" className="text-lg leading-none">➤</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function EditRecordDialog({ entry, accounts, categories, error, saving, onClose, onSubmit }) {
  const { table, record } = entry;
  const title = {
    himb_accounts: "Editar cuenta",
    himb_categories: "Editar categoría",
    himb_transactions: "Editar movimiento",
    himb_transfers: "Editar transferencia",
    himb_budgets: "Editar presupuesto",
    himb_goals: "Editar meta",
  }[table];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
      <section
        aria-labelledby="edit-record-title"
        aria-modal="true"
        className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
      >
        <h2 className="text-xl font-semibold text-slate-950" id="edit-record-title">
          {title}
        </h2>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          {table === "himb_accounts" ? (
            <>
              <FormField label="Nombre">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.name}
                  maxLength={100}
                  name="name"
                  required
                />
              </FormField>
              <FormField label="Saldo inicial">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.opening_balance}
                  name="opening_balance"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                La moneda y el tipo de cuenta no se editan para preservar la interpretación de los
                movimientos existentes.
              </p>
            </>
          ) : null}
          {table === "himb_categories" ? (
            <>
              <FormField label="Nombre">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.name}
                  maxLength={100}
                  name="name"
                  required
                />
              </FormField>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                Tipo: {record.kind === "income" ? "Ingreso" : "Gasto"}. El tipo no se cambia para
                evitar clasificaciones incompatibles.
              </p>
            </>
          ) : null}
          {table === "himb_transactions" ? (
            <>
              <FormField label="Cuenta">
                <select className={FIELD_CLASS} defaultValue={record.account_id} name="account_id" required>
                  {accounts
                    .filter(
                      (account) =>
                        account.currency ===
                        accounts.find((item) => item.id === record.account_id)?.currency,
                    )
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Categoría">
                <select className={FIELD_CLASS} defaultValue={record.category_id ?? ""} name="category_id">
                  <option value="">Sin categoría</option>
                  {categories
                    .filter((category) => category.kind === record.kind)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Importe">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.amount}
                  min="0.01"
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <FormField label="Fecha">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.occurred_on}
                  name="occurred_on"
                  required
                  type="date"
                />
              </FormField>
              <FormField label="Descripción">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.description}
                  maxLength={240}
                  name="description"
                />
              </FormField>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                Tipo: {record.kind === "income" ? "Ingreso" : "Gasto"}. Para cambiarlo, elimina el
                movimiento y regístralo de nuevo.
              </p>
            </>
          ) : null}
          {table === "himb_transfers" ? (
            <>
              <FormField label="Importe">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.amount}
                  min="0.01"
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <FormField label="Fecha">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.occurred_on}
                  name="occurred_on"
                  required
                  type="date"
                />
              </FormField>
              <FormField label="Descripción">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.description}
                  maxLength={240}
                  name="description"
                />
              </FormField>
              <p className="text-xs text-slate-500 sm:col-span-2">
                {AccountName({ accountId: record.from_account_id, accounts })} →{" "}
                {AccountName({ accountId: record.to_account_id, accounts })} · {record.currency}
              </p>
            </>
          ) : null}
          {table === "himb_budgets" ? (
            <>
              <FormField label="Nombre">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.name}
                  maxLength={100}
                  name="name"
                  required
                />
              </FormField>
              <FormField label="Categoría">
                <select className={FIELD_CLASS} defaultValue={record.category_id ?? ""} name="category_id">
                  <option value="">General</option>
                  {categories
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
                  defaultValue={record.monthly_limit}
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
                  defaultValue={record.period_start.slice(0, 7)}
                  name="period_start"
                  required
                  type="month"
                />
              </FormField>
              <FormField label="Moneda">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.currency}
                  maxLength={3}
                  minLength={3}
                  name="currency"
                  pattern="[A-Za-z]{3}"
                  required
                />
              </FormField>
              <p className="text-xs text-slate-500 sm:col-span-2">
                Cambiar la moneda no convierte los importes existentes.
              </p>
            </>
          ) : null}
          {table === "himb_goals" ? (
            <>
              <FormField label="Nombre">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.name}
                  maxLength={100}
                  name="name"
                  required
                />
              </FormField>
              <FormField label="Fecha objetivo (opcional)">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.target_date ?? ""}
                  name="target_date"
                  type="date"
                />
              </FormField>
              <FormField label="Importe objetivo">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.target_amount}
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
                  defaultValue={record.current_amount}
                  min="0"
                  name="current_amount"
                  required
                  step="0.01"
                  type="number"
                />
              </FormField>
              <FormField label="Moneda">
                <input
                  className={FIELD_CLASS}
                  defaultValue={record.currency}
                  maxLength={3}
                  minLength={3}
                  name="currency"
                  pattern="[A-Za-z]{3}"
                  required
                />
              </FormField>
              <p className="text-xs text-slate-500 sm:col-span-2">
                Cambiar la moneda no convierte los importes existentes.
              </p>
            </>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <button className={BUTTON_CLASS} disabled={saving} type="submit">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
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
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [analysisStartDate, setAnalysisStartDate] = useState(null);
  const [analysisEndDate, setAnalysisEndDate] = useState(null);
  const [analysisCurrencySelection, setAnalysisCurrencySelection] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionKindFilter, setTransactionKindFilter] = useState("all");
  const [transactionOrder, setTransactionOrder] = useState("newest");
  const [movementPage, setMovementPage] = useState(0);
  const [transactionEntryKind, setTransactionEntryKind] = useState("expense");
  const [transferSourceId, setTransferSourceId] = useState("");
  const [transferDestinationId, setTransferDestinationId] = useState("");
  const selectedTransferSource =
    data.accounts.find((account) => account.id === transferSourceId) ?? data.accounts[0];
  const transferDestinations = selectedTransferSource
    ? data.accounts.filter(
        (account) =>
          account.id !== selectedTransferSource.id &&
          account.currency === selectedTransferSource.currency,
      )
    : [];
  const selectedTransferDestinationId = transferDestinations.some(
    (account) => account.id === transferDestinationId,
  )
    ? transferDestinationId
    : transferDestinations[0]?.id ?? "";

  const loadData = useCallback(
    async (userId) => {
      const results = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from("himb_account_balances")
            .select("id, name, account_type, currency, opening_balance, current_balance")
            .order("name"),
        ),
        fetchAllRows(() =>
          supabase.from("himb_categories").select("id, name, kind, created_at").order("name"),
        ),
        fetchAllRows(() =>
          supabase
            .from("himb_transactions")
            .select("id, account_id, category_id, kind, amount, description, occurred_on")
            .order("occurred_on", { ascending: false })
            .order("id", { ascending: false }),
        ),
        fetchAllRows(() =>
          supabase
            .from("himb_transfers")
            .select("id, from_account_id, to_account_id, currency, amount, description, occurred_on")
            .order("occurred_on", { ascending: false })
            .order("id", { ascending: false }),
        ),
        fetchAllRows(() =>
          supabase
            .from("himb_budgets")
            .select("id, name, category_id, monthly_limit, period_start, currency")
            .order("period_start", { ascending: false }),
        ),
        fetchAllRows(() =>
          supabase
            .from("himb_goals")
            .select("id, name, target_amount, current_amount, target_date, currency")
            .order("created_at", { ascending: false }),
        ),
      ]);

      if (sessionRef.current?.user?.id !== userId) {
        return;
      }

      setData({
        accounts: results[0],
        categories: results[1],
        transactions: results[2],
        transfers: results[3],
        budgets: results[4],
        goals: results[5],
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
      if (authMode === "recovery-request") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
          throw error;
        }

        setNotice(
          "Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.",
        );
        return;
      }

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
      if (table === "himb_transactions") {
        setTransactionEntryKind("expense");
      }
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

  async function saveTransfer(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const userId = session?.user?.id;

    if (!userId) {
      setActionError("Inicia sesión antes de guardar una transferencia.");
      return;
    }

    setSaving(true);
    setActionError("");
    setLoadError("");
    setNotice("");

    try {
      const formData = new FormData(form);
      const { error } = await supabase.from("himb_transfers").insert({
        from_account_id: formData.get("from_account_id"),
        to_account_id: formData.get("to_account_id"),
        currency: selectedTransferSource?.currency,
        amount: Number(formData.get("amount")),
        description: String(formData.get("description")).trim(),
        occurred_on: formData.get("occurred_on"),
      });

      if (error) {
        throw error;
      }

      form.reset();
      setTransferSourceId("");
      setTransferDestinationId("");
      await loadData(userId);
      setNotice("Transferencia guardada. Los saldos de ambas cuentas se actualizaron.");
    } catch (error) {
      setActionError(`No se pudo guardar la transferencia: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function openEditRecord(table, record) {
    setActionError("");
    setEditingRecord({ table, record });
  }

  async function updateRecord(event) {
    event.preventDefault();
    const userId = session?.user?.id;
    if (!userId || !editingRecord) {
      setActionError("No se pudo identificar el registro que quieres editar.");
      return;
    }

    const { table, record } = editingRecord;
    const formData = new FormData(event.currentTarget);
    let payload;

    if (table === "himb_accounts") {
      payload = {
        name: String(formData.get("name")).trim(),
        opening_balance: Number(formData.get("opening_balance")),
      };
    } else if (table === "himb_categories") {
      payload = { name: String(formData.get("name")).trim() };
    } else if (table === "himb_transactions") {
      payload = {
        account_id: formData.get("account_id"),
        category_id: formData.get("category_id") || null,
        amount: Number(formData.get("amount")),
        description: String(formData.get("description")).trim(),
        occurred_on: formData.get("occurred_on"),
      };
    } else if (table === "himb_transfers") {
      payload = {
        amount: Number(formData.get("amount")),
        description: String(formData.get("description")).trim(),
        occurred_on: formData.get("occurred_on"),
      };
    } else if (table === "himb_budgets") {
      payload = {
        name: String(formData.get("name")).trim(),
        category_id: formData.get("category_id") || null,
        monthly_limit: Number(formData.get("monthly_limit")),
        period_start: `${formData.get("period_start")}-01`,
        currency: String(formData.get("currency")).toUpperCase(),
      };
    } else {
      payload = {
        name: String(formData.get("name")).trim(),
        target_amount: Number(formData.get("target_amount")),
        current_amount: Number(formData.get("current_amount")),
        target_date: formData.get("target_date") || null,
        currency: String(formData.get("currency")).toUpperCase(),
      };
    }

    setSaving(true);
    setActionError("");
    setNotice("");
    let updated = false;

    try {
      const { data: rows, error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", record.id)
        .select("id");
      if (error) {
        throw error;
      }
      if (!rows?.length) {
        throw new Error("No se encontró el registro o ya no tienes permiso para editarlo.");
      }

      updated = true;
      setEditingRecord(null);
      await loadData(userId);
      setNotice("Cambios guardados.");
    } catch (error) {
      setActionError(
        updated
          ? `Los cambios se guardaron, pero no se pudo actualizar la vista: ${error.message}`
          : `No se pudieron guardar los cambios: ${error.message}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(table, recordId, recordLabel) {
    const cascadeWarning =
      table === "himb_accounts"
        ? " También se eliminarán sus movimientos y transferencias asociados."
        : "";
    if (!window.confirm(`¿Eliminar ${recordLabel}?${cascadeWarning} Esta acción no se puede deshacer.`)) {
      return;
    }

    const userId = session?.user?.id;
    if (!userId) {
      setActionError("Inicia sesión antes de eliminar datos.");
      return;
    }

    setSaving(true);
    setActionError("");
    setNotice("");
    let deleted = false;

    try {
      const { data: rows, error } = await supabase
        .from(table)
        .delete()
        .eq("id", recordId)
        .select("id");
      if (error) {
        throw error;
      }
      if (!rows?.length) {
        throw new Error("No se encontró el registro o ya no tienes permiso para eliminarlo.");
      }

      deleted = true;
      if (editingRecord?.table === table && editingRecord.record.id === recordId) {
        setEditingRecord(null);
      }
      await loadData(userId);
      setNotice("Registro eliminado.");
    } catch (error) {
      setActionError(
        deleted
          ? `El registro se eliminó, pero no se pudo actualizar la vista: ${error.message}`
          : `No se pudo eliminar ${recordLabel}: ${error.message}`,
      );
    } finally {
      setSaving(false);
    }
  }

  const dataIsLoading = Boolean(session) && loadedForUser !== session.user.id;
  const now = session ? new Date() : null;
  const defaultAnalysisStartDate = now
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    : "";
  const defaultAnalysisEndDate = now
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate(),
      ).padStart(2, "0")}`
    : "";
  const selectedAnalysisStartDate = analysisStartDate ?? defaultAnalysisStartDate;
  const selectedAnalysisEndDate = analysisEndDate ?? defaultAnalysisEndDate;
  const monthKey = now
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    : "";
  const currentMonthTransactions = monthKey
    ? data.transactions.filter((transaction) => transaction.occurred_on.startsWith(monthKey))
    : [];
  const monthTotals = [...new Set(data.accounts.map((account) => account.currency))].map(
    (currency) => {
      const accountIds = new Set(
        data.accounts
          .filter((account) => account.currency === currency)
          .map((account) => account.id),
      );
      const transactions = currentMonthTransactions.filter((transaction) =>
        accountIds.has(transaction.account_id),
      );

      return {
        currency,
        income: transactions
          .filter((transaction) => transaction.kind === "income")
          .reduce((total, transaction) => total + Number(transaction.amount), 0),
        expenses: transactions
          .filter((transaction) => transaction.kind === "expense")
          .reduce((total, transaction) => total + Number(transaction.amount), 0),
      };
    },
  );
  const accountTotals = [...new Set(data.accounts.map((account) => account.currency))].map(
    (currency) => ({
      currency,
      balance: data.accounts
        .filter((account) => account.currency === currency)
        .reduce((total, account) => total + Number(account.current_balance), 0),
    }),
  );
  const analysisCurrencies = [...new Set(data.accounts.map((account) => account.currency))].sort();
  const analysisCurrency = analysisCurrencies.includes(analysisCurrencySelection)
    ? analysisCurrencySelection
    : analysisCurrencies[0] ?? "";
  const analysisRangeValid =
    Boolean(selectedAnalysisStartDate) &&
    Boolean(selectedAnalysisEndDate) &&
    selectedAnalysisStartDate <= selectedAnalysisEndDate;
  const analysisStartLabel = selectedAnalysisStartDate
    ? formatDate(selectedAnalysisStartDate)
    : "—";
  const analysisEndLabel = selectedAnalysisEndDate ? formatDate(selectedAnalysisEndDate) : "—";
  const analysisAccounts = data.accounts.filter(
    (account) => account.currency === analysisCurrency,
  );
  const analysisAccountIds = new Set(analysisAccounts.map((account) => account.id));
  const analysisTransactions = analysisRangeValid
    ? data.transactions.filter(
        (transaction) =>
          analysisAccountIds.has(transaction.account_id) &&
          transaction.occurred_on >= selectedAnalysisStartDate &&
          transaction.occurred_on <= selectedAnalysisEndDate,
      )
    : [];
  const groupTransactionsByCategory = (kind) => {
    const grouped = new Map();

    for (const transaction of analysisTransactions) {
      if (transaction.kind !== kind) {
        continue;
      }

      const categoryId = transaction.category_id ?? "uncategorized";
      const categoryName =
        data.categories.find((category) => category.id === transaction.category_id)?.name ??
        "Sin categoría";
      const current = grouped.get(categoryId) ?? {
        id: categoryId,
        name: categoryName,
        amount: 0,
        transactions: [],
      };
      current.amount += Number(transaction.amount);
      current.transactions.push(transaction);
      grouped.set(categoryId, current);
    }

    return [...grouped.values()].sort((left, right) => right.amount - left.amount);
  };
  const analysisExpenses = groupTransactionsByCategory("expense");
  const analysisIncome = groupTransactionsByCategory("income");
  const analysisWealth = analysisRangeValid
    ? analysisAccounts
        .map((account) => {
          const transactionBalance = data.transactions
            .filter(
              (transaction) =>
                transaction.account_id === account.id &&
                transaction.occurred_on <= selectedAnalysisEndDate,
            )
            .reduce(
              (balance, transaction) =>
                balance +
                (transaction.kind === "income" ? 1 : -1) * Number(transaction.amount),
              0,
            );
          const transferBalance = data.transfers
            .filter(
              (transfer) =>
                transfer.occurred_on <= selectedAnalysisEndDate &&
                (transfer.from_account_id === account.id || transfer.to_account_id === account.id),
            )
            .reduce(
              (balance, transfer) =>
                balance +
                (transfer.to_account_id === account.id ? 1 : -1) * Number(transfer.amount),
              0,
            );

          return {
            id: account.id,
            name: account.name,
            account_type: account.account_type,
            amount: Number(account.opening_balance) + transactionBalance + transferBalance,
          };
        })
        .sort((left, right) => right.amount - left.amount)
    : [];
  const budgetsWithProgress = data.budgets.map((budget) => {
    const spent = data.transactions
    .filter((transaction) => {
      if (
        transaction.kind !== "expense" ||
        transaction.occurred_on.slice(0, 7) !== budget.period_start.slice(0, 7) ||
        (budget.category_id && transaction.category_id !== budget.category_id)
      ) {
        return false;
      }

      return data.accounts.find((account) => account.id === transaction.account_id)?.currency ===
        budget.currency;
    })
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

    return {
    ...budget,
    spent,
    remaining: Number(budget.monthly_limit) - spent,
    };
  });
  const chartMonths = now
    ? Array.from({ length: 6 }, (_, index) => {
        const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
        const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;

        return {
          key,
          label: month.toLocaleDateString("es", { month: "short" }),
          income: 0,
          expenses: 0,
        };
      })
    : [];
  const cashFlowByCurrency = [...new Set(data.accounts.map((account) => account.currency))].map(
    (currency) => {
      const accountIds = new Set(
        data.accounts
          .filter((account) => account.currency === currency)
          .map((account) => account.id),
      );
      const months = chartMonths.map((month) => {
        const transactions = data.transactions.filter(
          (transaction) =>
            accountIds.has(transaction.account_id) &&
            transaction.occurred_on.startsWith(month.key),
        );

        return {
          ...month,
          income: transactions
            .filter((transaction) => transaction.kind === "income")
            .reduce((total, transaction) => total + Number(transaction.amount), 0),
          expenses: transactions
            .filter((transaction) => transaction.kind === "expense")
            .reduce((total, transaction) => total + Number(transaction.amount), 0),
        };
      });

      return { currency, months };
    },
  );
  const movementRows = [
    ...data.transactions.map((transaction) => ({
      ...transaction,
      movement_type: transaction.kind,
    })),
    ...data.transfers.map((transfer) => ({
      ...transfer,
      movement_type: "transfer",
    })),
  ]
    .sort(
      (left, right) =>
        right.occurred_on.localeCompare(left.occurred_on) || right.id.localeCompare(left.id),
    )
    .slice(0, 100);
  const searchTerm = transactionSearch.trim().toLocaleLowerCase("es");
  const filteredTransactions = movementRows
    .filter((movement) => {
      if (transactionKindFilter !== "all" && movement.movement_type !== transactionKindFilter) {
        return false;
      }

      const relatedAccountNames =
        movement.movement_type === "transfer"
          ? [
              AccountName({ accountId: movement.from_account_id, accounts: data.accounts }),
              AccountName({ accountId: movement.to_account_id, accounts: data.accounts }),
            ]
          : [AccountName({ accountId: movement.account_id, accounts: data.accounts })];
      const searchableText = [
        movement.description,
        ...relatedAccountNames,
        movement.movement_type === "transfer"
          ? "transferencia"
          : CategoryName({ categoryId: movement.category_id, categories: data.categories }),
        movement.movement_type === "income"
          ? "ingreso"
          : movement.movement_type === "expense"
            ? "gasto"
            : "transferencia",
      ]
        .join(" ")
        .toLocaleLowerCase("es");

      return !searchTerm || searchableText.includes(searchTerm);
    })
    .sort((left, right) => {
      const dateOrder = left.occurred_on.localeCompare(right.occurred_on);
      const idOrder = left.id.localeCompare(right.id);
      return transactionOrder === "oldest" ? dateOrder || idOrder : -(dateOrder || idOrder);
    });
  const movementPageSize = 50;
  const movementPageCount = Math.max(1, Math.ceil(filteredTransactions.length / movementPageSize));
  const currentMovementPage = Math.min(movementPage, movementPageCount - 1);
  const pageStart = currentMovementPage * movementPageSize;
  const visibleMovements = filteredTransactions.slice(pageStart, pageStart + movementPageSize);

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
            {authMode === "recovery-request"
              ? "Recupera tu contraseña"
              : "Tu espacio financiero"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {authMode === "recovery-request"
              ? "Te enviaremos instrucciones para crear una contraseña nueva."
              : "Inicia sesión para consultar y guardar tu información financiera."}
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
            {authMode !== "recovery-request" ? (
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
            ) : null}
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

          {authMode === "signin" ? (
            <button
              className="mt-4 block w-full text-center text-sm font-medium text-emerald-800 hover:underline"
              onClick={() => {
                setAuthMode("recovery-request");
                setActionError("");
                setNotice("");
              }}
              type="button"
            >
              Olvidé mi contraseña
            </button>
          ) : null}
          {authMode !== "recovery-request" ? (
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
          ) : null}
          {authMode === "recovery-request" ? (
            <button
              className="mt-3 block w-full text-center text-sm text-slate-600 hover:text-slate-900"
              onClick={() => {
                setAuthMode("signin");
                setActionError("");
                setNotice("");
              }}
              type="button"
            >
              Volver a iniciar sesión
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-6 lg:py-7">
          <div>
            <p className="text-lg font-bold tracking-[0.12em] text-emerald-800">HIMB</p>
            <p className="mt-1 hidden text-xs text-slate-500 lg:block">Tu espacio financiero</p>
          </div>
          <button
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:mt-6 lg:w-full lg:text-sm"
            onClick={handleSignOut}
            type="button"
          >
            Cerrar sesión
          </button>
        </div>
        <nav aria-label="Navegación principal" className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:px-3">
          {NAV_ITEMS.map(([id, label, description]) => (
            <button
              aria-current={activeView === id ? "page" : undefined}
              className={`min-w-max rounded-xl px-4 py-2.5 text-left transition lg:block lg:w-full ${
                activeView === id
                  ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
              key={id}
              onClick={() => setActiveView(id)}
              type="button"
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="hidden text-xs text-slate-500 lg:block">{description}</span>
            </button>
          ))}
        </nav>
        <p className="hidden break-all px-6 pb-6 text-xs text-slate-400 lg:block">
          Sesión de {session.user.email}
        </p>
      </aside>

      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-7">
            <p className="text-sm font-medium text-slate-500">
              {now?.toLocaleDateString("es", { month: "long", year: "numeric" })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {NAV_ITEMS.find(([id]) => id === activeView)?.[1]}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {activeView === "overview"
                ? "Un vistazo sencillo a tus finanzas de este mes."
                : NAV_ITEMS.find(([id]) => id === activeView)?.[2]}
            </p>
          </header>

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

        {activeView === "overview" ? (
          <div className="space-y-6">
            <section aria-label="Resumen del mes" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Panel
                description="Suma de los ingresos registrados durante este mes."
                title="Ingresos"
              >
                {monthTotals.length ? (
                  <ul className="space-y-2">
                    {monthTotals.map(({ currency, income }) => (
                      <li className="text-2xl font-semibold text-emerald-800" key={currency}>
                        {formatMoney(income, currency)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>Agrega una cuenta para empezar a registrar ingresos.</EmptyState>
                )}
              </Panel>
              <Panel
                description="Suma de los gastos registrados durante este mes."
                title="Gastos"
              >
                {monthTotals.length ? (
                  <ul className="space-y-2">
                    {monthTotals.map(({ currency, expenses }) => (
                      <li className="text-2xl font-semibold text-slate-900" key={currency}>
                        {formatMoney(expenses, currency)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>Los totales aparecerán cuando agregues tus cuentas.</EmptyState>
                )}
              </Panel>
              <Panel
                description="Saldos iniciales más ingresos, gastos y transferencias. Se muestran por moneda."
                title="Saldo actual de cuentas"
              >
                {accountTotals.length ? (
                  <ul className="space-y-2">
                    {accountTotals.map(({ currency, balance }) => (
                      <li className="text-2xl font-semibold text-slate-900" key={currency}>
                        {formatMoney(balance, currency)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>Agrega una cuenta para calcular su saldo actual.</EmptyState>
                )}
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Las tarjetas con deuda pueden mostrar un saldo negativo. No es un cálculo de
                  patrimonio neto.
                </p>
              </Panel>
            </section>

            {analysisCurrency ? (
              <FinanceBoard
                currency={analysisCurrency}
                currencies={analysisCurrencies}
                endDate={selectedAnalysisEndDate}
                endDateLabel={analysisEndLabel}
                onCurrencyChange={setAnalysisCurrencySelection}
                onEndDateChange={setAnalysisEndDate}
                onStartDateChange={setAnalysisStartDate}
                rangeValid={analysisRangeValid}
                startDate={selectedAnalysisStartDate}
                userId={session.user.id}
                wealthAccounts={analysisWealth}
              />
            ) : (
              <Panel title="Pizarra financiera">
                <EmptyState>Agrega una cuenta para visualizar tu pizarra por moneda.</EmptyState>
              </Panel>
            )}

            <Panel
              description="Comparación mensual de entradas y salidas por moneda, sin mezclar valores."
              title="Flujo de caja de los últimos 6 meses"
            >
              {cashFlowByCurrency.length ? (
                <div className="grid gap-6 xl:grid-cols-2">
                  {cashFlowByCurrency.map(({ currency, months }) => {
                    const hasActivity = months.some((month) => month.income || month.expenses);

                    return (
                      <section
                        aria-label={`Flujo de caja en ${currency}`}
                        className="min-w-0 rounded-xl border border-slate-100 p-4"
                        key={currency}
                      >
                        <h3 className="mb-2 text-sm font-semibold text-slate-800">{currency}</h3>
                        {hasActivity ? (
                          <MonthlyCashFlowChart currency={currency} months={months} />
                        ) : (
                          <EmptyState>
                            No hay movimientos en los últimos seis meses para esta moneda.
                          </EmptyState>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <EmptyState>Agrega una cuenta para visualizar ingresos y gastos por mes.</EmptyState>
              )}
            </Panel>

            {data.accounts.length === 0 || data.categories.length === 0 ? (
              <Panel
                description="Completa estos pasos para que tu resumen tenga información útil."
                title="Empieza aquí"
              >
                <ol className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["accounts", "1. Agrega una cuenta", "Banco, efectivo o ahorro."],
                    ["categories", "2. Organiza categorías", "Clasifica ingresos y gastos."],
                    ["activity", "3. Registra movimientos", "Anota lo que entra y sale."],
                  ].map(([view, title, description]) => (
                    <li key={view}>
                      <button
                        className="h-full w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                        onClick={() => setActiveView(view)}
                        type="button"
                      >
                        <span className="block text-sm font-semibold text-slate-900">{title}</span>
                        <span className="mt-1 block text-sm text-slate-600">{description}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </Panel>
            ) : null}

            <Panel
              description="Busca y filtra tu historial completo de movimientos."
              title="Movimientos"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px]">
                <label className="block text-sm font-medium text-slate-700">
                  Buscar
                  <input
                    className={FIELD_CLASS}
                    onChange={(event) => {
                      setTransactionSearch(event.target.value);
                      setMovementPage(0);
                    }}
                    placeholder="Descripción, cuenta o categoría"
                    type="search"
                    value={transactionSearch}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Tipo
                  <select
                    className={FIELD_CLASS}
                    onChange={(event) => {
                      setTransactionKindFilter(event.target.value);
                      setMovementPage(0);
                    }}
                    value={transactionKindFilter}
                  >
                    <option value="all">Todos</option>
                    <option value="income">Ingresos</option>
                    <option value="expense">Gastos</option>
                    <option value="transfer">Transferencias</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Ordenar por fecha
                  <select
                    className={FIELD_CLASS}
                    onChange={(event) => {
                      setTransactionOrder(event.target.value);
                      setMovementPage(0);
                    }}
                    value={transactionOrder}
                  >
                    <option value="newest">Más recientes</option>
                    <option value="oldest">Más antiguos</option>
                  </select>
                </label>
              </div>
              <p aria-live="polite" className="mt-4 text-xs text-slate-500">
                {filteredTransactions.length} de {movementRows.length} movimientos
              </p>
              {filteredTransactions.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-[900px] w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-3 font-medium" scope="col">Fecha</th>
                        <th className="px-3 py-3 font-medium" scope="col">Tipo</th>
                        <th className="px-3 py-3 font-medium" scope="col">Descripción</th>
                        <th className="px-3 py-3 font-medium" scope="col">Cuenta</th>
                        <th className="px-3 py-3 font-medium" scope="col">Categoría</th>
                        <th className="px-3 py-3 text-right font-medium" scope="col">Importe</th>
                        <th className="px-3 py-3 text-right font-medium" scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleMovements.map((movement) => {
                        const isTransfer = movement.movement_type === "transfer";
                        const isIncome = movement.movement_type === "income";
                        const account = isTransfer
                          ? null
                          : data.accounts.find((item) => item.id === movement.account_id);

                        return (
                          <tr
                            className="hover:bg-slate-50"
                            key={`${movement.movement_type}-${movement.id}`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                              {formatDate(movement.occurred_on)}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  isTransfer
                                    ? "bg-sky-50 text-sky-800"
                                    : isIncome
                                      ? "bg-emerald-50 text-emerald-800"
                                      : "bg-rose-50 text-rose-800"
                                }`}
                              >
                                {isTransfer ? "Transferencia" : isIncome ? "Ingreso" : "Gasto"}
                              </span>
                            </td>
                            <td className="max-w-56 truncate px-3 py-3 font-medium text-slate-900">
                              {movement.description ||
                                (isTransfer ? "Transferencia" : isIncome ? "Ingreso" : "Gasto")}
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {isTransfer
                                ? `${AccountName({
                                    accountId: movement.from_account_id,
                                    accounts: data.accounts,
                                  })} → ${AccountName({
                                    accountId: movement.to_account_id,
                                    accounts: data.accounts,
                                  })}`
                                : account?.name ?? "Cuenta no disponible"}
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {isTransfer
                                ? "—"
                                : CategoryName({
                                    categoryId: movement.category_id,
                                    categories: data.categories,
                                  })}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-3 text-right font-semibold ${
                                isTransfer
                                  ? "text-sky-800"
                                  : isIncome
                                    ? "text-emerald-700"
                                    : "text-slate-800"
                              }`}
                            >
                              {isTransfer ? "" : isIncome ? "+" : "−"}
                              {formatMoney(
                                movement.amount,
                                isTransfer ? movement.currency : account?.currency,
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right">
                              <button
                                className="mr-3 font-medium text-emerald-800 hover:underline"
                                onClick={() =>
                                  openEditRecord(
                                    isTransfer ? "himb_transfers" : "himb_transactions",
                                    movement,
                                  )
                                }
                                type="button"
                              >
                                Editar
                              </button>
                              <button
                                className="font-medium text-rose-700 hover:underline"
                                disabled={saving}
                                onClick={() =>
                                  deleteRecord(
                                    isTransfer ? "himb_transfers" : "himb_transactions",
                                    movement.id,
                                    isTransfer ? "la transferencia" : "el movimiento",
                                  )
                                }
                                type="button"
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>
                  {movementRows.length
                    ? "No hay movimientos que coincidan. Prueba cambiar la búsqueda o los filtros."
                    : "Aún no hay movimientos. Registra uno para empezar a ver tu actividad aquí."}
                </EmptyState>
              )}
              {filteredTransactions.length > movementPageSize ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Mostrando {pageStart + 1}–{Math.min(pageStart + movementPageSize, filteredTransactions.length)} de{" "}
                    {filteredTransactions.length}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                      disabled={currentMovementPage === 0}
                      onClick={() => setMovementPage(currentMovementPage - 1)}
                      type="button"
                    >
                      Anterior
                    </button>
                    <span className="self-center text-xs text-slate-500">
                      Página {currentMovementPage + 1} de {movementPageCount}
                    </span>
                    <button
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                      disabled={currentMovementPage >= movementPageCount - 1}
                      onClick={() => setMovementPage(currentMovementPage + 1)}
                      type="button"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              ) : null}
            </Panel>
          </div>
        ) : null}

        {activeView === "analysis" ? (
          <div>
            {analysisCurrency ? (
              <FinanceBoard
                currency={analysisCurrency}
                currencies={analysisCurrencies}
                endDate={selectedAnalysisEndDate}
                endDateLabel={analysisEndLabel}
                onCurrencyChange={setAnalysisCurrencySelection}
                onEndDateChange={setAnalysisEndDate}
                onStartDateChange={setAnalysisStartDate}
                rangeValid={analysisRangeValid}
                startDate={selectedAnalysisStartDate}
                userId={session.user.id}
                wealthAccounts={analysisWealth}
              />
            ) : (
              <Panel title="Pizarra financiera">
                <EmptyState>Agrega una cuenta para visualizar tu pizarra por moneda.</EmptyState>
              </Panel>
            )}
          </div>
        ) : null}

        {activeView === "categories" ? (
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
                <select
                  className={FIELD_CLASS}
                  name="kind"
                  onChange={(event) => {
                    setTransactionEntryKind(event.target.value);
                    event.currentTarget.form.elements.category_id.value = "";
                  }}
                  value={transactionEntryKind}
                >
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
                  <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm" key={category.id}>
                    <span>
                      <span className="font-medium text-slate-800">{category.name}</span>
                      <span className="ml-2 text-slate-500">
                        {category.kind === "income" ? "Ingreso" : "Gasto"}
                      </span>
                    </span>
                    <span className="flex gap-3">
                      <button
                        className="font-medium text-emerald-800 hover:underline"
                        onClick={() => openEditRecord("himb_categories", category)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="font-medium text-rose-700 hover:underline"
                        disabled={saving}
                        onClick={() =>
                          deleteRecord("himb_categories", category.id, `la categoría "${category.name}"`)
                        }
                        type="button"
                      >
                        Eliminar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay categorías.</EmptyState>
            )}
          </Panel>
        </div>
        ) : null}

        {activeView === "accounts" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            description="El saldo actual se calcula desde el saldo inicial y los movimientos de cada cuenta."
            title="Cuentas"
          >
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
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                En una tarjeta de crédito, registra la deuda inicial como negativa. Los gastos
                reducen el saldo y los ingresos o transferencias de pago lo aumentan.
              </p>
              <button className={`${BUTTON_CLASS} sm:col-span-2`} disabled={saving} type="submit">
                Agregar cuenta
              </button>
            </form>
            {data.accounts.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {data.accounts.map((account) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm" key={account.id}>
                    <span className="font-medium text-slate-800">{account.name}</span>
                    <span className="flex items-center gap-4">
                      <span className="text-right">
                        <span className="block text-xs text-slate-500">Saldo actual</span>
                        <span className="font-medium text-slate-800">
                          {formatMoney(account.current_balance, account.currency)}
                        </span>
                      </span>
                      <button
                        className="font-medium text-emerald-800 hover:underline"
                        onClick={() => openEditRecord("himb_accounts", account)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="font-medium text-rose-700 hover:underline"
                        disabled={saving}
                        onClick={() =>
                          deleteRecord("himb_accounts", account.id, `la cuenta "${account.name}"`)
                        }
                        type="button"
                      >
                        Eliminar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay cuentas.</EmptyState>
            )}
          </Panel>
        </div>
        ) : null}

        {activeView === "activity" ? (
        <div className="grid gap-5 lg:grid-cols-2">
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
                    {data.categories
                      .filter((category) => category.kind === transactionEntryKind)
                      .map((category) => (
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

          <Panel
            description="Mueve dinero entre cuentas de la misma moneda. Una transferencia no cuenta como ingreso ni como gasto."
            title="Transferir entre cuentas"
          >
            {data.accounts.length ? (
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveTransfer}>
                <FormField label="Desde">
                  <select
                    className={FIELD_CLASS}
                    name="from_account_id"
                    onChange={(event) => {
                      setTransferSourceId(event.target.value);
                      setTransferDestinationId("");
                    }}
                    required
                    value={selectedTransferSource?.id ?? ""}
                  >
                    {data.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Hacia">
                  <select
                    className={FIELD_CLASS}
                    disabled={!transferDestinations.length}
                    name="to_account_id"
                    onChange={(event) => setTransferDestinationId(event.target.value)}
                    required
                    value={selectedTransferDestinationId}
                  >
                    {transferDestinations.length ? (
                      transferDestinations.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} · {account.currency}
                        </option>
                      ))
                    ) : (
                      <option value="">No hay otra cuenta en {selectedTransferSource?.currency}</option>
                    )}
                  </select>
                </FormField>
                <FormField label={`Importe${selectedTransferSource ? ` (${selectedTransferSource.currency})` : ""}`}>
                  <input
                    className={FIELD_CLASS}
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
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
                <FormField label="Descripción (opcional)">
                  <input className={FIELD_CLASS} maxLength={240} name="description" />
                </FormField>
                {!transferDestinations.length ? (
                  <p className="text-xs leading-5 text-amber-800 sm:col-span-2">
                    Para transferir, necesitas dos cuentas con la misma moneda. Las conversiones
                    entre monedas aún no están disponibles.
                  </p>
                ) : null}
                <button
                  className={`${BUTTON_CLASS} sm:col-span-2`}
                  disabled={saving || !transferDestinations.length}
                  type="submit"
                >
                  {saving ? "Guardando…" : "Registrar transferencia"}
                </button>
              </form>
            ) : (
              <EmptyState>Agrega al menos dos cuentas para registrar una transferencia.</EmptyState>
            )}
          </Panel>

          <Panel
            description="Las transferencias afectan ambos saldos, pero no cambian ingresos ni gastos."
            title="Transferencias recientes"
          >
            {data.transfers.length ? (
              <ul className="divide-y divide-slate-100">
                {data.transfers.map((transfer) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    key={transfer.id}
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {AccountName({
                          accountId: transfer.from_account_id,
                          accounts: data.accounts,
                        })}{" "}
                        <span aria-hidden="true">→</span>{" "}
                        {AccountName({
                          accountId: transfer.to_account_id,
                          accounts: data.accounts,
                        })}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(transfer.occurred_on)}
                        {transfer.description ? ` · ${transfer.description}` : ""}
                      </p>
                    </div>
                    <span className="font-semibold text-sky-800">
                      {formatMoney(transfer.amount, transfer.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Todavía no hay transferencias.</EmptyState>
            )}
          </Panel>
        </div>
        ) : null}

        {activeView === "planning" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel description="Organiza límites mensuales, opcionalmente por categoría." title="Presupuestos">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) =>
                saveRecord(event, "himb_budgets", (form) => ({
                  name: String(form.get("name")).trim(),
                  category_id: form.get("category_id") || null,
                  monthly_limit: Number(form.get("monthly_limit")),
                  currency: String(form.get("currency")).toUpperCase(),
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
              <FormField label="Moneda">
                <input
                  className={FIELD_CLASS}
                  defaultValue={data.accounts[0]?.currency ?? "BRL"}
                  maxLength={3}
                  minLength={3}
                  name="currency"
                  pattern="[A-Za-z]{3}"
                  required
                />
              </FormField>
              <button className={`${BUTTON_CLASS} sm:col-span-2`} disabled={saving} type="submit">
                Crear presupuesto
              </button>
            </form>
            {budgetsWithProgress.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {budgetsWithProgress.map((budget) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm" key={budget.id}>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {budget.name}
                        <span className="ml-2 font-normal text-slate-500">
                        {CategoryName({ categoryId: budget.category_id, categories: data.categories })} ·{" "}
                        {formatDate(budget.period_start)}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Gastado {formatMoney(budget.spent, budget.currency)} de{" "}
                        {formatMoney(budget.monthly_limit, budget.currency)}
                        {" · "}
                        <span
                          className={
                            budget.remaining < 0
                              ? "font-medium text-rose-700"
                              : "font-medium text-emerald-700"
                          }
                        >
                          {budget.remaining < 0 ? "Excedido " : "Disponible "}
                          {formatMoney(Math.abs(budget.remaining), budget.currency)}
                        </span>
                      </p>
                    </div>
                    <span className="flex gap-3">
                      <button
                        className="font-medium text-emerald-800 hover:underline"
                        onClick={() => openEditRecord("himb_budgets", budget)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="font-medium text-rose-700 hover:underline"
                        disabled={saving}
                        onClick={() =>
                          deleteRecord("himb_budgets", budget.id, `el presupuesto "${budget.name}"`)
                        }
                        type="button"
                      >
                        Eliminar
                      </button>
                    </span>
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
                  currency: String(form.get("currency")).toUpperCase(),
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
              <FormField label="Moneda">
                <input
                  className={FIELD_CLASS}
                  defaultValue={data.accounts[0]?.currency ?? "BRL"}
                  maxLength={3}
                  minLength={3}
                  name="currency"
                  pattern="[A-Za-z]{3}"
                  required
                />
              </FormField>
              <button className={`${BUTTON_CLASS} sm:col-span-2`} disabled={saving} type="submit">
                Crear meta
              </button>
            </form>
            {data.goals.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {data.goals.map((goal) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm" key={goal.id}>
                    <div>
                      <p className="font-medium text-slate-800">
                        {goal.name}
                        <span className="ml-2 font-normal text-slate-500">
                          {goal.target_date ? `Hasta ${formatDate(goal.target_date)}` : "Sin fecha objetivo"}
                        </span>
                      </p>
                      <p className="mt-1 text-slate-600">
                        {formatMoney(goal.current_amount, goal.currency)} /{" "}
                        {formatMoney(goal.target_amount, goal.currency)}
                      </p>
                    </div>
                    <span className="flex gap-3">
                      <button
                        className="font-medium text-emerald-800 hover:underline"
                        onClick={() => openEditRecord("himb_goals", goal)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="font-medium text-rose-700 hover:underline"
                        disabled={saving}
                        onClick={() => deleteRecord("himb_goals", goal.id, `la meta "${goal.name}"`)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Aún no hay metas.</EmptyState>
            )}
          </Panel>
        </div>
        ) : null}
        </div>
      </div>
      {editingRecord ? (
        <EditRecordDialog
          accounts={data.accounts}
          categories={data.categories}
          entry={editingRecord}
          error={actionError}
          saving={saving}
          onClose={() => setEditingRecord(null)}
          onSubmit={updateRecord}
        />
      ) : null}
    </main>
  );
}
