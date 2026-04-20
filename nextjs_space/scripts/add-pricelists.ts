import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapowanie krajów UE na kody
const EU_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PL", "PT", "RO", "SE", "SI", "SK"
];

// DHL Parcel ceny - kategoria do 5kg (w PLN)
const DHL_PARCEL_PRICES: Record<string, number> = {
  AT: 29.00, // Austria
  BE: 29.00, // Belgia
  BG: 35.00, // Bułgaria
  HR: 35.00, // Chorwacja
  CY: 35.00, // Cypr
  CZ: 18.00, // Czechy
  DK: 35.00, // Dania
  EE: 29.00, // Estonia
  FI: 35.00, // Finlandia
  FR: 31.00, // Francja
  GR: 35.00, // Grecja
  ES: 35.00, // Hiszpania
  NL: 22.00, // Holandia
  IE: 35.00, // Irlandia
  LT: 22.00, // Litwa
  LU: 29.00, // Luksemburg
  LV: 21.00, // Łotwa
  MT: 118.00, // Malta (do 5kg z cennika)
  DE: 22.00, // Niemcy
  PL: 15.00, // Polska (szacunek)
  PT: 35.00, // Portugalia
  RO: 35.00, // Rumunia
  SK: 19.00, // Słowacja
  SI: 29.00, // Słowenia
  SE: 35.00, // Szwecja
  HU: 25.00, // Węgry
  IT: 35.00, // Włochy
};

// DPD Classic ceny - kategoria do 3kg (w EUR, przeliczę na PLN ~4.3)
const EUR_TO_PLN = 4.3;
const DPD_PRICES_EUR: Record<string, number> = {
  AT: 8.00,
  BE: 7.00,
  BG: 14.00,
  HR: 16.00,
  CY: 33.00, // szacunek dla wysp
  CZ: 7.00,
  DK: 8.00,
  EE: 10.00,
  FI: 10.00,
  FR: 7.50,
  GR: 20.00,
  ES: 14.00,
  NL: 8.00,
  IE: 12.00,
  LT: 7.00,
  LU: 8.00,
  LV: 8.00,
  MT: 25.00, // szacunek
  DE: 5.00,
  PL: 5.00, // krajowy
  PT: 15.00,
  RO: 16.00,
  SK: 8.00,
  SI: 10.00,
  SE: 10.00,
  HU: 7.00,
  IT: 13.00,
};

// FedEx Regional Economy - strefy dla krajów UE
const FEDEX_RE_ZONES: Record<string, string> = {
  AT: "S", BE: "S", BG: "T", HR: "T", CY: "U", CZ: "R",
  DK: "S", EE: "T", FI: "T", FR: "S", GR: "T", ES: "T",
  NL: "S", IE: "T", LT: "R", LU: "S", LV: "T", MT: "V",
  DE: "R", PL: "R", PT: "T", RO: "T", SK: "R", SI: "T",
  SE: "T", HU: "S", IT: "S",
};

// FedEx Regional Economy ceny dla 2kg (w PLN)
const FEDEX_RE_PRICES: Record<string, number> = {
  R: 20.57,
  S: 20.90,
  T: 23.61,
  U: 49.52,
  V: 70.00, // szacunek dla Malty
  W: 27.27,
};

// FedEx International Priority - strefy dla krajów UE
const FEDEX_IP_ZONES: Record<string, string> = {
  AT: "S", BE: "S", BG: "T", HR: "T", CY: "V", CZ: "R",
  DK: "S", EE: "T", FI: "T", FR: "S", GR: "T", ES: "T",
  NL: "S", IE: "T", LT: "R", LU: "S", LV: "T", MT: "V",
  DE: "R", PL: "R", PT: "T", RO: "T", SK: "R", SI: "T",
  SE: "T", HU: "S", IT: "S",
};

// FedEx International Priority ceny dla 2kg (w PLN) - z cennika
const FEDEX_IP_PRICES: Record<string, number> = {
  R: 44.00, // szacunek na podstawie proporcji
  S: 45.00,
  T: 52.00,
  U: 85.00,
  V: 120.00,
  W: 60.00,
};

async function main() {
  console.log("Dodawanie cenników...");

  const priceItems = [];

  for (const country of EU_COUNTRIES) {
    if (country === "PL") continue; // Pomijamy Polskę jako kraj nadawczy

    // DHL Parcel
    if (DHL_PARCEL_PRICES[country]) {
      priceItems.push({
        length: 10,
        width: 10,
        height: 10,
        weight: 2,
        carrier: "DHL Parcel",
        serviceMethod: "DHL Parcel Connect",
        destinationCountry: country,
        basePrice: DHL_PARCEL_PRICES[country],
      });
    }

    // DPD Classic
    if (DPD_PRICES_EUR[country]) {
      priceItems.push({
        length: 10,
        width: 10,
        height: 10,
        weight: 2,
        carrier: "DPD",
        serviceMethod: "DPD Classic",
        destinationCountry: country,
        basePrice: Math.round(DPD_PRICES_EUR[country] * EUR_TO_PLN * 100) / 100,
      });
    }

    // FedEx Regional Economy
    const fedexREZone = FEDEX_RE_ZONES[country];
    if (fedexREZone && FEDEX_RE_PRICES[fedexREZone]) {
      priceItems.push({
        length: 10,
        width: 10,
        height: 10,
        weight: 2,
        carrier: "FedEx",
        serviceMethod: "FedEx Regional Economy",
        destinationCountry: country,
        basePrice: FEDEX_RE_PRICES[fedexREZone],
      });
    }

    // FedEx International Priority
    const fedexIPZone = FEDEX_IP_ZONES[country];
    if (fedexIPZone && FEDEX_IP_PRICES[fedexIPZone]) {
      priceItems.push({
        length: 10,
        width: 10,
        height: 10,
        weight: 2,
        carrier: "FedEx",
        serviceMethod: "FedEx International Priority",
        destinationCountry: country,
        basePrice: FEDEX_IP_PRICES[fedexIPZone],
      });
    }
  }

  console.log(`Przygotowano ${priceItems.length} pozycji cennika`);

  // Wgraj do bazy
  let added = 0;
  let updated = 0;
  let errors = 0;

  for (const item of priceItems) {
    try {
      await prisma.priceListItem.upsert({
        where: {
          length_width_height_weight_carrier_serviceMethod_destinationCountry: {
            length: item.length,
            width: item.width,
            height: item.height,
            weight: item.weight,
            carrier: item.carrier,
            serviceMethod: item.serviceMethod,
            destinationCountry: item.destinationCountry,
          },
        },
        create: item,
        update: { basePrice: item.basePrice },
      });
      added++;
    } catch (error) {
      console.error(`Błąd dla ${item.carrier} ${item.serviceMethod} -> ${item.destinationCountry}:`, error);
      errors++;
    }
  }

  console.log(`\nDodano/zaktualizowano: ${added}`);
  console.log(`Błędy: ${errors}`);

  // Pokaż podsumowanie
  const count = await prisma.priceListItem.count();
  console.log(`\nŁącznie pozycji w cenniku: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
