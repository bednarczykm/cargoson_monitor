// Cargoson API client.
//
// IMPORTANT: match the request shape used by the old Python monitor
// (python_scripts/monitor_prices.py), which is the only shape known to
// return realistic prices + full carrier coverage (DPD, Schenker, etc.)
// on this account. An earlier version of this file sent an object
// `rows_attributes: { "0": {...} }` with `package_type: "CTN"` and full
// dimensions; Cargoson treated that as freight and returned 10x prices
// with no DPD/Schenker. This version mirrors the working Python client:
//
//   - `rows_attributes` is an ARRAY
//   - `package_type` defaults to "EUR" (europaleta) — the legacy system used this
//     even for small parcels; Cargoson interprets the pair (EUR, weight) as a
//     parcel-style lookup and returns consistent results
//   - Only `quantity`, `package_type`, `weight` are sent per row
//   - Authorization: Bearer, Accept: application/vnd.api.v1, URL /api/v1/…

// Cargoson dropped the /v1/ URL segment at some point in 2026 — plain /api/
// is the only working endpoint. The Python monitor used /api/v1/ but that
// now returns 404.
const CARGOSON_API_URL = "https://www.cargoson.com/api";

export interface CargosonPriceRow {
  quantity: number | string;
  package_type: string;
  weight: number | string;
  description?: string;
}

export interface CargosonPriceRequest {
  collection_date: string;
  collection_postcode: string;
  collection_country: string;
  delivery_postcode: string;
  delivery_country: string;
  rows_attributes: CargosonPriceRow[];
  adr?: boolean;
  frigo?: boolean;
  delivery_to_private_person?: boolean;
}

export interface CargosonSurcharge {
  identifier: string;
  name: string;
  amount: string;
}

export interface CargosonPrice {
  carrier: string;
  service: string;
  service_id?: number;
  price: string;
  currency?: string;
  unit?: string;
  type?: string;
  surcharges?: CargosonSurcharge[];
}

export interface CargosonPriceResponse {
  status: number;
  object?: {
    prices: CargosonPrice[];
  };
  error?: string;
}

export async function getFreightPrices(
  params: CargosonPriceRequest,
): Promise<CargosonPriceResponse> {
  const apiKey = process.env.CARGOSON_API_KEY;
  if (!apiKey) {
    throw new Error("CARGOSON_API_KEY not configured");
  }

  const requestBody = {
    collection_date: params.collection_date,
    collection_country: params.collection_country,
    collection_postcode: params.collection_postcode,
    delivery_country: params.delivery_country,
    delivery_postcode: params.delivery_postcode,
    adr: params.adr ?? false,
    frigo: params.frigo ?? false,
    delivery_to_private_person: params.delivery_to_private_person ?? false,
    rows_attributes: params.rows_attributes,
  };

  const response = await fetch(`${CARGOSON_API_URL}/freightPrices/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api.v1",
    },
    body: JSON.stringify(requestBody),
  });

  // 204 No Content means no prices available for this route
  if (response.status === 204) {
    return { status: 204, object: { prices: [] } };
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cargoson API error: ${response.status} - ${errorText}`);
  }

  const text = await response.text();
  if (!text) {
    return { status: 200, object: { prices: [] } };
  }

  return JSON.parse(text);
}

// Format date as DD.MM.YYYY (Cargoson's Polish format). Defaults to tomorrow
// since same-day pickups are typically unavailable.
export function formatCollectionDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}
