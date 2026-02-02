
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Debugging Products ---');

    // 1. Find the user
    const email = 'hugo@promp.com.br';
    const user = await prisma.user.findUnique({
        where: { email },
        include: { company: true }
    });

    if (!user) {
        console.log('User not found!');
        return;
    }

    console.log(`User found: ${user.email}, Company: ${user.company.name} (${user.companyId})`);

    // 2. Find the config
    const config = await prisma.agentConfig.findUnique({
        where: { companyId: user.companyId }
    });

    if (!config) {
        console.log('No AgentConfig found for this company.');
        return;
    }

    console.log('AgentConfig found.');
    console.log('Products raw (JSON string):', config.products);

    if (config.products) {
        try {
            const products = JSON.parse(config.products);
            console.log(`Parsed ${products.length} products:`);
            products.forEach(p => console.log(` - [${p.id}] ${p.name} (${p.price})`));
        } catch (e) {
            console.log('Error parsing products JSON:', e.message);
        }
    } else {
        console.log('Products field is null or empty.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
