"use client";

import { useEffect, useState } from "react";
import { Settings, Save, Loader2, Mail, MessageSquare, Clock, Percent, Send, History, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface SettingsData {
  id: string;
  tolerancePercent: number;
  checkIntervalMinutes: number;
  pauseStart: string;
  pauseEnd: string;
  alertEmail: string;
  slackWebhook: string;
  monitoringEnabled: boolean;
  collectionPostcode: string;
  collectionCountry: string;
}

interface NotificationLog {
  id: string;
  type: string;
  alertId: string | null;
  message: string;
  status: string;
  error: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [slackTestResult, setSlackTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then(setSettings)
      .catch(console.error)
      .finally(() => setLoading(false));
    
    // Load notification logs
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/notifications/logs");
      const data = await res.json();
      if (Array.isArray(data)) {
        setNotificationLogs(data);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    setSlackTestResult(null);

    try {
      const res = await fetch("/api/notifications/test-slack", { method: "POST" });
      const data = await res.json();
      
      if (res.ok) {
        setSlackTestResult({ success: true, message: data.message || "Wysłano!" });
      } else {
        setSlackTestResult({ success: false, message: data.error || "Błąd" });
      }
      
      // Refresh logs
      fetchLogs();
    } catch (error) {
      setSlackTestResult({ success: false, message: "Błąd połączenia" });
    } finally {
      setTestingSlack(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setSuccess(false);

    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Ustawienia</h1>
          <p className="text-slate-500 mt-1">Konfiguracja systemu monitorowania</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {success ? "Zapisano!" : "Zapisz ustawienia"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-blue-600" />
              Tolerancja cenowa
            </CardTitle>
            <CardDescription>
              Procentowa tolerancja różnicy cen przed wygenerowaniem alertu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tolerancja (%)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={settings?.tolerancePercent ?? 0}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, tolerancePercent: parseFloat(e.target.value) || 0 } : null
                  )
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                0% oznacza alert przy każdej różnicy
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Harmonogram sprawdzeń
            </CardTitle>
            <CardDescription>
              Ustawienia automatycznego monitorowania
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.monitoringEnabled ?? false}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, monitoringEnabled: e.target.checked } : null
                    )
                  }
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium">Włącz automatyczne monitorowanie</span>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Interwał (minuty)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={settings?.checkIntervalMinutes ?? 60}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, checkIntervalMinutes: parseInt(e.target.value) || 60 } : null
                    )
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Przerwa od
                </label>
                <Input
                  type="time"
                  value={settings?.pauseStart ?? "23:00"}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, pauseStart: e.target.value } : null
                    )
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Przerwa do
                </label>
                <Input
                  type="time"
                  value={settings?.pauseEnd ?? "05:00"}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, pauseEnd: e.target.value } : null
                    )
                  }
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              W godzinach przerwy sprawdzenia nie będą wykonywane
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Powiadomienia email
            </CardTitle>
            <CardDescription>
              Adres email do wysyłania alertów
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Adres email
              </label>
              <Input
                type="email"
                placeholder="twoj@email.com"
                value={settings?.alertEmail ?? ""}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, alertEmail: e.target.value } : null
                  )
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Powiadomienia Slack
            </CardTitle>
            <CardDescription>
              Adres email kanału Slack lub webhook URL
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Adres Slack (email kanału lub webhook)
              </label>
              <Input
                type="text"
                placeholder="alerty-xxx@workspace.slack.com"
                value={settings?.slackWebhook ?? ""}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, slackWebhook: e.target.value } : null
                  )
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                Możesz użyć adresu email kanału (np. alerty-xxx@workspace.slack.com) lub webhook URL
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleTestSlack}
                disabled={testingSlack || !settings?.slackWebhook}
              >
                {testingSlack ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Test alertu Slack
              </Button>
              {slackTestResult && (
                <span className={`text-sm flex items-center gap-1 ${slackTestResult.success ? "text-green-600" : "text-red-600"}`}>
                  {slackTestResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {slackTestResult.message}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" />
              Adres nadawczy
            </CardTitle>
            <CardDescription>
              Dane adresowe nadawcy dla zapytań do API Cargoson
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Kod pocztowy nadawcy
                </label>
                <Input
                  type="text"
                  placeholder="10115"
                  value={settings?.collectionPostcode ?? ""}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, collectionPostcode: e.target.value } : null
                    )
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Kraj nadawcy (ISO)
                </label>
                <Input
                  type="text"
                  placeholder="DE"
                  maxLength={2}
                  value={settings?.collectionCountry ?? ""}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, collectionCountry: e.target.value.toUpperCase() } : null
                    )
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              Logi powiadomień
            </CardTitle>
            <CardDescription>
              Historia wysyłanych powiadomień Slack
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : notificationLogs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                Brak logów powiadomień
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {notificationLogs.slice(0, 20).map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border text-sm ${
                      log.status === "success"
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {log.status === "success" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="font-medium capitalize">{log.type}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {format(new Date(log.createdAt), "dd.MM.yyyy HH:mm:ss", { locale: pl })}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 truncate">{log.message}</p>
                    {log.error && (
                      <p className="mt-1 text-red-600 text-xs">{log.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
