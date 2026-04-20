import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Pobierz unikalne kombinacje carrier + serviceMethod z cennika
  const pricelistItems = await prisma.priceListItem.findMany({
    select: {
      carrier: true,
      serviceMethod: true,
      destinationCountry: true,
    },
    distinct: ['carrier', 'serviceMethod'],
  });
  
  console.log('=== Unikalne kombinacje Carrier + ServiceMethod w cenniku ===\n');
  const carrierMethods = new Map<string, Set<string>>();
  for (const item of pricelistItems) {
    if (!carrierMethods.has(item.carrier)) {
      carrierMethods.set(item.carrier, new Set());
    }
    carrierMethods.get(item.carrier)!.add(item.serviceMethod);
  }
  
  for (const [carrier, methods] of carrierMethods) {
    console.log(`\n${carrier}:`);
    for (const method of methods) {
      console.log(`  - "${method}"`);
    }
  }
  
  // Pobierz przykładowe ceny z API dla DE
  console.log('\n\n=== Sprawdzam przykładowe ceny z API dla DE ===');
  
  const apiResponse = await fetch('https://www.cargoson.com/api/freightPrices/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${process.env.CARGOSON_API_KEY}`,
    },
    body: JSON.stringify({
      collection_date: '25.02.2026',
      collection_country: 'PL',
      collection_postcode: '43-300',
      delivery_country: 'DE',
      delivery_postcode: '10115',
      rows_attributes: { "0": { quantity: "1", package_type: "CTN", weight: "2", length: "10", width: "10", height: "10" } },
      options: { measurement_units: "metric" }
    }),
  });
  
  const data = await apiResponse.json();
  
  console.log('\nCeny z API:');
  for (const price of data.object?.prices || []) {
    console.log(`  - Carrier: "${price.carrier}" | Service: "${price.service}"`);
    
    // Sprawdź czy jest match w cenniku
    const match = await prisma.priceListItem.findFirst({
      where: {
        carrier: price.carrier,
        serviceMethod: price.service,
        destinationCountry: 'DE',
        length: 10,
        width: 10,
        height: 10,
        weight: 2,
      }
    });
    
    if (match) {
      console.log(`    ✓ MATCH: ${match.basePrice} PLN`);
    } else {
      console.log(`    ✗ BRAK MATCH`);
      
      // Sprawdź czy jest podobny carrier
      const similar = await prisma.priceListItem.findFirst({
        where: {
          carrier: { contains: price.carrier.split(' ')[0] },
          destinationCountry: 'DE',
        }
      });
      if (similar) {
        console.log(`      Podobny carrier w cenniku: "${similar.carrier}" | "${similar.serviceMethod}"`);
      }
    }
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
