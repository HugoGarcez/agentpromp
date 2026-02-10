import axios from 'axios';
import * as cheerio from 'cheerio';
import { TextDecoder } from 'util';

const url = 'https://www.aqnsport.com.br/outletaqn/';

// Copy of the logic from extractor.js for direct testing
const decodeBuffer = (buffer, contentType) => {
    let encoding = 'utf-8';
    if (contentType) {
        const match = contentType.match(/charset=([\w-]+)/i);
        if (match) encoding = match[1];
    }
    const preview = new TextDecoder('utf-8').decode(buffer.slice(0, 1000));
    const metaMatch = preview.match(/<meta.*?charset=["']?([\w-]+)["']?/i);
    if (metaMatch) encoding = metaMatch[1];

    try {
        const decoder = new TextDecoder(encoding);
        return decoder.decode(buffer);
    } catch (e) {
        return new TextDecoder('utf-8').decode(buffer);
    }
};

const cleanHtml = (html) => {
    const $ = cheerio.load(html);

    // Check if images are being found
    const imgCount = $('img').length;
    console.log(`[Verify] Found ${imgCount} raw <img> tags.`);

    $('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src && !src.startsWith('data:') && !src.includes('svg') && !src.includes('icon') && !src.includes('logo')) {
            $(el).replaceWith(`\n[IMAGE: ${src}]\n`);
        } else {
            $(el).remove();
        }
    });

    $('script, style, noscript, iframe, header, footer, nav').remove();
    $.root().find('*').contents().each(function () { if (this.type === 'comment') $(this).remove(); });
    $('br').replaceWith('\n');
    $('div, p, li, h1, h2, h3, h4, h5, h6, tr').after('\n');

    let content = $('body').text();
    content = content.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    return content;
};

async function verifyFix() {
    console.log(`[Verify] Fetching ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 ...' },
            responseType: 'arraybuffer',
            timeout: 30000
        });

        console.log(`[Verify] Status: ${response.status}`);

        const html = decodeBuffer(response.data, response.headers['content-type']);
        console.log(`[Verify] Decoded Length: ${html.length}`);

        const $ = cheerio.load(html);
        console.log(`[Verify] Title: ${$('title').text()}`); // Should be readable

        const cleaned = cleanHtml(html);
        console.log(`[Verify] Cleaned Length: ${cleaned.length}`);

        // Check for Image Markers
        const markers = cleaned.match(/\[IMAGE:.*?\]/g) || [];
        console.log(`[Verify] Found ${markers.length} image markers in text.`);
        if (markers.length > 0) {
            console.log(`[Verify] First 3 markers:`, markers.slice(0, 3));
        } else {
            console.warn(`[Verify] WARNING: No image markers found!`);
        }

    } catch (error) {
        console.error(`[Verify] Error: ${error.message}`);
    }
}

verifyFix();
