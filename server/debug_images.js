
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const logPath = 'debug_image_log.txt';
    const logDetails = [];

    try {
        console.log("Connecting to DB...");
        const configs = await prisma.agentConfig.findMany();

        if (configs.length === 0) {
            logDetails.push("No configs found.");
        } else {
            const config = configs[0];
            logDetails.push(`Config found for Company: ${config.companyId}`);

            let products = [];
            try {
                products = JSON.parse(config.products || '[]');
            } catch (e) {
                logDetails.push("Error parsing products JSON");
            }

            logDetails.push(`Found ${products.length} products.`);

            let checkedCount = 0;
            for (const p of products) {
                if (p.image) {
                    logDetails.push(`\n[Product] ID: ${p.id} | Name: ${p.name}`);
                    logDetails.push(`  - Image URL: ${p.image}`);

                    // Test Access with GET (since HEAD failed with 405)
                    try {
                        const start = Date.now();
                        const res = await axios.get(p.image, {
                            responseType: 'arraybuffer',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                            },
                            timeout: 15000
                        });
                        const duration = Date.now() - start;
                        logDetails.push(`  - GET Status: ${res.status} (${duration}ms)`);
                        logDetails.push(`  - Size: ${res.data.length} bytes`);

                        // Save first successful image for verification
                        if (checkedCount === 0) {
                            fs.writeFileSync('test_download.jpg', res.data);
                            logDetails.push(`  - Saved test_download.jpg`);
                        }
                    } catch (e) {
                        logDetails.push(`  - Status: ERROR (${e.message})`);
                        if (e.response) {
                            logDetails.push(`    - Code: ${e.response.status}`);
                            logDetails.push(`    - StatusText: ${e.response.statusText}`);
                        }
                    }

                    checkedCount++;
                    if (checkedCount >= 10) break;
                }
            }
        }

    } catch (e) {
        logDetails.push(`CRITICAL ERROR: ${e.message}`);
        console.error(e);
    } finally {
        await prisma.$disconnect();
        fs.writeFileSync(logPath, logDetails.join('\n'));
        console.log(`Log written to ${logPath}`);
    }
}

main();
