import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- INSPECTING ALL CHANNELS ---');
    const channels = await prisma.prompChannel.findMany({
        include: { agents: { select: { id: true, name: true } } }
    });
    
    console.log(JSON.stringify(channels, null, 2));
    await prisma.$disconnect();
}

main().catch(console.error);
