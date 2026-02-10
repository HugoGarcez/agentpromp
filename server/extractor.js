import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { TextDecoder } from 'util';

dotenv.config();

// Helper: Detect encoding from buffer and headers
const decodeBuffer = (buffer, contentType) => {
    let encoding = 'utf-8';

    // 1. Check Content-Type header
    if (contentType) {
        const match = contentType.match(/charset=([\w-]+)/i);
        if (match) encoding = match[1];
    }

    // 2. Check HTML meta tags (if header didn't specify or we want to be sure)
    // We decode a bit as ASCII/UTF-8 just to find the meta tag
    const preview = new TextDecoder('utf-8').decode(buffer.slice(0, 1000));
    const metaMatch = preview.match(/<meta.*?charset=["']?([\w-]+)["']?/i);
    if (metaMatch) encoding = metaMatch[1];

    try {
        const decoder = new TextDecoder(encoding);
        return decoder.decode(buffer);
    } catch (e) {
        console.warn(`[Extractor] Failed to decode as ${encoding}, falling back to utf-8.`);
        return new TextDecoder('utf-8').decode(buffer);
    }
};

// Helper: Clean HTML to reduce token usage
const cleanHtml = (html) => {
    const $ = cheerio.load(html);

    // Extract JSON-LD BEFORE cleaning
    let jsonLdData = [];
    $('script[type="application/ld+json"]').each((i, el) => {
        try {
            const data = JSON.parse($(el).html());
            jsonLdData.push(JSON.stringify(data));
        } catch (e) { }
    });

    // --- PRESERVE IMAGES AS MARKERS ---
    $('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src && !src.startsWith('data:') && !src.includes('svg') && !src.includes('icon') && !src.includes('logo')) {
            // Replace with a marker that the AI can see
            $(el).replaceWith(`\n[IMAGE: ${src}]\n`);
        } else {
            $(el).remove();
        }
    });

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

    // Improve text structure: Replace block tags with newlines
    $('br').replaceWith('\n');
    $('div, p, li, h1, h2, h3, h4, h5, h6, tr').after('\n');

    let content = $('body').text();
    // Normalize whitespace but keep newlines
    content = content.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();

    // Append JSON-LD data to the content for the AI
    if (jsonLdData.length > 0) {
        content += "\n\n--- STRUCTURAL DATA (JSON-LD) ---\n" + jsonLdData.join("\n");
    }

    return content; // Return FULL content
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

        let response;
        try {
            response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                responseType: 'arraybuffer', // Get raw buffer for manual decoding
                timeout: 30000 // 30s timeout
            });
        } catch (axiosError) {
            console.error(`[Extractor] Axios Failed: ${axiosError.message}`);
            if (axiosError.response) console.error(`[Extractor] Status: ${axiosError.response.status}`);
            throw new Error(`Falha ao acessar o site: ${axiosError.message}`);
        }

        // DECODE CONTENT
        const html = decodeBuffer(response.data, response.headers['content-type']);

        if (!html) throw new Error("O site retornou um conteúdo vazio.");

        // --- IMAGE EXTRACTION (Global Candidates) ---
        const $ = cheerio.load(html);
        const images = [];

        // 1. Open Graph Image (Best Candidate)
        const ogImage = $('meta[property="og:image"]').attr('content');
        if (ogImage) images.push(ogImage);

        // 2. Schema.org Image
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const data = JSON.parse($(el).html());
                if (data.image) {
                    if (Array.isArray(data.image)) images.push(...data.image);
                    else if (typeof data.image === 'string') images.push(data.image);
                }
            } catch (e) { }
        });

        // De-duplicate Global Candidates
        // We do NOT limit this list artificially anymore, let the AI decide or use the first few if too many.
        // But passing 100 URLs to LLM is expensive. We'll stick to a reasonable number but prioritize better ones.
        const uniqueImages = [...new Set(images)].slice(0, 30); // Increased to 30

        // CHUNKING STRATEGY FOR LARGE PAGES
        // The page might be huge (e.g. 300k chars). We can't send it all.
        // We split into chunks of 25,000 chars with 1,000 char overlap.

        const CHUNK_SIZE = 25000; // Increased chunk size
        const OVERLAP = 1000;
        const cleanedText = cleanHtml(html);

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
                
                CRITICAL: Look for "STRUCTURAL DATA (JSON-LD)" at the end. PREFER this data.
                
                IMAGES:
                1. The text contains "[IMAGE: url]" markers. These are images found near the text. Use these if they seem to belong to the product.
                2. If no marker is found near the product, pick from this backup list: ${JSON.stringify(uniqueImages)}
                
                Return a JSON object with a key "products" (array of objects).
                Each product object MUST have:
                - name (string)
                - price (number, numeric only)
                - description (string)
                - image (string URL)
                - variantItems (array: name, price, color, size)
                
                rules:
                1. Extract ALL products visible.
                2. Do not invent products.
                3. If a product is cut off, ignore it.
                
                Text Content (Chunk ${chunkIndex + 1}/${chunks.length}):
                "${chunk}"
                `;

                try {
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "You are a helpful assistant that extracts structured product data from e-commerce text." },
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
