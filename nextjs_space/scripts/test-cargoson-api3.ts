import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CARGOSON_API_URL = "https://www.cargoson.com/api";

async function getFreightPrices(params: any) {
  const apiKey = process.env.CARGOSON_API_KEY;
  console.log('API Key (first 10 chars):', apiKey?.substring(0, 10) + '...');

  const response = await fetch(`${CARGOSON_API_URL}/freightPrices/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
    body: JSON.stringify(params),
  });

  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  if (response.status === 204) {
    return { status: 204, object: { prices: [] } };
  }

  const text = await response.text();
  console.log('Response text:', text);
  
  if (!response.ok) {
    throw new Error(`Cargoson API error: ${response.status} - ${text}`);
  }

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

async function main() {
  // Pobierz wszystkich odbiorców
  const recipients = await prisma.recipient.findMany();
  console.log('All recipients:', recipients.length);
  
  // Sprawdźmy różne kombinacje
  const testCases = [
    { from: '43-300', to: '10115', toCountry: 'DE', name: 'PL->DE' },
    { from: '43-300', to: '75013', toCountry: 'FR', name: 'PL->FR' },
    { from: '43-300', to: '00-001', toCountry: 'PL', name: 'PL->PL' },
  ];
  
  for (const test of testCases) {
    console.log(`\n\n=== ${test.name} ===`);
    
    const params = {
      collection_date: formatCollectionDate(),
      collection_postcode: test.from,
      collection_country: 'PL',
      delivery_postcode: test.to,
      delivery_country: test.toCountry,
      rows_attributes: [{
        quantity: 1,
        package_type: 'EUR',
        weight: 2,
        length: 10,
        width: 10,
        height: 10,
      }],
    };
    
    console.log('Request:', JSON.stringify(params, null, 2));
    
    try {
      const result = await getFreightPrices(params);
      console.log('Prices:', result.object?.prices?.length || 0);
      if (result.object?.prices?.length > 0) {
        for (const p of result.object.prices) {
          console.log(`  ${p.carrier} | ${p.service} | ${p.price} ${p.unit}`);
        }
      }
    } catch (e) {
      console.error('Error:', e);
    }
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
