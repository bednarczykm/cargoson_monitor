"use client";

import { useState } from "react";
import { Truck, Download, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PriceResult {
  recipientName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  carrier: string;
  serviceMethod: string;
  dimensions: string;
  weight: number;
  apiPrice: number;
  apiCurrency: string;
  apiPricePLN: number;
  priceListPrice: number | null;       // raw native-currency value
  priceListCurrency?: string;
  priceListPricePLN?: number | null;   // converted to PLN
}

interface CheckResult {
  results: PriceResult[];
  errors: string[];
  checkHistoryId?: string;
  recipientsChecked: number;
  alertsCreated?: number;
}

export default function CheckPricesPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckPrices = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/check-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testOnly: false }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Wystąpił błąd");
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Wystąpił błąd połączenia");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!result?.results) return;

    const headers = [
      "Nazwa odbiorcy",
      "Ulica",
      "Miejscowość",
      "Kod pocztowy",
      "Kraj",
      "Wymiary (cm)",
      "Waga (kg)",
      "Carrier",
      "Metoda wysylki",
      "Cena API",
      "Waluta API",
      "Cena API (PLN)",
      "Cena cennik (natywna)",
      "Waluta cennika",
      "Cena cennik (PLN)",
      "Roznica (PLN)",
    ];

    const csv = [
      headers.join(","),
      ...result.results.map((r) => {
        const listPLN = r.priceListPricePLN ?? null;
        const diff = r.apiPricePLN >= 0 && listPLN !== null
          ? (r.apiPricePLN - listPLN).toFixed(2)
          : "";
        return [
          r.recipientName,
          r.street,
          r.city,
          r.postalCode,
          r.country,
          r.dimensions,
          r.weight,
          r.carrier,
          r.serviceMethod,
          r.apiPrice >= 0 ? r.apiPrice.toFixed(2) : "brak danych",
          r.apiCurrency || "",
          r.apiPricePLN >= 0 ? r.apiPricePLN.toFixed(2) : "brak danych",
          r.priceListPrice !== null ? r.priceListPrice.toFixed(2) : "",
          r.priceListCurrency || "",
          listPLN !== null ? listPLN.toFixed(2) : "",
          diff,
        ]
          .map((v) => `"${v}"`)
          .join(",");
      }),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sprawdzenie_cen_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Sprawdź ceny</h1>
          <p className="text-slate-500 mt-1">
            Sprawdź aktualne ceny w Cargoson dla wszystkich adresów
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Test sprawdzenia cen
          </CardTitle>
          <CardDescription>
            Dla każdego adresu sprawdzane są ceny dla wszystkich kombinacji wymiarów i wag zdefiniowanych w cenniku.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleCheckPrices} disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sprawdzanie...
                </>
              ) : (
                <>
                  <Truck className="mr-2 h-5 w-5" />
                  Sprawdź ceny w Cargoson
                </>
              )}
            </Button>

            {result && (
              <Button variant="outline" onClick={handleDownloadCSV}>
                <Download className="mr-2 h-4 w-4" />
                Pobierz wyniki CSV
              </Button>
            )}
          </div>

          {loading && (
            <div className="p-6 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <div>
                  <p className="font-medium text-blue-800">Trwa sprawdzanie cen...</p>
                  <p className="text-sm text-blue-600">Proszę czekać, to może potrwać chwilę</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 rounded-lg flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <p className="text-green-700">
                  Sprawdzono {result.recipientsChecked} adresów, pobrano {result.results.length} ofert
                </p>
              </div>

              {(result.alertsCreated ?? 0) > 0 && (
                <div className="p-4 bg-red-50 rounded-lg flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <p className="text-red-700">
                    <strong>Utworzono {result.alertsCreated} alertów</strong> - wykryto rozbieżności cen przekraczające tolerancję.
                    <a href="/dashboard/alerts" className="ml-2 underline">Zobacz alerty →</a>
                  </p>
                </div>
              )}

              {(result.errors?.length ?? 0) > 0 && (
                <div className="p-4 bg-amber-50 rounded-lg">
                  <p className="font-medium text-amber-800 mb-2">Błędy ({result.errors.length}):</p>
                  <ul className="text-sm text-amber-700 list-disc pl-5">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>...i {result.errors.length - 5} więcej</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {result && result.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wyniki sprawdzenia</CardTitle>
            <CardDescription>
              Ceny są porównywane w PLN. Ceny w EUR są przeliczane po kursie 4.3 PLN/EUR.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Odbiorca</TableHead>
                    <TableHead>Kraj</TableHead>
                    <TableHead>Wymiary</TableHead>
                    <TableHead>Waga</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Metoda wysyłki</TableHead>
                    <TableHead className="text-right">Cena API</TableHead>
                    <TableHead className="text-right">Cena cennik</TableHead>
                    <TableHead className="text-right">Różnica</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.results.map((r, i) => {
                    const hasApiPrice = r.apiPricePLN >= 0;
                    const listPLN = r.priceListPricePLN ?? null;
                    const diff =
                      hasApiPrice && listPLN !== null
                        ? r.apiPricePLN - listPLN
                        : null;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.recipientName}</TableCell>
                        <TableCell>{r.country}</TableCell>
                        <TableCell className="text-sm">{r.dimensions} cm</TableCell>
                        <TableCell>{r.weight} kg</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={r.carrier}>
                          {r.carrier}
                        </TableCell>
                        <TableCell className="text-sm max-w-[150px] truncate" title={r.serviceMethod}>
                          {r.serviceMethod}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {hasApiPrice ? (
                            <span>
                              {r.apiPricePLN.toFixed(2)} PLN
                              {r.apiCurrency === "EUR" && (
                                <span className="text-xs text-slate-400 block">
                                  ({r.apiPrice.toFixed(2)} EUR)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-amber-600 text-sm">brak danych</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {listPLN !== null ? (
                            <span>
                              {listPLN.toFixed(2)} PLN
                              {r.priceListCurrency && r.priceListCurrency !== "PLN" && r.priceListPrice !== null && (
                                <span className="text-xs text-slate-400 block">
                                  ({r.priceListPrice.toFixed(2)} {r.priceListCurrency})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            diff === null
                              ? "text-slate-400"
                              : diff > 0
                              ? "text-red-600"
                              : diff < 0
                              ? "text-green-600"
                              : "text-slate-600"
                          }`}
                        >
                          {diff !== null ? `${diff > 0 ? "+" : ""}${diff.toFixed(2)} PLN` : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
