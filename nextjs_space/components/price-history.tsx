"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PriceHistoryEntry {
  id: string;
  priceListItemId: string;
  action: "created" | "changed" | "deleted";
  length: number;
  width: number;
  height: number;
  weight: number;
  carrier: string;
  serviceMethod: string;
  destinationCountry: string;
  oldPrice: number | null;
  oldCurrency: string | null;
  newPrice: number | null;
  newCurrency: string | null;
  source: string;
  changedBy: string | null;
  details: string | null;
  changedAt: string;
}

export interface PriceHistoryItem {
  id: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  carrier: string;
  serviceMethod: string;
  destinationCountry: string;
  basePrice: number;
  currency?: string;
  priceSince?: string;
  priceSinceApprox?: boolean;
}

export const SOURCE_LABELS: Record<string, string> = {
  manual: "Ręcznie",
  csv: "Import CSV",
  cargoson_api: "API Cargoson",
};

export const ACTION_LABELS: Record<PriceHistoryEntry["action"], string> = {
  created: "Dodano",
  changed: "Zmiana ceny",
  deleted: "Usunięto",
};

export function formatDate(value: string | Date): string {
  return format(new Date(value), "dd.MM.yyyy", { locale: pl });
}

export function formatDateTime(value: string | Date): string {
  return format(new Date(value), "dd.MM.yyyy HH:mm", { locale: pl });
}

export const APPROX_HINT =
  "Data przybliżona: pozycja jest sprzed włączenia historii cen. Pokazujemy ostatnią aktualizację z API Cargoson, a gdy jej nie było, datę dodania pozycji.";

function money(value: number, currency: string | null | undefined): string {
  return `${value.toFixed(2)} ${currency || "PLN"}`;
}

// „Cena od” w liście cennika: dokładna data albo „≈ data” z podpowiedzią.
export function PriceSinceCell({ item }: { item: PriceHistoryItem }) {
  if (!item.priceSince) return <span className="text-slate-400">–</span>;
  if (item.priceSinceApprox) {
    return (
      <span className="text-slate-400 whitespace-nowrap cursor-help" title={APPROX_HINT}>
        ≈ {formatDate(item.priceSince)}
      </span>
    );
  }
  return <span className="text-slate-700 whitespace-nowrap">{formatDate(item.priceSince)}</span>;
}

// Zmiana ceny: stara → nowa z procentem. Podwyżka na czerwono, obniżka na zielono.
export function PriceChangeCell({ entry }: { entry: PriceHistoryEntry }) {
  if (entry.action === "created" && entry.newPrice !== null) {
    return <span className="font-medium text-slate-800">{money(entry.newPrice, entry.newCurrency)}</span>;
  }
  if (entry.action === "deleted" && entry.oldPrice !== null) {
    return <span className="text-slate-400 line-through">{money(entry.oldPrice, entry.oldCurrency)}</span>;
  }
  if (entry.oldPrice === null || entry.newPrice === null) return <span className="text-slate-400">–</span>;

  const sameCurrency = (entry.oldCurrency || "PLN") === (entry.newCurrency || "PLN");
  const diff = entry.newPrice - entry.oldPrice;
  const pct = sameCurrency && entry.oldPrice !== 0 ? (diff / entry.oldPrice) * 100 : null;
  const up = diff > 0;
  return (
    <span className="whitespace-nowrap">
      <span className="text-slate-400">{money(entry.oldPrice, entry.oldCurrency)}</span>
      <span className="mx-1.5 text-slate-400">→</span>
      <span className="font-medium text-slate-800">{money(entry.newPrice, entry.newCurrency)}</span>
      {pct !== null && diff !== 0 && (
        <span
          className={`ml-2 inline-flex items-center text-xs font-medium ${up ? "text-red-600" : "text-emerald-600"}`}
        >
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {up ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
      )}
      {!sameCurrency && <span className="ml-2 text-xs text-amber-600">zmiana waluty</span>}
    </span>
  );
}

export function routeLabel(r: Pick<PriceHistoryItem, "length" | "width" | "height" | "weight" | "carrier" | "serviceMethod" | "destinationCountry">): string {
  return `${r.carrier} ${r.serviceMethod || "Standard"}, ${r.destinationCountry}, ${r.length}x${r.width}x${r.height} cm, ${r.weight} kg`;
}

function PriceChart({ entries, currentPrice }: { entries: PriceHistoryEntry[]; currentPrice: number }) {
  // Punkty wykresu: każda ustalona cena (dodanie i zmiany), od najstarszej,
  // plus punkt „teraz” z obecną ceną, żeby linia dochodziła do dzisiaj.
  const points = useMemo(() => {
    const pts = entries
      .filter((e) => e.action !== "deleted" && e.newPrice !== null)
      .slice()
      .reverse()
      .map((e) => ({ t: new Date(e.changedAt).getTime(), price: e.newPrice as number }));
    if (pts.length > 0) pts.push({ t: Date.now(), price: currentPrice });
    return pts;
  }, [entries, currentPrice]);
  const currencies = new Set(entries.map((e) => e.newCurrency).filter(Boolean));
  // Wykres ma sens od dwóch różnych cen; przy mieszanych walutach byłby mylący.
  if (new Set(points.map((p) => p.price)).size < 2 || currencies.size > 1) return null;
  const spanMs = points[points.length - 1].t - points[0].t;
  const tickFormat = spanMs < 2 * 86400000 ? "HH:mm" : "dd.MM";

  return (
    <div className="h-48 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(v) => format(new Date(v), tickFormat, { locale: pl })}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 11, fill: "#64748b" }}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <Tooltip
            formatter={(v: number) => [v.toFixed(2), "Cena"]}
            labelFormatter={(v) => formatDateTime(new Date(v as number))}
          />
          <Line type="stepAfter" dataKey="price" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceHistoryDialog({
  item,
  onClose,
}: {
  item: PriceHistoryItem | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<PriceHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    fetch(`/api/pricelist/history?itemId=${encodeURIComponent(item.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Błąd pobierania historii");
        if (!cancelled) setEntries(data.entries as PriceHistoryEntry[]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle>Historia ceny</DialogTitle>
              <DialogDescription>{routeLabel(item)}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-4 py-3">
              <div>
                <span className="text-sm text-slate-500">Obecna cena: </span>
                <span className="font-semibold text-emerald-600">{money(item.basePrice, item.currency)}</span>
              </div>
              {item.priceSince && (
                <div className="text-sm">
                  <span className="text-slate-500">obowiązuje od: </span>
                  {item.priceSinceApprox ? (
                    <span className="text-slate-500 cursor-help" title={APPROX_HINT}>
                      ≈ {formatDate(item.priceSince)} (przybliżona)
                    </span>
                  ) : (
                    <span className="text-slate-800">{formatDateTime(item.priceSince)}</span>
                  )}
                </div>
              )}
            </div>

            {error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : entries === null ? (
              <div className="h-32 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                Brak zapisanych zmian. Ta pozycja nie zmieniła ceny od włączenia historii cen.
              </p>
            ) : (
              <div className="space-y-4">
                <PriceChart entries={entries} currentPrice={item.basePrice} />
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Zdarzenie</TableHead>
                        <TableHead>Cena</TableHead>
                        <TableHead>Źródło</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDateTime(e.changedAt)}</TableCell>
                          <TableCell className="text-sm">
                            {ACTION_LABELS[e.action] ?? e.action}
                            {e.details && <div className="text-xs text-slate-500 mt-0.5">{e.details}</div>}
                          </TableCell>
                          <TableCell className="text-sm">
                            <PriceChangeCell entry={e} />
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {SOURCE_LABELS[e.source] ?? e.source}
                            {e.changedBy && <div className="text-xs text-slate-400">{e.changedBy}</div>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
