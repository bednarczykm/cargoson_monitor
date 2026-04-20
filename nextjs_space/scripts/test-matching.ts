import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';
import { carrierNamesMatch, normalizeCarrierName } from '../lib/carriers';

const prisma = new PrismaClient();

async function main() {
  // Test normalizacji
  const apiCarriers = [
    "DPD Polska Sp. z o.o.",
    "DHL Express sp.z.o.o",
    "UPS Polska Sp. z o.o",
    "FedEx Express Poland sp. z o.o.",
  ];
  
  console.log('=== Test normalizacji nazw przewoźników ===\n');
  for (const c of apiCarriers) {
    console.log(`"${c}" -> "${normalizeCarrierName(c)}"`);
  }
  
  // Pobierz unikalne nazwy z cennika
  const pricelistCarriers = await prisma.priceListItem.groupBy({
    by: ['carrier'],
    _count: true,
  });
  
  console.log('\n=== Nazwy przewoźników w cenniku ===');
  for (const p of pricelistCarriers) {
    console.log(`"${p.carrier}" (${p._count}x) -> normalized: "${normalizeCarrierName(p.carrier)}"`);
  }
  
  // Test matchowania
  console.log('\n=== Test matchowania ===');
  for (const apiC of apiCarriers) {
    const normalizedApi = normalizeCarrierName(apiC);
    for (const priceC of pricelistCarriers) {
      const match = carrierNamesMatch(priceC.carrier, normalizedApi);
      if (match) {
        console.log(`✓ "${apiC}" <-> "${priceC.carrier}"`);
      }
    }
  }
  
  // Sprawdź konkretny przypadek
  console.log('\n=== Szczegółowy test dla IT ===');
  const itPrices = await prisma.priceListItem.findMany({
    where: { destinationCountry: 'IT' },
  });
  console.log('Wpisy w cenniku dla IT:', itPrices.length);
  for (const p of itPrices) {
    console.log(`  ${p.carrier} | ${p.serviceMethod} | ${p.basePrice} PLN`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
