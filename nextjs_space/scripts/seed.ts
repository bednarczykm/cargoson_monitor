import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Tworzenie konta testowego
  const hashedPassword = await bcrypt.hash("johndoe123", 10);
  await prisma.user.upsert({
    where: { email: "john@doe.com" },
    update: {},
    create: {
      email: "john@doe.com",
      name: "John Doe",
      password: hashedPassword,
    },
  });

  // Domyslne ustawienia
  const existingSettings = await prisma.settings.findFirst();
  if (!existingSettings) {
    await prisma.settings.create({
      data: {
        tolerancePercent: 0,
        checkIntervalMinutes: 60,
        pauseStart: "23:00",
        pauseEnd: "05:00",
        alertEmail: "marcinbednarczyk9@gmail.com",
        slackWebhook: "alerty-aaaarvngzarvl2wcifn23htopi@eurofrance-workspace.slack.com",
        monitoringEnabled: false,
        collectionPostcode: "10115",
        collectionCountry: "DE",
      },
    });
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
