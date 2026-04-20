const CARGOSON_API_URL = "https://www.cargoson.com/api";

interface CargosonPriceRequest {
  collection_date: string;
  collection_postcode: string;
  collection_country: string;
  delivery_postcode: string;
  delivery_country: string;
  rows_attributes: {
    [key: string]: {
      quantity: string;
      package_type: string;
      weight: string;
      length: string;
      width: string;
      height: string;
      cbm?: string;
      ldm?: string;
      description?: string;
    };
  };
}

interface CargosonSurcharge {
  identifier: string;
  name: string;
  amount: string;
}

interface CargosonPriceResponse {
  status: number;
  object?: {
    prices: {
      carrier: string;
      service: string;
      service_id: number;
      price: string;
      currency: string;
      unit: string;
      type: string;
      surcharges?: CargosonSurcharge[];
    }[];
  };
  error?: string;
}

export async function getFreightPrices(params: CargosonPriceRequest): Promise<CargosonPriceResponse> {
  const apiKey = process.env.CARGOSON_API_KEY;
  if (!apiKey) {
    throw new Error("CARGOSON_API_KEY not configured");
  }

  // Extended request matching Cargoson API format
  const requestBody = {
    collection_date: params.collection_date,
    collection_country: params.collection_country,
    collection_postcode: params.collection_postcode,
    delivery_country: params.delivery_country,
    delivery_postcode: params.delivery_postcode,
    adr: false,
    frigo: false,
    delivery_to_private_person: false,
    request_external_partners: true,
    calculate_click: true,
    rows_attributes: params.rows_attributes,
    options: { measurement_units: "metric" }
  };

  const response = await fetch(`${CARGOSON_API_URL}/freightPrices/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Token ${apiKey}`,
      "Accept": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  // 204 No Content means no prices available for this route
  if (response.status === 204) {
    return {
      status: 204,
      object: { prices: [] },
    };
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

// Format date as DD.MM.YYYY (required by Cargoson API)
export function formatCollectionDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}
