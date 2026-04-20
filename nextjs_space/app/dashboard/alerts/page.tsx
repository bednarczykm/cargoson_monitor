"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, CheckCircle, Loader2, Filter, CheckCheck } from "lucide-react";
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

interface Alert {
  id: string;
  checkDate: string;
  recipientName: string;
  city: string;
  carrier: string;
  apiPrice: number;
  priceListPrice: number | null;
  difference: number | null;
  percentDiff: number | null;
  status: string;
  createdAt: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [resolvingAll, setResolvingAll] = useState(false);

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`/api/alerts?status=${filter}`);
      const data = await res.json();
      setAlerts(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const handleResolve = async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      fetchAlerts();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleResolveAll = async () => {
    if (!confirm("Czy na pewno chcesz oznaczyć wszystkie nierozwiązane alerty jako rozwiązane?")) {
      return;
    }
    
    setResolvingAll(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve-all" }),
      });
      const data = await res.json();
      if (data.success) {
        fetchAlerts();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setResolvingAll(false);
    }
  };

  const unresolvedCount = alerts.filter(a => a.status === "unresolved").length;

  const handleExport = () => {
    const headers = [
      "Data",
      "Odbiorca",
      "Miejscowość",
      "Carrier",
      "Cena API",
      "Cena cennik",
      "Różnica",
      "Status",
    ];

    const csv = [
      headers.join(","),
      ...alerts.map((a) =>
        [
          format(new Date(a.createdAt), "dd.MM.yyyy HH:mm", { locale: pl }),
          a.recipientName,
          a.city,
          a.carrier,
          a.apiPrice.toFixed(2),
          a.priceListPrice?.toFixed(2) ?? "",
          a.difference?.toFixed(2) ?? "",
          a.status === "resolved" ? "Rozwiązany" : "Nierozwiązany",
        ]
          .map((v) => `"${v}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `alerty_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: pl });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Alerty</h1>
          <p className="text-slate-500 mt-1">Przegląd rozbieżności cenowych</p>
        </div>
        <div className="flex items-center gap-2">
          {unresolvedCount > 0 && (
            <Button 
              variant="outline" 
              onClick={handleResolveAll}
              disabled={resolvingAll}
              className="text-green-600 border-green-300 hover:bg-green-50"
            >
              {resolvingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Rozwiąż wszystkie ({unresolvedCount})
            </Button>
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Alerty ({alerts.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Wszystkie</option>
              <option value="unresolved">Nierozwiązane</option>
              <option value="resolved">Rozwiązane</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Brak alertów</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Odbiorca</TableHead>
                  <TableHead>Miejscowość</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead className="text-right">Cena API</TableHead>
                  <TableHead className="text-right">Cena cennik</TableHead>
                  <TableHead className="text-right">Różnica</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="text-sm">
                      {formatDate(alert.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">{alert.recipientName}</TableCell>
                    <TableCell>{alert.city}</TableCell>
                    <TableCell>{alert.carrier}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {alert.apiPrice.toFixed(2)} €
                    </TableCell>
                    <TableCell className="text-right">
                      {alert.priceListPrice?.toFixed(2) ?? "-"} €
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        (alert.difference ?? 0) > 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {alert.difference !== null
                        ? `${alert.difference > 0 ? "+" : ""}${alert.difference.toFixed(2)} €`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-sm ${
                          alert.status === "resolved"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {alert.status === "resolved" ? "Rozwiązany" : "Oczekuje"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {alert.status !== "resolved" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResolve(alert.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Rozwiąż
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
