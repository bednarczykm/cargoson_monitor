"use client";

import { useEffect, useState } from "react";
import { History, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface HistoryItem {
  id: string;
  checkDate: string;
  recipientsCount: number;
  alertsCount: number;
  discrepanciesCount: number;
  status: string;
  csvData: string | null;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then((res) => res.json())
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = (item: HistoryItem) => {
    if (!item.csvData) return;

    try {
      const data = JSON.parse(item.csvData);
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
        "Waluta",
        "Cena API (PLN)",
        "Cena cennik (PLN)",
        "Roznica (PLN)",
      ];

      const csv = [
        headers.join(","),
        ...data.map((r: any) => {
          const diff = r.apiPricePLN >= 0 && r.priceListPrice !== null
            ? (r.apiPricePLN - r.priceListPrice).toFixed(2)
            : "";
          return [
            r.recipientName,
            r.street,
            r.city,
            r.postalCode,
            r.country,
            r.dimensions || "",
            r.weight ?? "",
            r.carrier,
            r.serviceMethod || "",
            r.apiPrice >= 0 ? r.apiPrice.toFixed(2) : "brak danych",
            r.apiCurrency || "",
            r.apiPricePLN >= 0 ? r.apiPricePLN.toFixed(2) : "brak danych",
            r.priceListPrice !== null ? r.priceListPrice.toFixed(2) : "",
            diff,
          ]
            .map((v) => `"${v}"`)
            .join(",");
        }),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `sprawdzenie_${new Date(item.checkDate).toISOString().split("T")[0]}.csv`;
      link.click();
    } catch (error) {
      console.error("Error parsing CSV data:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: pl });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Historia sprawdzeń</h1>
        <p className="text-slate-500 mt-1">Przegląd wszystkich wykonanych sprawdzeń cen</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" />
            Historia ({history.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <History className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Brak historii sprawdzeń</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data sprawdzenia</TableHead>
                  <TableHead>Liczba adresów</TableHead>
                  <TableHead>Rozbieżności</TableHead>
                  <TableHead>Nowe alerty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {formatDate(item.checkDate)}
                    </TableCell>
                    <TableCell>{item.recipientsCount}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-sm ${
                          (item.discrepanciesCount || 0) > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                        }`}
                        title={item.discrepanciesCount > 0 && item.alertsCount === 0 
                          ? "Rozbieżności znalezione, ale alerty już istnieją (nierozwiązane)" 
                          : ""}
                      >
                        {item.discrepanciesCount || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-sm ${
                          item.alertsCount > 0
                            ? "bg-red-100 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.alertsCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-sm ${
                          item.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.status === "completed" ? "Zakończony" : item.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.csvData && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(item)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Pobierz CSV
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
