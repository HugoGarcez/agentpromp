import { extractFromUrl } from './extractor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
    const url = 'https://www.aqnsport.com.br/outletaqn/';
    console.log(`[Verify] Starting full extraction test for ${url}...`);

    try {
        // 1. Read Config for Key
        const configPath = path.join(__dirname, 'config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);

        let apiKey = config.integrations?.openaiKey;
        if (!apiKey && config.globalConfig) apiKey = config.globalConfig.openaiKey;

        if (!apiKey) {
            console.error('[Verify] Could not find OpenAI Key in config.json');
            return;
        }

        console.log(`[Verify] Found API Key: ${apiKey.substring(0, 8)}...`);

        // 2. Run Extraction
        console.log('[Verify] Calling extractFromUrl...');
        const products = await extractFromUrl(url, apiKey);

        console.log(`[Verify] Extraction Complete! Found ${products.length} products.`);

        if (products.length > 0) {
            console.log('[Verify] Sample Product:', JSON.stringify(products[0], null, 2));
            console.log('[Verify] SUCCESS: Products extracted correctly.');
        } else {
            console.error('[Verify] FAILURE: Returned 0 products.');
        }

    } catch (error) {
        console.error('[Verify] Error:', error);
    }
}

run();
