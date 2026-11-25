"use client";

import { useEffect, useState } from "react";
import { Filter, LineChart, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACTION_LABELS,
  PriceChangeCell,
  PriceHistoryEntry,
  SOURCE_LABELS,
  formatDateTime,
} from "@/components/price-history";

interface HistoryResponse {
  entries: PriceHistoryEntry[];
  total: number;
  limit: number;
  carriers: string[];
  countries: string[];
}

const selectClass =
  "h-9 px-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// Granice dnia w czasie przeglądarki (polskim), wysyłane do API jako ISO.
function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}
function nextDayStartIso(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function PriceHistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [country, setCountry] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (carrier) params.set("carrier", carrier);
    if (country) params.set("country", country);
    if (action) params.set("action", action);
    if (from) params.set("from", dayStartIso(from));
    if (to) params.set("to", nextDayStartIso(to));
    setLoading(true);
    setError(null);
    fetch(`/api/pricelist/history?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Błąd pobierania historii");
        if (!cancelled) setData(body as HistoryResponse);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [carrier, country, action, from, to]);

  const hasFilters = Boolean(carrier || country || action || from || to);
  const entries = data?.entries ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Historia cen</h1>
        <p className="text-slate-500 mt-1">
          Każda zmiana cennika: nowe pozycje, zmiany cen i usunięcia, z datą i źródłem zmiany
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-600" />
            Zmiany cennika
            {data && (
              <span className="text-base font-normal text-slate-500">
                ({data.total > entries.length ? `${entries.length} najnowszych z ${data.total}` : data.total})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Filter className="h-4 w-4 text-slate-400" />
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={selectClass}>
              <option value="">Wszyscy przewoźnicy</option>
              {(data?.carriers ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass}>
              <option value="">Wszystkie kraje</option>
              {(data?.countries ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={action} onChange={(e) => setAction(e.target.value)} className={selectClass}>
              <option value="">Wszystkie zdarzenia</option>
              <option value="changed">Zmiany cen</option>
              <option value="created">Dodane pozycje</option>
              <option value="deleted">Usunięte pozycje</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              od
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              do
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
            </label>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-500"
                onClick={() => {
                  setCarrier("");
                  setCountry("");
                  setAction("");
                  setFrom("");
                  setTo("");
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Wyczyść filtry
              </Button>
            )}
          </div>

          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : loading && !data ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <LineChart className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>
                {hasFilters
                  ? "Brak zmian dla wybranych filtrów"
                  : "Brak zapisanych zmian. Historia zapisuje się od teraz przy każdej zmianie cennika."}
              </p>
            </div>
          ) : (
            <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Pozycja</TableHead>
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
                        <div className="font-medium text-slate-800">
                          {e.carrier} {e.serviceMethod} · {e.destinationCountry}
                        </div>
                        <div className="text-xs text-slate-500">
                          {e.length}x{e.width}x{e.height} cm, {e.weight} kg
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {ACTION_LABELS[e.action] ?? e.action}
                        {e.details && <div className="text-xs text-slate-500 mt-0.5 max-w-xs">{e.details}</div>}
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
              {data && data.total > entries.length && (
                <p className="text-xs text-slate-500 mt-3">
                  Pokazano {entries.length} najnowszych wpisów z {data.total}. Zawęź filtry (przewoźnik, kraj, okres),
                  żeby zobaczyć starsze.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
