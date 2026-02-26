import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    const configs = await prisma.agentConfig.findMany();

    let targetConfig = null;
    let targetProducts = [];

    for (let c of configs) {
        if (!c.products) continue;
        try {
            const products = JSON.parse(c.products);
            const wbuyProducts = products.filter(p => String(p.id).startsWith('wbuy_') || p.name === 'Produto Wbuy');
            if (wbuyProducts.length > 0) {
                targetConfig = c;
                targetProducts = wbuyProducts;
                break;
            }
        } catch (e) { }
    }

    if (!targetConfig) {
        console.log("No Wbuy products found in any config.");
        return;
    }

    console.log(`Found ${targetProducts.length} Wbuy products in company: ${targetConfig.companyId}`);
    fs.writeFileSync('debug_wbuy_saved_products.json', JSON.stringify(targetProducts, null, 2));

    // Let's also dump the exact integrations JSON string to see if we can find credentials there
    const integrationsStr = targetConfig.integrations || "{}";
    fs.writeFileSync('debug_integration.json', integrationsStr);

}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
