import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const notifications = await prisma.notification.findMany();
  console.log('--- NOTIFICATIONS IN DB ---');
  console.log(JSON.stringify(notifications, null, 2));
  console.log('---------------------------');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
