import { config } from 'dotenv';
config();

const CARGOSON_API_URL = "https://www.cargoson.com/api";

async function getFreightPrices(params: any) {
  const apiKey = process.env.CARGOSON_API_KEY;
  if (!apiKey) {
    throw new Error("CARGOSON_API_KEY not configured");
  }

  const response = await fetch(`${CARGOSON_API_URL}/freightPrices/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
    body: JSON.stringify(params),
  });

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

function formatCollectionDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}

const testCountries = [
  { country: 'DE', postcode: '10115', name: 'Niemcy' },
  { country: 'FR', postcode: '75001', name: 'Francja' },
  { country: 'ES', postcode: '28001', name: 'Hiszpania' },
  { country: 'IT', postcode: '00100', name: 'Wlochy' },
  { country: 'NL', postcode: '1011', name: 'Holandia' },
  { country: 'CZ', postcode: '11000', name: 'Czechy' },
  { country: 'AT', postcode: '1010', name: 'Austria' },
  { country: 'SK', postcode: '81101', name: 'Slowacja' },
  { country: 'HU', postcode: '1011', name: 'Wegry' },
  { country: 'SE', postcode: '11120', name: 'Szwecja' },
];

async function main() {
  console.log('=== Test API Cargoson - Sprawdzanie metod wysylki ===\n');
  
  const allServices: Map<string, Set<string>> = new Map();
  
  for (const dest of testCountries) {
    console.log(`\n--- ${dest.name} (${dest.country}) ---`);
    
    try {
      const result = await getFreightPrices({
        collection_date: formatCollectionDate(),
        collection_postcode: '02-672',
        collection_country: 'PL',
        delivery_postcode: dest.postcode,
        delivery_country: dest.country,
        rows_attributes: [{
          quantity: 1,
          package_type: 'EUR',
          weight: 2,
          length: 10,
          width: 10,
          height: 10,
        }],
      });
      
      if (result.object?.prices && result.object.prices.length > 0) {
        console.log(`Znaleziono ${result.object.prices.length} ofert:`);
        
        for (const price of result.object.prices) {
          console.log(`  - Carrier: "${price.carrier}" | Service: "${price.service}" | Price: ${price.price} ${price.unit}`);
          
          if (!allServices.has(price.carrier)) {
            allServices.set(price.carrier, new Set());
          }
          allServices.get(price.carrier)!.add(price.service);
        }
      } else {
        console.log('  Brak ofert');
      }
    } catch (error) {
      console.error(`  Blad: ${error}`);
    }
  }
  
  console.log('\n\n=== PODSUMOWANIE: Wszystkie znalezione kombinacje Carrier + Service ===\n');
  
  for (const [carrier, services] of allServices) {
    console.log(`\n${carrier}:`);
    for (const service of services) {
      console.log(`  - "${service}"`);
    }
  }
}

main().catch(console.error);
