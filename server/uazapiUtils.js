/**
 * Uazapi Integration Module
 * 
 * Provides WhatsApp integration via the Uazapi API (promp.uazapi.com):
 * - Presence simulation (composing/recording) with proportional duration
 * - Product catalog carousel via POST /send/carousel
 * 
 * Token resolution priority:
 * 1. integrations.whatsapp.tokenAPI (explicit Uazapi config)
 * 2. prompToken from channel credentials (works if Promp backend is Uazapi)
 */

const UAZAPI_BASE_URL = 'https://promp.uazapi.com';

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Extract Uazapi config from agent configuration.
 * 
 * Priority:
 * 1. Explicit integrations.whatsapp.tokenAPI (when type === 'uazapi')
 * 2. Fallback to prompToken (since Promp uses Uazapi as backend)
 * 
 * @returns {{ tokenAPI: string, baseUrl: string }} or null
 */
export const getUazapiConfig = (config) => {
    try {
        // 1. Check explicit Uazapi config in integrations
        const integrations = config?.integrations;
        if (integrations) {
            const whatsapp = integrations.whatsapp || integrations.Whatsapp;
            if (whatsapp?.type === 'uazapi' && whatsapp?.tokenAPI) {
                return {
                    tokenAPI: whatsapp.tokenAPI,
                    baseUrl: UAZAPI_BASE_URL
                };
            }
        }

        // 2. Fallback: use prompToken directly (works when Promp backend IS Uazapi)
        if (config?.prompToken) {
            const cleanToken = config.prompToken.trim().replace(/^Bearer\s+/i, '');
            return {
                tokenAPI: cleanToken,
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
 * Build carousel cards from the product catalog.
 * 
 * Each card has:
 * - text: "Product Name\nDescription" (title + body)
 * - image: product image URL
 * - buttons: interactive buttons (reply type)
 * 
 * WhatsApp carousel supports up to 10 cards.
 * Each card can have up to 3 buttons.
 * 
 * @param {Array} catalogItems - Product array from config.products
 * @returns {Array} Carousel cards for POST /send/carousel
 */
export const buildCarouselCards = (catalogItems) => {
    if (!Array.isArray(catalogItems) || catalogItems.length === 0) return [];

    // Limit to 10 cards (WhatsApp carousel limit)
    const items = catalogItems.slice(0, 10);

    return items.map((item, index) => {
        // Support multiple product schema formats
        const name = item.name || item.title || item.nome || item.titulo || 'Produto';
        const desc = item.description || item.descricao || '';
        const price = item.price ?? item.preco ?? item.valor;
        const imageUrl = item.imageUrl || item.image || item.imagem || item.foto || '';
        const productUrl = item.productUrl || item.link || item.url || '';
        const id = item.id || item.productId || `prod_${index}`;

        // Build card text: name + description + price
        const textParts = [name];
        if (desc) textParts.push(desc.slice(0, 200));
        if (price != null && price !== '' && price !== 0) {
            const formattedPrice = typeof price === 'number'
                ? `R$ ${price.toFixed(2).replace('.', ',')}`
                : `R$ ${price}`;
            textParts.push(`💰 ${formattedPrice}`);
        }

        // Build buttons (max 3 per card)
        const buttons = [];
        buttons.push({
            id: `info_${id}`,
            text: 'Saber mais',
            type: 'REPLY'
        });

        if (productUrl) {
            buttons.push({
                id: `link_${id}`,
                text: 'Ver no site',
                type: 'URL',
                url: productUrl
            });
        }

        const card = {
            text: textParts.join('\n'),
            buttons
        };

        // Only include image if we have a valid URL
        if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
            card.image = imageUrl;
        }

        return card;
    });
};

/**
 * Send product catalog as a WhatsApp carousel via Uazapi.
 * Uses POST /send/carousel endpoint with structured JSON.
 * 
 * Documentation: https://docs.uazapi.com/endpoint/post/send~carousel
 * 
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Recipient phone number
 * @param {Array} products - Product array from config.products
 * @param {string} agentName - Agent name for the intro text
 * @returns {Promise<boolean>} true if sent successfully
 */
export const sendCatalogCarousel = async (tokenAPI, phone, products, agentName) => {
    if (!tokenAPI || !phone) {
        console.log('[Uazapi] Skipping Carousel: Missing tokenAPI or phone.');
        return false;
    }

    if (!Array.isArray(products) || products.length === 0) {
        console.log('[Uazapi] Skipping Carousel: No products available.');
        return false;
    }

    try {
        const carousel = buildCarouselCards(products);
        if (carousel.length === 0) {
            console.log('[Uazapi] Skipping Carousel: Failed to build cards.');
            return false;
        }

        const payload = {
            number: String(phone).replace(/\D/g, ''),
            text: `📦 Catálogo ${agentName || 'Nossos Produtos'} — ${carousel.length} produto${carousel.length > 1 ? 's' : ''}`,
            carousel
        };

        console.log(`[Uazapi] Sending Carousel to ${phone} (${carousel.length} cards)`);

        const response = await fetch(`${UAZAPI_BASE_URL}/send/carousel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': tokenAPI
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[Uazapi] Carousel Failed (${response.status}):`, errorText);

            // Fallback: try send/menu with type: "carousel" format
            console.log('[Uazapi] Trying fallback via /send/menu with type: carousel...');
            return await sendCatalogMenuCarousel(tokenAPI, phone, products, agentName);
        }

        console.log('[Uazapi] Carousel Sent Successfully');
        return true;
    } catch (error) {
        console.error('[Uazapi] Carousel Exception:', error.message);
        return false;
    }
};

/**
 * Fallback: Send carousel via POST /send/menu with type: "carousel".
 * Uses the string-based choices format from the Uazapi docs.
 * 
 * Documentation: https://docs.uazapi.com/endpoint/post/send~menu
 * 
 * choices format:
 * - "[Title\nDescription]" — card text
 * - "{imageUrl}" — card image
 * - "Button Text|button_id" — reply button
 */
const sendCatalogMenuCarousel = async (tokenAPI, phone, products, agentName) => {
    try {
        const items = products.slice(0, 10);
        const choices = [];

        for (const item of items) {
            const name = item.name || item.title || item.nome || item.titulo || 'Produto';
            const desc = item.description || item.descricao || '';
            const price = item.price ?? item.preco ?? item.valor;
            const imageUrl = item.imageUrl || item.image || item.imagem || item.foto || '';
            const id = item.id || item.productId || `prod_${Date.now()}`;

            // Build description line
            const descParts = [];
            if (desc) descParts.push(desc.slice(0, 100));
            if (price != null && price !== '' && price !== 0) {
                const formatted = typeof price === 'number'
                    ? `R$ ${price.toFixed(2).replace('.', ',')}`
                    : `R$ ${price}`;
                descParts.push(formatted);
            }
            const descLine = descParts.join(' - ') || 'Toque para saber mais';

            // Card text: [Title\nDescription]
            choices.push(`[${name}\n${descLine}]`);

            // Card image: {url}
            if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                choices.push(`{${imageUrl}}`);
            }

            // Card button: Text|id
            choices.push(`Saber mais|${id}`);
        }

        const payload = {
            number: String(phone).replace(/\D/g, ''),
            type: 'carousel',
            text: `📦 Catálogo ${agentName || 'Nossos Produtos'}`,
            choices
        };

        console.log(`[Uazapi] Sending Menu Carousel to ${phone} (${items.length} items, ${choices.length} choices)`);

        const response = await fetch(`${UAZAPI_BASE_URL}/send/menu`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': tokenAPI
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[Uazapi] Menu Carousel Failed (${response.status}):`, errorText);
            return false;
        }

        console.log('[Uazapi] Menu Carousel Sent Successfully');
        return true;
    } catch (error) {
        console.error('[Uazapi] Menu Carousel Exception:', error.message);
        return false;
    }
};

// Legacy export for backwards compatibility
export const sendCatalogMenu = sendCatalogCarousel;
