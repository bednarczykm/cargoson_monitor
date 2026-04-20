import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Sprawdź przykładowe ceny z API dla DE
  console.log('=== Sprawdzam przykładowe ceny z API dla DE ===\n');
  
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
  
  let matchCount = 0;
  let noMatchCount = 0;
  
  for (const price of data.object?.prices || []) {
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
      matchCount++;
      console.log(`✓ MATCH: "${price.carrier}" | "${price.service}" -> ${match.basePrice} PLN`);
    } else {
      noMatchCount++;
      console.log(`✗ BRAK: "${price.carrier}" | "${price.service}"`);
    }
  }
  
  console.log(`\n\nPodsumowanie: ${matchCount} match, ${noMatchCount} brak match`);
  
  // Sprawdź jakie kraje są w cenniku
  const countries = await prisma.priceListItem.groupBy({
    by: ['destinationCountry'],
    _count: true,
  });
  
  console.log('\n=== Kraje w cenniku ===');
  for (const c of countries) {
    console.log(`  ${c.destinationCountry}: ${c._count} wpisów`);
  }
  
  // Sprawdź odbiorców
  const recipients = await prisma.recipient.findMany({
    select: { country: true },
    distinct: ['country'],
  });
  
  console.log('\n=== Kraje odbiorców ===');
  for (const r of recipients) {
    const inPricelist = countries.find(c => c.destinationCountry === r.country);
    console.log(`  ${r.country}: ${inPricelist ? `${inPricelist._count} wpisów w cenniku` : 'BRAK W CENNIKU!'}`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
