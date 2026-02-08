import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Helper: Clean HTML to reduce token usage
const cleanHtml = (html) => {
    const $ = cheerio.load(html);
    // ... (logic remains same)
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('header').remove();
    $('footer').remove();
    $('nav').remove();
    // Remove comments
    $.root().find('*').contents().each(function () {
        if (this.type === 'comment') $(this).remove();
    });

    let content = $('body').text().replace(/\s+/g, ' ').trim();

    // Append JSON-LD data to the content for the AI
    if (jsonLdData.length > 0) {
        content += "\n\n--- STRUCTURAL DATA (JSON-LD) ---\n" + jsonLdData.join("\n");
    }

    return content; // Return FULL content (Checker handles chunking)
};

/**
 * Extracts product data from a given URL using OpenAI.
 * @param {string} url 
 * @returns {Promise<Array>} List of extracted products
 */
export async function extractFromUrl(url) {
    // Initialize OpenAI Lazily to ensure ENV is loaded
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    try {
        console.log(`[Extractor] Fetching ${url}...`);

        // Use Axios instead of fetch (node-fetch not installed)
        let response;
        try {
            response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                // Ensure we get text/string
                responseType: 'text',
                timeout: 30000 // 30s timeout
            });
        } catch (axiosError) {
            console.error(`[Extractor] Axios Failed: ${axiosError.message}`);
            if (axiosError.response) console.error(`[Extractor] Status: ${axiosError.response.status}`);
            throw new Error(`Falha ao acessar o site: ${axiosError.message}`);
        }

        const html = response.data;
        if (!html) throw new Error("O site retornou um conteúdo vazio.");

        // --- IMAGE EXTRACTION START ---
        const $ = cheerio.load(html);
        const images = [];

        // 1. Open Graph Image (Best Candidate)
        const ogImage = $('meta[property="og:image"]').attr('content');
        if (ogImage) images.push(ogImage);

        // 2. Twitter Image
        const twitterImage = $('meta[name="twitter:image"]').attr('content');
        if (twitterImage) images.push(twitterImage);

        // 3. Schema.org Image
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const data = JSON.parse($(el).html());
                if (data.image) {
                    if (Array.isArray(data.image)) images.push(...data.image);
                    else if (typeof data.image === 'string') images.push(data.image);
                }
            } catch (e) { }
        });

        // 4. Large Images from Body
        $('img').each((i, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
            if (src && !src.startsWith('data:') && !src.includes('svg') && !src.includes('icon') && !src.includes('logo')) {
                // Simple filter to avoid icons
                images.push(src);
            }
        });

        // De-duplicate and Limit
        const uniqueImages = [...new Set(images)].slice(0, 15); // Top 15 unique images
        // --- IMAGE EXTRACTION END ---

        // CHUNKING STRATEGY FOR LARGE PAGES
        // The page might be huge (e.g. 300k chars). We can't send it all.
        // We split into chunks of 20,000 chars with 1,000 char overlap.

        const CHUNK_SIZE = 20000;
        const OVERLAP = 1000;
        const cleanedText = cleanHtml(html); // Now returns FULL text (remove substring limit in cleanHtml first!)

        const chunks = [];
        for (let i = 0; i < cleanedText.length; i += (CHUNK_SIZE - OVERLAP)) {
            chunks.push(cleanedText.substring(i, i + CHUNK_SIZE));
        }

        console.log(`[Extractor] Split content into ${chunks.length} chunks (Total: ${cleanedText.length} chars). Processing...`);

        // Process chunks in BATCHES to avoid 429 Rate Limits
        const BATCH_SIZE = 3;
        let allProducts = [];

        console.log(`[Extractor] Processing ${chunks.length} chunks in batches of ${BATCH_SIZE}...`);

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            console.log(`[Extractor] Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);

            const batchPromises = batch.map(async (chunk, idx) => {
                const chunkIndex = i + idx;
                const prompt = `
                You are an intelligent product extractor. 
                Analyze the text content from an e-commerce page below and extract products.
                
                CRITICAL: Look for "STRUCTURAL DATA (JSON-LD)" at the end of the text. This often contains the most accurate product list (schema.org/Product or ItemList). PREFER data from JSON-LD over raw text if available.
                
                Here is a list of potential image URLs found on the page. Pick the most likely "Product Image" from this list, or find one in the text if better.
                Image Candidates: ${JSON.stringify(uniqueImages)}
                
                Return a JSON object with a key "products" which is an array of objects.
                Each product object MUST have:
                - name (string)
                - price (number, numeric only)
                - description (string, stored as plain text)
                - image (string URL, select best from candidates)
                - variantItems (array of objects with { name: string, price: number, color: string, size: string })
                
                rules:
                1. Extract ALL products visible in this text chunk.
                2. Do not invent products. Only extract what is explicitly there.
                3. If a product is cut off at the start/end, try to reconstruct it or ignore it if too fragmented.
                
                Text Content (Chunk ${chunkIndex + 1}/${chunks.length}):
                "${chunk}"
                `;

                try {
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "You are a helpful assistant that extracts structured product data from raw text involved in e-commerce." },
                            { role: "user", content: prompt }
                        ],
                        response_format: { type: "json_object" }
                    });

                    const result = JSON.parse(completion.choices[0].message.content);
                    return result.products || [];
                } catch (e) {
                    console.error(`[Extractor] Error processing chunk ${chunkIndex + 1}:`, e.message);
                    return [];
                }
            });

            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(products => allProducts.push(...products));

            // Small delay between batches to be nice
            if (i + BATCH_SIZE < chunks.length) await new Promise(r => setTimeout(r, 1000));
        }

        // DEDUPLICATION
        // Identify duplicates by Name (normalized)
        const uniqueProducts = [];
        const seenNames = new Set();

        allProducts.forEach(p => {
            if (!p.name) return;
            const normName = p.name.trim().toLowerCase();
            if (!seenNames.has(normName)) {
                seenNames.add(normName);

                // Fallback Image Logic
                if (!p.image && ogImage) p.image = ogImage;

                uniqueProducts.push(p);
            }
        });

        console.log(`[Extractor] Extracted ${uniqueProducts.length} unique products from ${allProducts.length} raw items.`);

        return uniqueProducts;

    } catch (error) {
        console.error('[Extractor] Error:', error);
        throw error;
    }
}
