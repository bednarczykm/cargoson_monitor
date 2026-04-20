import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CARGOSON_API_URL = "https://www.cargoson.com/api";

async function getApiPrices(country: string, postcode: string) {
  const response = await fetch(`${CARGOSON_API_URL}/freightPrices/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${process.env.CARGOSON_API_KEY}`,
    },
    body: JSON.stringify({
      collection_date: '25.02.2026',
      collection_country: 'PL',
      collection_postcode: '43-300',
      delivery_country: country,
      delivery_postcode: postcode,
      rows_attributes: { "0": { quantity: "1", package_type: "CTN", weight: "2", length: "10", width: "10", height: "10" } },
      options: { measurement_units: "metric" }
    }),
  });
  
  if (response.status === 204) return [];
  const data = await response.json();
  return data.object?.prices || [];
}

async function main() {
  // Pobierz wszystkich odbiorców z unikalnymi krajami i kodami
  const recipients = await prisma.recipient.findMany({
    distinct: ['country'],
    select: { country: true, postalCode: true },
  });
  
  console.log('=== Analiza pokrycia cennika dla każdego kraju ===\n');
  
  for (const r of recipients.slice(0, 10)) { // Sprawdź pierwsze 10
    console.log(`\n--- ${r.country} (${r.postalCode}) ---`);
    
    const apiPrices = await getApiPrices(r.country, r.postalCode);
    console.log(`API zwraca ${apiPrices.length} ofert`);
    
    // Dla każdej oferty z API sprawdź czy jest w cenniku
    for (const price of apiPrices) {
      const match = await prisma.priceListItem.findFirst({
        where: {
          carrier: price.carrier,
          serviceMethod: price.service,
          destinationCountry: r.country,
          length: 10,
          width: 10,
          height: 10,
          weight: 2,
        }
      });
      
      if (match) {
        console.log(`  ✓ ${price.carrier.substring(0, 20)}... | ${price.service} -> ${match.basePrice} PLN`);
      } else {
        console.log(`  ✗ ${price.carrier.substring(0, 20)}... | ${price.service} -> BRAK W CENNIKU`);
      }
    }
    
    // Pauza między requestami
    await new Promise(r => setTimeout(r, 100));
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
