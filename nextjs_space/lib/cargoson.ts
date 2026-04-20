// Cargoson API client.
//
// Note on request shape:
//   Cargoson returns DIFFERENT price sets for different payloads. This object
//   form with `package_type: "CTN"` and full dimensions is the one known to
//   work on this account — it gives the real carrier set (DHL, UPS, FedEx,
//   DPD, Schenker, Raben) with realistic surcharges. Don't swap it to an
//   array / EUR-pallet shape without re-verifying against a live account,
//   because Cargoson will happily return 204 No Content or a short list.

const CARGOSON_API_URL = "https://www.cargoson.com/api";

export interface CargosonPriceRow {
  quantity: string;
  package_type: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  cbm?: string;
  ldm?: string;
  description?: string;
}

export interface CargosonPriceRequest {
  collection_date: string;
  collection_postcode: string;
  collection_country: string;
  delivery_postcode: string;
  delivery_country: string;
  rows_attributes: { [key: string]: CargosonPriceRow };
  // Experimental toggles — set to false to try to widen the carrier set.
  calculateClick?: boolean;             // default true
  requestExternalPartners?: boolean;    // default true
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
    adr: false,
    frigo: false,
    delivery_to_private_person: false,
    request_external_partners: params.requestExternalPartners ?? true,
    calculate_click: params.calculateClick ?? true,
    rows_attributes: params.rows_attributes,
    options: { measurement_units: "metric" },
  };

  // Cap each Cargoson call at 25 s so one slow route can't block the whole
  // batch (/api/check-prices runs 27+ calls in sequence).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let response: Response;
  try {
    response = await fetch(`${CARGOSON_API_URL}/freightPrices/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === "AbortError") {
      throw new Error("Cargoson API timeout (25s)");
    }
    throw e;
  }
  clearTimeout(timeout);

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

// Compute CBM from dimensions (cm³ → m³)
export function calculateCBM(length: number, width: number, height: number): string {
  return ((length * width * height) / 1_000_000).toFixed(6);
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
