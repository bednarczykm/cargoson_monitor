"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  FileText,
  AlertTriangle,
  Activity,
  Clock,
  Truck,
  ArrowRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import AlertsChart from "./_components/alerts-chart";

interface Stats {
  recipientsCount: number;
  priceListCount: number;
  alertsToday: number;
  alertsWeek: number;
  alertsMonth: number;
  unresolvedAlerts: number;
  monitoringEnabled: boolean;
  lastCheck: string | null;
  recentAlerts: Array<{
    id: string;
    recipientName: string;
    carrier: string;
    apiPrice: number;
    priceListPrice: number | null;
    status: string;
    createdAt: string;
  }>;
  alertsByDay: Array<{ date: string; count: number }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Nigdy";
    return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: pl });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 mt-1">Przegląd systemu monitorowania</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              stats?.monitoringEnabled
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {stats?.monitoringEnabled ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span className="font-medium">
              Monitoring {stats?.monitoringEnabled ? "aktywny" : "wyłączony"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100">Adresy</p>
                <p className="text-3xl font-bold mt-1">
                  {stats?.recipientsCount ?? 0}
                </p>
              </div>
              <Users className="h-10 w-10 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100">Pozycje cennika</p>
                <p className="text-3xl font-bold mt-1">
                  {stats?.priceListCount ?? 0}
                </p>
              </div>
              <FileText className="h-10 w-10 text-emerald-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100">Alerty (dziś)</p>
                <p className="text-3xl font-bold mt-1">
                  {stats?.alertsToday ?? 0}
                </p>
              </div>
              <AlertTriangle className="h-10 w-10 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-500 to-rose-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-rose-100">Nierozwiązane</p>
                <p className="text-3xl font-bold mt-1">
                  {stats?.unresolvedAlerts ?? 0}
                </p>
              </div>
              <Activity className="h-10 w-10 text-rose-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Alerty w czasie (30 dni)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertsChart data={stats?.alertsByDay ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Status systemu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Ostatnie sprawdzenie</p>
              <p className="font-semibold text-slate-800">
                {formatDate(stats?.lastCheck ?? null)}
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Alerty w tym tygodniu</p>
              <p className="font-semibold text-slate-800">
                {stats?.alertsWeek ?? 0}
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Alerty w tym miesiącu</p>
              <p className="font-semibold text-slate-800">
                {stats?.alertsMonth ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Ostatnie alerty
            </CardTitle>
            <Link href="/dashboard/alerts">
              <Button variant="ghost" size="sm">
                Zobacz wszystkie
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {(stats?.recentAlerts?.length ?? 0) === 0 ? (
              <p className="text-slate-500 text-center py-8">
                Brak alertów
              </p>
            ) : (
              <div className="space-y-3">
                {stats?.recentAlerts?.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {alert.recipientName}
                      </p>
                      <p className="text-sm text-slate-500">{alert.carrier}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-rose-600">
                        {alert.apiPrice?.toFixed(2)} €
                      </p>
                      <p
                        className={`text-xs px-2 py-1 rounded ${
                          alert.status === "resolved"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {alert.status === "resolved" ? "Rozwiązany" : "Oczekuje"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              Szybkie akcje
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/dashboard/recipients" className="block">
              <Button variant="outline" className="w-full justify-start gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                Zarządzaj adresami
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/pricelist" className="block">
              <Button variant="outline" className="w-full justify-start gap-3">
                <FileText className="h-5 w-5 text-emerald-600" />
                Zarządzaj cennikiem
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/check-prices" className="block">
              <Button className="w-full justify-start gap-3">
                <Truck className="h-5 w-5" />
                Sprawdź ceny teraz
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/settings" className="block">
              <Button variant="outline" className="w-full justify-start gap-3">
                <Activity className="h-5 w-5 text-slate-600" />
                Ustawienia monitoringu
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
