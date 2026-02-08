
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const logDetails = [];

    try {
        const configs = await prisma.agentConfig.findMany();
        if (configs.length === 0) {
            console.log("No configs found.");
            return;
        }

        // Check the first config
        const config = configs[0];
        const products = JSON.parse(config.products || '[]');

        logDetails.push(`Found ${products.length} products for Company ${config.companyId}`);

        let checkedCount = 0;
        for (const p of products) {
            if (p.image) {
                logDetails.push(`\n[Product] ID: ${p.id} | Name: ${p.name}`);
                logDetails.push(`  - Image URL: ${p.image}`);

                // Test Access
                try {
                    const res = await axios.head(p.image, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 5000
                    });
                    logDetails.push(`  - Status: ${res.status} (bypassed check)`);
                } catch (e) {
                    logDetails.push(`  - Status: ERROR (${e.message})`);
                    if (e.response) logDetails.push(`    - Code: ${e.response.status}`);
                }

                checkedCount++;
                if (checkedCount >= 10) break; // Check first 10 images
            }
        }

    } catch (e) {
        logDetails.push(`CRITICAL ERROR: ${e.message}`);
    } finally {
        await prisma.$disconnect();
        fs.writeFileSync('debug_output.txt', logDetails.join('\n'));
        console.log("Debug complete. Check debug_output.txt");
    }
}

main();
