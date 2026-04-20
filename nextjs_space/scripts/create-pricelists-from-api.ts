import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CARGOSON_API_URL = "https://www.cargoson.com/api";

// Klucz API z curla
const API_KEY = "2CtBvedaqT5uwtZnVkN8oRZDUHj7Jqne";

// Kraje EU z kodami pocztowymi
const EU_COUNTRIES = [
  { country: 'DE', postcode: '10115' },
  { country: 'FR', postcode: '75001' },
  { country: 'ES', postcode: '28001' },
  { country: 'IT', postcode: '00100' },
  { country: 'NL', postcode: '1011' },
  { country: 'BE', postcode: '1000' },
  { country: 'CZ', postcode: '11000' },
  { country: 'AT', postcode: '1010' },
  { country: 'SK', postcode: '81101' },
  { country: 'HU', postcode: '1011' },
  { country: 'SE', postcode: '11120' },
  { country: 'DK', postcode: '1000' },
  { country: 'FI', postcode: '00100' },
  { country: 'PT', postcode: '1000' },
  { country: 'GR', postcode: '10431' },
  { country: 'RO', postcode: '010011' },
  { country: 'BG', postcode: '1000' },
  { country: 'HR', postcode: '10000' },
  { country: 'SI', postcode: '1000' },
  { country: 'LT', postcode: '01100' },
  { country: 'LV', postcode: '1001' },
  { country: 'EE', postcode: '10111' },
  { country: 'IE', postcode: 'D01' },
  { country: 'LU', postcode: '1111' },
  { country: 'MT', postcode: 'VLT1000' },
  { country: 'CY', postcode: '1000' },
];

function formatDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

async function getFreightPrices(deliveryCountry: string, deliveryPostcode: string) {
  const response = await fetch(`${CARGOSON_API_URL}/freightPrices/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Token ${API_KEY}`,
      "Accept": "application/json",
    },
    body: JSON.stringify({
      collection_date: formatDate(),
      collection_country: "PL",
      collection_postcode: "43-300",
      delivery_country: deliveryCountry,
      delivery_postcode: deliveryPostcode,
      adr: false,
      frigo: false,
      delivery_to_private_person: false,
      request_external_partners: true,
      calculate_click: true,
      rows_attributes: {
        "0": {
          cbm: "0.001",
          description: "Goods",
          height: "10",
          ldm: "0",
          length: "10",
          package_type: "CTN",
          quantity: "1",
          weight: "2",
          width: "10"
        }
      },
      options: { measurement_units: "metric" }
    }),
  });

  if (response.status === 204) {
    return [];
  }

  const text = await response.text();
  if (!text) return [];
  
  const data = JSON.parse(text);
  return data.object?.prices || [];
}

// Kurs EUR -> PLN
const EUR_TO_PLN = 4.3;

async function main() {
  console.log('=== Tworzenie cenników na podstawie API Cargoson ===\n');
  
  // Najpierw usuń stare cenniki
  console.log('Usuwanie starych cenników...');
  await prisma.priceListItem.deleteMany({});
  console.log('Stare cenniki usunięte.\n');
  
  let totalCreated = 0;
  const errors: string[] = [];
  
  for (const dest of EU_COUNTRIES) {
    console.log(`\nPobieram ceny dla ${dest.country}...`);
    
    try {
      const prices = await getFreightPrices(dest.country, dest.postcode);
      
      if (prices.length === 0) {
        console.log(`  Brak cen dla ${dest.country}`);
        continue;
      }
      
      console.log(`  Znaleziono ${prices.length} ofert`);
      
      for (const price of prices) {
        // Przelicz cenę na PLN jeśli jest w EUR
        let priceInPLN = parseFloat(price.price);
        if (price.currency === 'EUR') {
          priceInPLN = priceInPLN * EUR_TO_PLN;
        }
        
        try {
          await prisma.priceListItem.create({
            data: {
              length: 10,
              width: 10,
              height: 10,
              weight: 2,
              carrier: price.carrier,
              serviceMethod: price.service,
              destinationCountry: dest.country,
              basePrice: Math.round(priceInPLN * 100) / 100, // Zaokraglij do 2 miejsc
            }
          });
          totalCreated++;
          console.log(`    + ${price.carrier} | ${price.service} | ${priceInPLN.toFixed(2)} PLN`);
        } catch (e: any) {
          // Duplikat - ignoruj
          if (e.code === 'P2002') {
            console.log(`    ~ Duplikat: ${price.carrier} | ${price.service}`);
          } else {
            errors.push(`${dest.country}: ${price.carrier} - ${e.message}`);
          }
        }
      }
      
      // Pauza między requestami
      await new Promise(r => setTimeout(r, 200));
      
    } catch (e: any) {
      console.error(`  Błąd dla ${dest.country}: ${e.message}`);
      errors.push(`${dest.country}: ${e.message}`);
    }
  }
  
  console.log('\n\n=== PODSUMOWANIE ===');
  console.log(`Utworzono ${totalCreated} wpisów w cenniku`);
  
  if (errors.length > 0) {
    console.log(`\nBłędy (${errors.length}):`);
    errors.forEach(e => console.log(`  - ${e}`));
  }
  
  // Pokaż statystyki
  const stats = await prisma.priceListItem.groupBy({
    by: ['carrier'],
    _count: { carrier: true }
  });
  
  console.log('\nStatystyki per przewoźnik:');
  for (const s of stats) {
    console.log(`  ${s.carrier}: ${s._count.carrier} wpisów`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
