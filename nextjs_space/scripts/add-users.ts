import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Generate random password
function generatePassword(length: number = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function main() {
  const users = [
    { email: 'szymon@szubryt.eu', name: 'Szymon Szubryt' },
    { email: 'damiang@eurofrance.pl', name: 'Damian G' },
    { email: 'roman@szubryt.eu', name: 'Roman Szubryt' },
  ];

  console.log('\n=== Nowi użytkownicy ===\n');

  for (const user of users) {
    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      console.log(`⚠️  ${user.email} - użytkownik już istnieje, pomijam`);
      continue;
    }

    const password = generatePassword(12);
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email: user.email,
        name: user.name,
        password: hashedPassword,
      },
    });

    console.log(`✅ ${user.email}`);
    console.log(`   Hasło: ${password}`);
    console.log('');
  }

  console.log('=== Gotowe ===\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
