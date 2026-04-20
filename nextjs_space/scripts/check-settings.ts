import { config } from 'dotenv';
config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.settings.findFirst();
  console.log('=== Ustawienia ===');
  console.log(JSON.stringify(settings, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
