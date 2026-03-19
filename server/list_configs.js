import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const configs = await prisma.agentConfig.findMany({
        select: {
            id: true,
            companyId: true,
            integrations: true,
            products: true
        }
    });

    console.log(`Found ${configs.length} configs`);
    for (let c of configs) {
        console.log(`Company: ${c.companyId}`);
        if (c.integrations) {
            try {
                const parsed = JSON.parse(c.integrations);
                if (parsed.wbuy) {
                    console.log(`  Wbuy: Enabled=${parsed.wbuy.enabled}, User=${parsed.wbuy.apiUser}`);
                }
            } catch (e) { }
        }
        if (c.products) {
            try {
                const products = JSON.parse(c.products);
                console.log(`  Products count: ${products.length}`);
                if (products.length > 0) {
                     // Print first product
                     console.log(`  First Product: ${JSON.stringify(products[0], null, 2)}`);
                }
            } catch (e) { }
        }
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
