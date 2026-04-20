import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CARGOSON_API_URL = "https://www.cargoson.com/api";
const EUR_TO_PLN = 4.3;

// Kraje z kodami pocztowymi odbiorców
async function getRecipientCountries() {
  const recipients = await prisma.recipient.findMany({
    select: { country: true, postalCode: true },
    distinct: ['country'],
  });
  return recipients;
}

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
      adr: false,
      frigo: false,
      delivery_to_private_person: false,
      request_external_partners: true,
      calculate_click: true,
      rows_attributes: {
        "0": {
          quantity: "1",
          package_type: "CTN",
          weight: "2",
          length: "10",
          width: "10",
          height: "10",
          cbm: "0.001",
          ldm: "0",
          description: "Goods",
        }
      },
      options: { measurement_units: "metric" }
    }),
  });
  
  if (response.status === 204) return [];
  const data = await response.json();
  return data.object?.prices || [];
}

async function main() {
  console.log('=== Aktualizacja cennika - dodawanie brakujących wpisów ===\n');
  
  const recipients = await getRecipientCountries();
  let added = 0;
  let skipped = 0;
  
  for (const r of recipients) {
    console.log(`\nSprawdzam ${r.country} (${r.postalCode})...`);
    
    const apiPrices = await getApiPrices(r.country, r.postalCode);
    console.log(`  API zwraca ${apiPrices.length} ofert`);
    
    for (const price of apiPrices) {
      // Sprawdź czy już istnieje
      const exists = await prisma.priceListItem.findFirst({
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
      
      if (exists) {
        skipped++;
        continue;
      }
      
      // Przelicz cenę na PLN
      let priceInPLN = parseFloat(price.price);
      if (price.currency === 'EUR') {
        priceInPLN = priceInPLN * EUR_TO_PLN;
      }
      
      // Dodaj nowy wpis
      await prisma.priceListItem.create({
        data: {
          length: 10,
          width: 10,
          height: 10,
          weight: 2,
          carrier: price.carrier,
          serviceMethod: price.service,
          destinationCountry: r.country,
          basePrice: Math.round(priceInPLN * 100) / 100,
        }
      });
      
      added++;
      console.log(`  + Dodano: ${price.carrier} | ${price.service} | ${priceInPLN.toFixed(2)} PLN`);
    }
    
    // Pauza między requestami
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n\n=== PODSUMOWANIE ===`);
  console.log(`Dodano: ${added} wpisów`);
  console.log(`Pominięto (już istniały): ${skipped} wpisów`);
  
  // Nowa statystyka
  const total = await prisma.priceListItem.count();
  console.log(`Łącznie w cenniku: ${total} wpisów`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
