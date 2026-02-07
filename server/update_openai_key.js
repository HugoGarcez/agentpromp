import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateKey() {
    const newKey = process.argv[2];

    if (!newKey) {
        console.error('Usage: node update_openai_key.js "sk-..." OR "CLEAR"');
        process.exit(1);
    }

    if (newKey === 'CLEAR') {
        console.log('CLEARING OpenAI Key from ALL companies... (Will fallback to Global ENV)');
    } else if (!newKey.startsWith('sk-')) {
        console.error('Invalid Key format. Must start with sk-');
        process.exit(1);
    } else {
        console.log(`Updating OpenAI Key to: ${newKey.substring(0, 10)}... in ALL companies...`);
    }

    try {
        const configs = await prisma.agentConfig.findMany();

        for (const config of configs) {
            let integrations = {};
            try {
                if (config.integrations) {
                    integrations = typeof config.integrations === 'string'
                        ? JSON.parse(config.integrations)
                        : config.integrations;
                }
            } catch (e) {
                console.log(`Error parsing config for ${config.companyId}, resetting integrations.`);
            }

            // Update Key
            if (newKey === 'CLEAR') {
                delete integrations.openaiKey;
                console.log(`🗑️  Cleared key for ${config.companyId}`);
            } else {
                integrations.openaiKey = newKey.trim();
                console.log(`✅ Updated company ${config.companyId}`);
            }

            await prisma.agentConfig.update({
                where: { id: config.id },
                data: {
                    integrations: JSON.stringify(integrations)
                }
            });
        }

        console.log('Done! Now run: pm2 restart all');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

updateKey();
