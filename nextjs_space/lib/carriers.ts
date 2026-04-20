// Lista przewoźników dostępnych w Cargoson
export const CARGOSON_CARRIERS = [
  { id: 4492, name: "FedEx" },
  { id: 3559, name: "DHL Express" },
  { id: 3560, name: "DHL Parcel" },
  { id: 2706, name: "DPD" },
  { id: 3971, name: "Raben" },
  { id: 3973, name: "Schenker" },
  { id: 3265, name: "UPS Polska" },
] as const;

export type CarrierName = typeof CARGOSON_CARRIERS[number]["name"];
export type CarrierId = typeof CARGOSON_CARRIERS[number]["id"];

export function getCarrierById(id: number): string | undefined {
  return CARGOSON_CARRIERS.find(c => c.id === id)?.name;
}

export function getCarrierIdByName(name: string): number | undefined {
  const normalizedName = name.toLowerCase();
  return CARGOSON_CARRIERS.find(c => 
    c.name.toLowerCase() === normalizedName ||
    c.name.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(c.name.toLowerCase())
  )?.id;
}

// Normalizuje nazwę przewoźnika z API do nazwy z naszej listy
export function normalizeCarrierName(apiCarrierName: string): string {
  const normalized = apiCarrierName.toLowerCase().trim();
  
  // Mapowanie nazw z API na nasze nazwy
  const mappings: Record<string, string> = {
    "fedex": "FedEx",
    "fedex express": "FedEx",
    "dhl": "DHL Express",
    "dhl express": "DHL Express",
    "dhl parcel": "DHL Parcel",
    "dpd": "DPD",
    "dpd polska": "DPD",
    "raben": "Raben",
    "raben group": "Raben",
    "schenker": "Schenker",
    "db schenker": "Schenker",
    "ups": "UPS Polska",
    "ups polska": "UPS Polska",
  };
  
  // Szukaj dokładnego dopasowania
  if (mappings[normalized]) {
    return mappings[normalized];
  }
  
  // Szukaj częściowego dopasowania
  for (const carrier of CARGOSON_CARRIERS) {
    if (normalized.includes(carrier.name.toLowerCase()) || 
        carrier.name.toLowerCase().includes(normalized)) {
      return carrier.name;
    }
  }
  
  // Zwróć oryginalną nazwę jeśli nie znaleziono
  return apiCarrierName;
}

// Sprawdza czy nazwy przewoźników się zgadzają (z normalizacją)
export function carrierNamesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeCarrierName(name1).toLowerCase();
  const n2 = normalizeCarrierName(name2).toLowerCase();
  return n1 === n2;
}

// Metody wysyłek dla każdego przewoźnika
export const CARRIER_SERVICE_METHODS: Record<string, string[]> = {
  "FedEx": [
    "FedEx Regional Economy",
    "FedEx International Priority",
    "FedEx International Economy",
  ],
  "DHL Express": [
    "DHL Express Worldwide",
    "DHL Express 12:00",
    "DHL Express 09:00",
  ],
  "DHL Parcel": [
    "DHL Parcel Connect",
    "DHL Parcel Connect Plus",
  ],
  "DPD": [
    "DPD Classic",
    "DPD Guarantee",
  ],
  "Raben": [
    "Raben Standard",
    "Raben Express",
  ],
  "Schenker": [
    "DB Schenker System",
    "DB Schenker Premium",
  ],
  "UPS Polska": [
    "UPS Standard",
    "UPS Express Saver",
    "UPS Express",
  ],
};

// Pobierz wszystkie metody dla danego przewoźnika
export function getServiceMethods(carrierName: string): string[] {
  return CARRIER_SERVICE_METHODS[carrierName] || ["Standard"];
}
