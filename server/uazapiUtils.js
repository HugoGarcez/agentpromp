/**
 * Uazapi Integration Module
 * 
 * Provides WhatsApp integration via the Uazapi API (promp.uazapi.com):
 * - Presence simulation (composing/recording) with proportional duration
 * - Product catalog carousel via POST /send/menu (type: "carousel")
 * 
 * Token resolution priority:
 * 1. integrations.whatsapp.tokenAPI (per-agent config)
 * 2. UAZAPI_TOKEN environment variable (global fallback)
 * 
 * NOTE: prompToken (JWT) is NOT valid for the Uazapi API.
 *       Uazapi requires its own token (UUID format).
 */

const UAZAPI_BASE_URL = 'https://promp.uazapi.com';

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Extract Uazapi config from agent configuration.
 * 
 * Priority:
 * 1. Explicit integrations.whatsapp.tokenAPI (per-agent)
 * 2. UAZAPI_TOKEN environment variable (global)
 * 
 * @returns {{ tokenAPI: string, baseUrl: string }} or null
 */
export const getUazapiConfig = (config) => {
    try {
        // 1. Check explicit Uazapi config in integrations (per-agent)
        const integrations = config?.integrations;
        if (integrations) {
            const whatsapp = integrations.whatsapp || integrations.Whatsapp;
            if (whatsapp?.tokenAPI) {
                return {
                    tokenAPI: whatsapp.tokenAPI,
                    baseUrl: UAZAPI_BASE_URL
                };
            }
        }

        // 2. Fallback: global UAZAPI_TOKEN env var
        if (process.env.UAZAPI_TOKEN) {
            return {
                tokenAPI: process.env.UAZAPI_TOKEN,
                baseUrl: UAZAPI_BASE_URL
            };
        }

        return null;
    } catch (e) {
        return null;
    }
};

/**
 * Calculate presence duration (in ms) based on content length.
 * 
 * For text: ~50ms per character, minimum 1s, maximum 8s.
 * For audio: uses duration in seconds, maximum 12s.
 * 
 * @param {string|number} content - Text content (string) or audio duration in seconds (number)
 * @param {'text'|'audio'} type - Content type
 * @returns {number} Duration in milliseconds
 */
export const calcPresenceDuration = (content, type = 'text') => {
    if (type === 'audio') {
        const seconds = typeof content === 'number' ? content : 10;
        return Math.max(1000, Math.min(seconds * 1000, 12000));
    }

    const chars = typeof content === 'string' ? content.length : 100;
    const ms = chars * 50;
    return Math.max(1000, Math.min(ms, 8000));
};

// ──────────────────────────────────────────────────────────────
// PRESENCE (Typing / Recording)
// ──────────────────────────────────────────────────────────────

/**
 * Send presence status (composing/recording) to a WhatsApp number via Uazapi.
 * 
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Recipient phone number
 * @param {'text'|'audio'} type - 'text' for composing, 'audio' for recording
 * @returns {Promise<boolean>} true if sent successfully
 */
export const sendUazapiPresence = async (tokenAPI, phone, type = 'text') => {
    if (!tokenAPI || !phone) {
        console.log('[Uazapi] Skipping Presence: Missing tokenAPI or phone.');
        return false;
    }

    try {
        const body = {
            phone: String(phone).replace(/\D/g, ''),
            presence: 'composing'
        };

        if (type === 'audio') {
            body.media = 'audio';
        }

        const response = await fetch(`${UAZAPI_BASE_URL}/message/presence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': tokenAPI
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[Uazapi] Presence Failed (${response.status}):`, errorText);
            return false;
        }

        console.log(`[Uazapi] Presence (${type === 'audio' ? 'recording' : 'composing'}) sent to ${phone}`);
        return true;
    } catch (error) {
        console.error('[Uazapi] Presence Exception:', error.message);
        return false;
    }
};

/**
 * Full presence flow: send composing status, wait proportionally, then return.
 * 
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Recipient phone number
 * @param {string|number} content - Message text or audio duration in seconds
 * @param {'text'|'audio'} type - Content type
 */
export const sendPresenceAndWait = async (tokenAPI, phone, content, type = 'text') => {
    try {
        await sendUazapiPresence(tokenAPI, phone, type);
        const duration = calcPresenceDuration(content, type);
        await new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        console.error('[Uazapi] sendPresenceAndWait Exception:', error.message);
    }
};

// ──────────────────────────────────────────────────────────────
// CATALOG CAROUSEL (POST /send/carousel)
// ──────────────────────────────────────────────────────────────

// Trigger keywords for catalog intent detection
const CATALOG_TRIGGERS = [
    'produto', 'produtos', 'serviço', 'serviços', 'servico', 'servicos',
    'cardápio', 'cardapio', 'menu', 'catálogo', 'catalogo',
    'o que você vende', 'o que vocês vendem', 'o que voce vende',
    'quero ver', 'lista de', 'preços', 'preço', 'precos', 'preco',
    'o que tem', 'o que você tem', 'o que voce tem',
    'quais são', 'quais sao', 'disponíveis', 'disponiveis'
];

/**
 * Detect if a user message is requesting to see the product catalog.
 * 
 * @param {string} userMessage - The user's message
 * @returns {boolean} true if the message matches catalog intent
 */
export const shouldShowCatalog = (userMessage) => {
    if (!userMessage || typeof userMessage !== 'string') return false;
    const lower = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return CATALOG_TRIGGERS.some(trigger => {
        const normalizedTrigger = trigger.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return lower.includes(normalizedTrigger);
    });
};

/**
 * Build choices array for Uazapi carousel format.
 * 
 * Format per the Uazapi documentation (POST /send/menu with type: "carousel"):
 * - "[Title\nDescription]" — card text (title + body)
 * - "{imageUrl}" — card image
 * - "Button Text|copy:CODE" — copy button
 * - "Button Text|call:PHONE" — call button
 * - "Button Text|https://url" — URL button
 * - "Button Text|button_id" — reply button
 * 
 * WhatsApp carousel supports up to 10 cards.
 * 
 * @param {Array} catalogItems - Product array from config.products
 * @param {string} agentPhone - Optional agent phone for Call button
 * @returns {string[]} Choices array for Uazapi /send/menu carousel
 */
export const buildCarouselChoices = (catalogItems, agentPhone = '') => {
    if (!Array.isArray(catalogItems) || catalogItems.length === 0) return [];

    // Limit to 10 cards (WhatsApp carousel limit)
    const items = catalogItems.slice(0, 10);
    const choices = [];

    for (const item of items) {
        // Support multiple product schema formats from the Promp system
        const name = item.name || item.title || item.nome || item.titulo || 'Produto';
        const desc = item.description || item.descricao || '';
        const price = item.price ?? item.preco ?? item.valor;
        const imageUrl = item.imageUrl || item.image || item.imagem || item.foto || '';
        const productUrl = item.productUrl || item.link || item.url || '';
        const id = item.id || item.productId || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        // Build description with price
        const descParts = [];
        if (desc) descParts.push(desc.slice(0, 150));
        if (price != null && price !== '' && price !== 0) {
            const formattedPrice = typeof price === 'number'
                ? `R$ ${price.toFixed(2).replace('.', ',')}`
                : `R$ ${price}`;
            descParts.push(formattedPrice);
        }
        const descLine = descParts.join('\n') || 'Toque para saber mais';

        // 1. Card text: [Title\nDescription]
        choices.push(`[${name}\n${descLine}]`);

        // 2. Card image: {url}
        if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
            choices.push(`{${imageUrl}}`);
        }

        // 3. Buttons (up to 3 per card)
        
        // Button 1: URL Button (if available)
        if (productUrl && (productUrl.startsWith('http://') || productUrl.startsWith('https://'))) {
            choices.push(`Ver no site|${productUrl}`);
        } else {
            // Fallback: Reply button
            choices.push(`Saber mais|info_${id}`);
        }

        // Button 2: Copy Button (Product ID)
        choices.push(`Copiar Código|copy:${id}`);

        // Button 3: Call Button (if agent phone is available)
        if (agentPhone) {
            const cleanAgentPhone = String(agentPhone).replace(/\D/g, '');
            if (cleanAgentPhone) {
                choices.push(`Falar c/ Atendente|call:+${cleanAgentPhone}`);
            }
        }
    }

    return choices;
};

/**
 * Send product catalog as a WhatsApp carousel via Uazapi.
 * Uses POST /send/menu with type: "carousel" and choices array.
 * 
 * Documentation: https://docs.uazapi.com/endpoint/post/send~menu
 * 
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Recipient phone number
 * @param {Array} products - Product array from config.products
 * @param {string} agentName - Agent name for the intro text
 * @param {string} agentPhone - Agent phone for Call buttons
 * @returns {Promise<boolean>} true if sent successfully
 */
export const sendCatalogCarousel = async (tokenAPI, phone, products, agentName, agentPhone = '') => {
    if (!tokenAPI || !phone) {
        console.log('[Uazapi] Skipping Carousel: Missing tokenAPI or phone.');
        return false;
    }

    if (!Array.isArray(products) || products.length === 0) {
        console.log('[Uazapi] Skipping Carousel: No products available.');
        return false;
    }

    try {
        const choices = buildCarouselChoices(products, agentPhone);
        if (choices.length === 0) {
            console.log('[Uazapi] Skipping Carousel: Failed to build choices.');
            return false;
        }

        // Extract imageButton (first product image or null)
        const imageButton = products.find(p => p.imageUrl || p.image || p.imagem || p.foto)?.imageUrl || 
                           products.find(p => p.imageUrl || p.image || p.imagem || p.foto)?.image || null;

        const payload = {
            number: String(phone).replace(/\D/g, ''),
            type: 'carousel',
            text: `📦 Conheça nossos produtos — ${(agentName || 'Catálogo')}`,
            choices,
            imageButton: imageButton, // Header image for the menu
            delay: 1000
        };

        console.log(`[Uazapi] Sending Carousel to ${phone} via POST /send/menu (${Math.min(products.length, 10)} cards, ${choices.length} choices)`);
        console.log(`[Uazapi] Token used (start): ${tokenAPI.substring(0, 8)}...`);
        // console.log(`[Uazapi] Payload: ${JSON.stringify(payload, null, 2)}`);

        const response = await fetch(`${UAZAPI_BASE_URL}/send/menu`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': tokenAPI
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text().catch(() => 'No response body');

        if (!response.ok) {
            console.error(`[Uazapi] Carousel Failed (${response.status}):`, responseText);
            if (response.status === 401) {
                console.error('[Uazapi] AUTH ERROR: Please check if the token in Agent Integrations is a valid Uazapi UUID.');
            }
            return false;
        }

        console.log(`[Uazapi] Carousel Sent Successfully. ID: ${responseText.substring(0, 50)}...`);
        return true;
    } catch (error) {
        console.error('[Uazapi] Carousel Exception:', error.message);
        return false;
    }
};

// Legacy export for backwards compatibility
export const sendCatalogMenu = sendCatalogCarousel;

