import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Pobierz ostatnie sprawdzenie
  const lastCheck = await prisma.checkHistory.findFirst({
    orderBy: { checkDate: 'desc' },
  });
  
  if (!lastCheck || !lastCheck.csvData) {
    console.log('Brak historii sprawdzeń');
    return;
  }
  
  const results = JSON.parse(lastCheck.csvData);
  console.log(`Ostatnie sprawdzenie: ${lastCheck.checkDate}`);
  console.log(`Liczba wyników: ${results.length}\n`);
  
  // Znajdź wyniki bez ceny z cennika
  const noPrice = results.filter((r: any) => r.priceListPrice === null);
  console.log(`Wyniki BEZ ceny z cennika: ${noPrice.length}`);
  
  if (noPrice.length > 0) {
    console.log('\n=== Pierwsze 20 wyników bez ceny z cennika ===\n');
    for (const r of noPrice.slice(0, 20)) {
      console.log(`${r.country} | ${r.carrier} | ${r.serviceMethod} | API: ${r.apiPricePLN} PLN`);
    }
    
    // Sprawdź czy te kombinacje są w cenniku
    console.log('\n=== Sprawdzam czy te kombinacje istnieją w cenniku ===\n');
    for (const r of noPrice.slice(0, 5)) {
      const exists = await prisma.priceListItem.findFirst({
        where: {
          destinationCountry: r.country,
          carrier: { contains: r.carrier.split(' ')[0] },
          serviceMethod: r.serviceMethod,
        }
      });
      
      if (exists) {
        console.log(`✓ Znaleziono dla ${r.country}/${r.carrier}/${r.serviceMethod}:`);
        console.log(`  carrier: "${exists.carrier}", service: "${exists.serviceMethod}"`);
      } else {
        console.log(`✗ BRAK dla ${r.country}/${r.carrier}/${r.serviceMethod}`);
        
        // Sprawdź czy carrier w ogóle jest
        const anyCarrier = await prisma.priceListItem.findFirst({
          where: {
            destinationCountry: r.country,
            carrier: { contains: r.carrier.split(' ')[0] },
          }
        });
        if (anyCarrier) {
          console.log(`  Ale jest carrier dla tego kraju: "${anyCarrier.carrier}" z "${anyCarrier.serviceMethod}"`);
        }
      }
    }
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
