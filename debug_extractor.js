import { extractFromUrl } from './server/extractor.js';
import dotenv from 'dotenv';
dotenv.config();

const url = "https://www.lingeriebratacado.com.br/plg,1,roupas-de-dormir-no-atacado.html";

console.log(`Debug: Starting extraction for ${url}`);

extractFromUrl(url)
    .then(products => {
        console.log(`Success! Found ${products.length} products.`);
        // console.log(JSON.stringify(products, null, 2));
    })
    .catch(err => {
        console.error("FATAL ERROR:", err);
    });
