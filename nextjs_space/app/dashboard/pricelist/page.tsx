"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  FileText,
  Plus,
  Upload,
  Download,
  FileDown,
  Pencil,
  Trash2,
  X,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CARGOSON_CARRIERS } from "@/lib/carriers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PriceItem {
  id: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  carrier: string;
  serviceMethod: string;
  destinationCountry: string;
  basePrice: number;
  isActive: boolean;
}

type SortKey = "dimensions" | "weight" | "carrier" | "serviceMethod" | "destinationCountry" | "basePrice";
type SortDir = "asc" | "desc";

const TEMPLATE_HEADERS = ["Wymiary paczki (DxSxW cm)", "Waga (kg)", "Carrier", "Metoda wysyłki", "Kraj docelowy", "Cena bazowa (PLN)"];

export default function PriceListPage() {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    length: "",
    width: "",
    height: "",
    weight: "",
    carrier: "",
    serviceMethod: "",
    destinationCountry: "",
    basePrice: "",
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters & sorting
  const [searchText, setSearchText] = useState("");
  const [filterCarrier, setFilterCarrier] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchItems = async () => {
    try {
      const res = await fetch("/api/pricelist");
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Get unique carriers and countries for filters
  const uniqueCarriers = useMemo(() => [...new Set(items.map(i => i.carrier))].sort(), [items]);
  const uniqueCountries = useMemo(() => [...new Set(items.map(i => i.destinationCountry))].sort(), [items]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Text search
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(item =>
        item.carrier.toLowerCase().includes(lower) ||
        item.serviceMethod?.toLowerCase().includes(lower) ||
        item.destinationCountry.toLowerCase().includes(lower)
      );
    }

    // Carrier filter
    if (filterCarrier) {
      result = result.filter(item => item.carrier === filterCarrier);
    }

    // Country filter
    if (filterCountry) {
      result = result.filter(item => item.destinationCountry === filterCountry);
    }

    // Sorting
    if (sortKey) {
      result.sort((a, b) => {
        let valA: number | string;
        let valB: number | string;

        switch (sortKey) {
          case "dimensions":
            valA = a.length * a.width * a.height;
            valB = b.length * b.width * b.height;
            break;
          case "weight":
            valA = a.weight;
            valB = b.weight;
            break;
          case "carrier":
            valA = a.carrier.toLowerCase();
            valB = b.carrier.toLowerCase();
            break;
          case "serviceMethod":
            valA = (a.serviceMethod || "").toLowerCase();
            valB = (b.serviceMethod || "").toLowerCase();
            break;
          case "destinationCountry":
            valA = a.destinationCountry;
            valB = b.destinationCountry;
            break;
          case "basePrice":
            valA = a.basePrice;
            valB = b.basePrice;
            break;
          default:
            return 0;
        }

        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [items, searchText, filterCarrier, filterCountry, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingId ? `/api/pricelist/${editingId}` : "/api/pricelist";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setFormData({ length: "", width: "", height: "", weight: "", carrier: "", serviceMethod: "", destinationCountry: "", basePrice: "" });
        fetchItems();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: PriceItem) => {
    setFormData({
      length: item.length.toString(),
      width: item.width.toString(),
      height: item.height.toString(),
      weight: item.weight.toString(),
      carrier: item.carrier,
      serviceMethod: item.serviceMethod || "",
      destinationCountry: item.destinationCountry,
      basePrice: item.basePrice.toString(),
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę pozycję?")) return;

    try {
      await fetch(`/api/pricelist/${id}`, { method: "DELETE" });
      fetchItems();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/pricelist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      setItems(items.map(item => 
        item.id === id ? { ...item, isActive } : item
      ));
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleBulkToggle = async (activate: boolean) => {
    const idsToUpdate = filteredItems.map(item => item.id);
    try {
      await Promise.all(
        idsToUpdate.map(id =>
          fetch(`/api/pricelist/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: activate }),
          })
        )
      );
      setItems(items.map(item =>
        idsToUpdate.includes(item.id) ? { ...item, isActive: activate } : item
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

        const res = await fetch("/api/pricelist/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });

        const result = await res.json();
        alert(`Import zakończony: ${result.success} sukcesów, ${result.errors} błędów`);
        fetchItems();
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
      ...items.map((item) =>
        [
          `${item.length}x${item.width}x${item.height}`,
          item.weight,
          item.carrier,
          item.serviceMethod || "Standard",
          item.destinationCountry,
          item.basePrice,
        ]
          .map((v) => `"${v}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cennik.csv";
    link.click();
  };

  const handleDownloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(",");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "szablon_cennik.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Cennik</h1>
          <p className="text-slate-500 mt-1">Zarządzaj cennikiem do porównywania z API</p>
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
            Dodaj pozycję
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {editingId ? "Edytuj pozycję" : "Dodaj nową pozycję"}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormData({ length: "", width: "", height: "", weight: "", carrier: "", serviceMethod: "", destinationCountry: "", basePrice: "" });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
              <Input
                type="number"
                placeholder="Długość (cm)"
                value={formData.length}
                onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                required
              />
              <Input
                type="number"
                placeholder="Szerokość (cm)"
                value={formData.width}
                onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                required
              />
              <Input
                type="number"
                placeholder="Wysokość (cm)"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                required
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Waga (kg)"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                required
              />
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formData.carrier}
                onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                required
              >
                <option value="">Wyb. przewoźnika</option>
                {CARGOSON_CARRIERS.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <Input
                placeholder="Metoda wysyłki"
                value={formData.serviceMethod}
                onChange={(e) => setFormData({ ...formData, serviceMethod: e.target.value })}
              />
              <Input
                placeholder="Kraj (np. DE)"
                value={formData.destinationCountry}
                onChange={(e) => setFormData({ ...formData, destinationCountry: e.target.value.toUpperCase() })}
                maxLength={3}
                required
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Cena (PLN)"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                required
              />
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zapisz"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            Cennik ({filteredItems.length}{filteredItems.length !== items.length ? ` z ${items.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              <Input
                placeholder="Szukaj..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-40 h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={filterCarrier}
                onChange={(e) => setFilterCarrier(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Wszyscy przewoźnicy</option>
                {uniqueCarriers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Wszystkie kraje</option>
                {uniqueCountries.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {(searchText || filterCarrier || filterCountry) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchText("");
                  setFilterCarrier("");
                  setFilterCountry("");
                }}
                className="text-slate-500"
              >
                <X className="h-4 w-4 mr-1" />
                Wyczyść filtry
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(true)}
                disabled={filteredItems.length === 0}
              >
                <ToggleRight className="h-4 w-4 mr-1" />
                Włącz ({filteredItems.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkToggle(false)}
                disabled={filteredItems.length === 0}
              >
                <ToggleLeft className="h-4 w-4 mr-1" />
                Wyłącz ({filteredItems.length})
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Brak pozycji cennika. Dodaj pierwszą lub zaimportuj z pliku CSV.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Search className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>Brak wyników dla wybranych filtrów</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Aktywny</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => handleSort("dimensions")}
                    >
                      <span className="flex items-center">
                        Wymiary
                        <SortIcon columnKey="dimensions" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => handleSort("weight")}
                    >
                      <span className="flex items-center">
                        Waga
                        <SortIcon columnKey="weight" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => handleSort("carrier")}
                    >
                      <span className="flex items-center">
                        Carrier
                        <SortIcon columnKey="carrier" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => handleSort("serviceMethod")}
                    >
                      <span className="flex items-center">
                        Metoda wysyłki
                        <SortIcon columnKey="serviceMethod" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => handleSort("destinationCountry")}
                    >
                      <span className="flex items-center">
                        Kraj
                        <SortIcon columnKey="destinationCountry" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => handleSort("basePrice")}
                    >
                      <span className="flex items-center">
                        Cena (PLN)
                        <SortIcon columnKey="basePrice" />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""}>
                      <TableCell>
                        <Switch
                          checked={item.isActive}
                          onCheckedChange={(checked) => handleToggle(item.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {item.length}x{item.width}x{item.height} cm
                      </TableCell>
                      <TableCell>{item.weight} kg</TableCell>
                      <TableCell className="max-w-[150px] truncate text-sm" title={item.carrier}>
                        {item.carrier}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-sm" title={item.serviceMethod}>
                        {item.serviceMethod || "Standard"}
                      </TableCell>
                      <TableCell>{item.destinationCountry}</TableCell>
                      <TableCell className="font-semibold text-emerald-600">
                        {item.basePrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
