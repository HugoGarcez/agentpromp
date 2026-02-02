import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const configs = await prisma.agentConfig.findMany();
    console.log(`Found ${configs.length} configs.`);

    if (configs.length > 0) {
        const config = configs[0];
        console.log('Company ID:', config.companyId);
        console.log('Integrations (Raw):', config.integrations);

        try {
            const parsed = JSON.parse(config.integrations);
            console.log('Integrations (Parsed):', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.error('Failed to parse integrations:', e);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
