import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const euCapitals = [
  { name: "Odbiorca Warszawa", street: "ul. Marszałkowska 100", city: "Warszawa", postalCode: "00-001", country: "PL" },
  { name: "Odbiorca Berlin", street: "Unter den Linden 77", city: "Berlin", postalCode: "10117", country: "DE" },
  { name: "Odbiorca Paryż", street: "Avenue des Champs-Élysées 101", city: "Paris", postalCode: "75008", country: "FR" },
  { name: "Odbiorca Madryt", street: "Gran Vía 32", city: "Madrid", postalCode: "28013", country: "ES" },
  { name: "Odbiorca Rzym", street: "Via del Corso 303", city: "Roma", postalCode: "00186", country: "IT" },
  { name: "Odbiorca Wiedeń", street: "Kärntner Straße 25", city: "Wien", postalCode: "1010", country: "AT" },
  { name: "Odbiorca Praga", street: "Václavské náměstí 56", city: "Praha", postalCode: "11000", country: "CZ" },
  { name: "Odbiorca Amsterdam", street: "Dam 1", city: "Amsterdam", postalCode: "1012JS", country: "NL" },
  { name: "Odbiorca Bruksela", street: "Grand Place 15", city: "Bruxelles", postalCode: "1000", country: "BE" },
  { name: "Odbiorca Lizbona", street: "Praça do Comércio 10", city: "Lisboa", postalCode: "1100-148", country: "PT" },
  { name: "Odbiorca Ateny", street: "Ermou 50", city: "Athina", postalCode: "10563", country: "GR" },
  { name: "Odbiorca Sztokholm", street: "Drottninggatan 33", city: "Stockholm", postalCode: "11151", country: "SE" },
  { name: "Odbiorca Kopenhaga", street: "Strøget 20", city: "København", postalCode: "1159", country: "DK" },
  { name: "Odbiorca Helsinki", street: "Aleksanterinkatu 52", city: "Helsinki", postalCode: "00100", country: "FI" },
  { name: "Odbiorca Dublin", street: "O'Connell Street 35", city: "Dublin", postalCode: "D01V9W3", country: "IE" },
  { name: "Odbiorca Budapeszt", street: "Andrássy út 60", city: "Budapest", postalCode: "1062", country: "HU" },
  { name: "Odbiorca Bukareszt", street: "Calea Victoriei 174", city: "București", postalCode: "010097", country: "RO" },
  { name: "Odbiorca Sofia", street: "Vitosha Boulevard 80", city: "Sofia", postalCode: "1463", country: "BG" },
  { name: "Odbiorca Zagrzeb", street: "Ilica 5", city: "Zagreb", postalCode: "10000", country: "HR" },
  { name: "Odbiorca Bratysława", street: "Obchodná 64", city: "Bratislava", postalCode: "81106", country: "SK" },
  { name: "Odbiorca Lublana", street: "Čopova ulica 14", city: "Ljubljana", postalCode: "1000", country: "SI" },
  { name: "Odbiorca Ryga", street: "Brīvības iela 84", city: "Rīga", postalCode: "LV-1001", country: "LV" },
  { name: "Odbiorca Wilno", street: "Gedimino pr. 9", city: "Vilnius", postalCode: "01103", country: "LT" },
  { name: "Odbiorca Tallinn", street: "Viru 4", city: "Tallinn", postalCode: "10140", country: "EE" },
  { name: "Odbiorca Nikozja", street: "Makarios Avenue 56", city: "Nicosia", postalCode: "1071", country: "CY" },
  { name: "Odbiorca Valletta", street: "Republic Street 45", city: "Valletta", postalCode: "VLT1117", country: "MT" },
  { name: "Odbiorca Luksemburg", street: "Rue Philippe II 30", city: "Luxembourg", postalCode: "2340", country: "LU" },
];

async function main() {
  console.log("Adding EU capitals as recipients...");
  
  for (const capital of euCapitals) {
    try {
      await prisma.recipient.create({ data: capital });
      console.log(`Added: ${capital.name}`);
    } catch (e) {
      console.log(`Skipping ${capital.name} (may already exist)`);
    }
  }
  
  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
