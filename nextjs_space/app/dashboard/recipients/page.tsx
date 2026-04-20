"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  Users,
  Plus,
  Upload,
  Download,
  FileDown,
  Pencil,
  Trash2,
  X,
  Loader2,
  Search,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Recipient {
  id: string;
  name: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  isActive: boolean;
}

const TEMPLATE_HEADERS = ["Nazwa odbiorcy", "Ulica", "Miejscowość", "Kod pocztowy", "Kraj"];

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    street: "",
    city: "",
    postalCode: "",
    country: "",
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtrowanie
  const uniqueCountries = useMemo(() => {
    const countries = [...new Set(recipients.map(r => r.country))];
    return countries.sort();
  }, [recipients]);

  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      const matchesSearch = searchText === "" || 
        r.name.toLowerCase().includes(searchText.toLowerCase()) ||
        r.city.toLowerCase().includes(searchText.toLowerCase()) ||
        r.street.toLowerCase().includes(searchText.toLowerCase()) ||
        r.postalCode.toLowerCase().includes(searchText.toLowerCase());
      const matchesCountry = filterCountry === "" || r.country === filterCountry;
      return matchesSearch && matchesCountry;
    });
  }, [recipients, searchText, filterCountry]);

  const fetchRecipients = async () => {
    try {
      const res = await fetch("/api/recipients");
      const data = await res.json();
      setRecipients(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingId
        ? `/api/recipients/${editingId}`
        : "/api/recipients";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setFormData({ name: "", street: "", city: "", postalCode: "", country: "" });
        fetchRecipients();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (recipient: Recipient) => {
    setFormData({
      name: recipient.name,
      street: recipient.street,
      city: recipient.city,
      postalCode: recipient.postalCode,
      country: recipient.country,
    });
    setEditingId(recipient.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten adres?")) return;

    try {
      await fetch(`/api/recipients/${id}`, { method: "DELETE" });
      fetchRecipients();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/recipients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      setRecipients(recipients.map(r => 
        r.id === id ? { ...r, isActive } : r
      ));
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleBulkToggle = async (activate: boolean) => {
    const idsToUpdate = filteredRecipients.map(r => r.id);
    try {
      await Promise.all(
        idsToUpdate.map(id =>
          fetch(`/api/recipients/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: activate }),
          })
        )
      );
      setRecipients(recipients.map(r =>
        idsToUpdate.includes(r.id) ? { ...r, isActive: activate } : r
      ));
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim());
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const data = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => {
            obj[h] = values[i] || "";
          });
          return obj;
        });

        const res = await fetch("/api/recipients/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });

        const result = await res.json();
        alert(`Import zakończony: ${result.success} sukcesów, ${result.errors} błędów`);
        fetchRecipients();
      } catch (error) {
        console.error("Import error:", error);
        alert("Błąd importu pliku");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const csv = [
      TEMPLATE_HEADERS.join(","),
      ...recipients.map((r) =>
        [r.name, r.street, r.city, r.postalCode, r.country].map((v) => `"${v}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "adresy_odbiorców.csv";
    link.click();
  };

  const handleDownloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(",");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "szablon_adresy.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Adresy odbiorców</h1>
          <p className="text-slate-500 mt-1">Zarządzaj adresami do sprawdzania cen</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <FileDown className="mr-2 h-4 w-4" />
            Pobierz szablon
          </Button>
          <input
            type="file"
            accept=".csv"
            onChange={handleImport}
            ref={fileInputRef}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import CSV
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Dodaj adres
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {editingId ? "Edytuj adres" : "Dodaj nowy adres"}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormData({ name: "", street: "", city: "", postalCode: "", country: "" });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Input
                placeholder="Nazwa odbiorcy"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                placeholder="Ulica"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                required
              />
              <Input
                placeholder="Miejscowość"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
              <Input
                placeholder="Kod pocztowy"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                required
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Kraj (np. PL)"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value.toUpperCase() })}
                  maxLength={2}
                  required
                />
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zapisz"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Lista adresów ({filteredRecipients.length}{filteredRecipients.length !== recipients.length ? ` z ${recipients.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtry i przyciski masowe */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Szukaj..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Wszystkie kraje</option>
              {uniqueCountries.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {(searchText || filterCountry) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchText(""); setFilterCountry(""); }}
              >
                <X className="h-4 w-4 mr-1" />
                Wyczyść
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(true)}
                disabled={filteredRecipients.length === 0}
              >
                <ToggleRight className="h-4 w-4 mr-1" />
                Włącz ({filteredRecipients.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(false)}
                disabled={filteredRecipients.length === 0}
              >
                <ToggleLeft className="h-4 w-4 mr-1" />
                Wyłącz ({filteredRecipients.length})
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Brak adresów. Dodaj pierwszy adres lub zaimportuj z pliku CSV.</p>
            </div>
          ) : filteredRecipients.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Search className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Brak wyników dla wybranych filtrów</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Aktywny</TableHead>
                  <TableHead>Nazwa odbiorcy</TableHead>
                  <TableHead>Ulica</TableHead>
                  <TableHead>Miejscowość</TableHead>
                  <TableHead>Kod pocztowy</TableHead>
                  <TableHead>Kraj</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipients.map((r) => (
                  <TableRow key={r.id} className={!r.isActive ? "opacity-50" : ""}>
                    <TableCell>
                      <Switch
                        checked={r.isActive}
                        onCheckedChange={(checked) => handleToggle(r.id, checked)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.street}</TableCell>
                    <TableCell>{r.city}</TableCell>
                    <TableCell>{r.postalCode}</TableCell>
                    <TableCell>{r.country}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
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
