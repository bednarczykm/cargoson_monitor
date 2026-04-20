import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
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

async function main() {
  // Pobierz ustawienia z bazy
  const settings = await prisma.settings.findFirst();
  console.log('Settings:', settings);
  
  // Pobierz jednego odbiorce
  const recipient = await prisma.recipient.findFirst();
  console.log('Sample recipient:', recipient);
  
  if (!settings || !recipient) {
    console.log('No settings or recipient found');
    return;
  }
  
  console.log('\n=== Test API z rzeczywistymi danymi ===\n');
  console.log(`Collection: ${settings.collectionPostcode}, ${settings.collectionCountry}`);
  console.log(`Delivery: ${recipient.postalCode}, ${recipient.country}`);
  
  const result = await getFreightPrices({
    collection_date: formatCollectionDate(),
    collection_postcode: settings.collectionPostcode,
    collection_country: settings.collectionCountry,
    delivery_postcode: recipient.postalCode,
    delivery_country: recipient.country,
    rows_attributes: [{
      quantity: 1,
      package_type: 'EUR',
      weight: 2,
      length: 10,
      width: 10,
      height: 10,
    }],
  });
  
  console.log('\nFull API response:', JSON.stringify(result, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);
