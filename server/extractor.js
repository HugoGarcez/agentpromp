const fetch = require('node-fetch');
const cheerio = require('cheerio');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Helper: Clean HTML to reduce token usage
const cleanHtml = (html) => {
    const $ = cheerio.load(html);
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

    // Get text content but structured
    // We want to keep some structure to help AI identifying product blocks
    // Let's keep div, p, h1-h6, ul, li, span, img
    // But remove attributes except src for img

    // Actually, sending body text usually works well if not too large.
    // Let's try to get 'main' content or body.
    let content = $('body').text().replace(/\s+/g, ' ').trim();

    // If text is too long (token limit), we might need to truncate.
    // A standard ecommerce page has a lot of noise.
    // Better strategy: Select potential product containers.
    // But generic extractor is hard.
    // Let's try sending the first 15k characters of text + image URLs?

    return content.substring(0, 15000);
};

/**
 * Extracts product data from a given URL using OpenAI.
 * @param {string} url 
 * @returns {Promise<Array>} List of extracted products
 */
async function extractFromUrl(url) {
    try {
        console.log(`[Extractor] Fetching ${url}...`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);

        const html = await response.text();
        const cleanedText = cleanHtml(html);

        console.log(`[Extractor] Sending to OpenAI (${cleanedText.length} chars)...`);

        const prompt = `
        You are an intelligent product extractor. 
        Analyze the text content from an e-commerce page below and extract products.
        
        Return a JSON object with a key "products" which is an array of objects.
        Each product object MUST have:
        - name (string)
        - price (number, numeric only)
        - description (string, stored as plain text)
        - image (string URL, look for high res images in text if possible, or leave null)
        - variantItems (array of objects with { name: string, price: number, color: string, size: string })
        
        If there are multiple products (category page), extract all.
        If single product page, extract one.
        
        Text Content:
        "${cleanedText}"
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Cost effective
            messages: [
                { role: "system", content: "You are a helpful assistant that extracts structured product data from raw text involved in e-commerce." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        console.log(`[Extractor] Extracted ${result.products?.length || 0} products.`);

        return result.products || [];

    } catch (error) {
        console.error('[Extractor] Error:', error);
        throw error;
    }
}

module.exports = { extractFromUrl };
