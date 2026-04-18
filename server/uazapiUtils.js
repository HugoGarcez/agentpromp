/**
 * Uazapi Integration Module
 * 
 * Provides WhatsApp integration via the Uazapi API (promp.uazapi.com):
 * - Presence simulation (composing/recording) with proportional duration
 * - Product catalog carousel via interactive menu (send/menu)
 * 
 * Activated when agent config has: integrations.whatsapp.type === 'uazapi'
 */

const UAZAPI_BASE_URL = 'https://promp.uazapi.com';

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Extract Uazapi config from agent configuration.
 * Returns { tokenAPI, baseUrl } if Uazapi is configured, or null otherwise.
 */
export const getUazapiConfig = (config) => {
    try {
        const integrations = config?.integrations;
        if (!integrations) return null;

        const whatsapp = integrations.whatsapp || integrations.Whatsapp;
        if (!whatsapp) return null;

        if (whatsapp.type !== 'uazapi' || !whatsapp.tokenAPI) return null;

        return {
            tokenAPI: whatsapp.tokenAPI,
            baseUrl: UAZAPI_BASE_URL
        };
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
 * This simulates human-like behavior before sending a message.
 * Failures are logged but never thrown — presence is non-critical.
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

        // For audio, include media field
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
 * The caller should send the actual message after this resolves.
 * 
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Recipient phone number
 * @param {string|number} content - Message text or audio duration in seconds
 * @param {'text'|'audio'} type - Content type
 */
export const sendPresenceAndWait = async (tokenAPI, phone, content, type = 'text') => {
    try {
        // 1. Send presence
        await sendUazapiPresence(tokenAPI, phone, type);

        // 2. Wait proportionally
        const duration = calcPresenceDuration(content, type);
        await new Promise(resolve => setTimeout(resolve, duration));
    } catch (error) {
        // Presence is non-critical — never block the pipeline
        console.error('[Uazapi] sendPresenceAndWait Exception:', error.message);
    }
};

// ──────────────────────────────────────────────────────────────
// CATALOG CAROUSEL (send/menu)
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
 * Build the WhatsApp interactive menu payload from product catalog.
 * 
 * Respects WhatsApp limits:
 * - Max 10 sections
 * - Max 10 rows per section
 * - Max 24 chars for item title
 * - Max 72 chars for item description
 * 
 * @param {string} phone - Recipient phone number
 * @param {Array} catalogItems - Array of product objects from config.products
 * @param {string} agentName - Agent name for the menu title
 * @returns {object} Formatted payload for Uazapi send/menu endpoint
 */
export const buildMenuPayload = (phone, catalogItems, agentName) => {
    if (!Array.isArray(catalogItems) || catalogItems.length === 0) return null;

    // Group items by category
    const grouped = {};
    for (const item of catalogItems) {
        // Support multiple product schema formats from the Promp system
        const category = item.category || item.categoria || 'Produtos';
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(item);
    }

    // Build sections (max 10)
    const categoryEntries = Object.entries(grouped).slice(0, 10);

    const sections = categoryEntries.map(([category, items]) => ({
        title: category.slice(0, 24),
        rows: items.slice(0, 10).map(item => {
            // Support multiple name fields
            const name = item.name || item.title || item.nome || item.titulo || 'Produto';
            const desc = item.description || item.descricao || '';
            const price = item.price ?? item.preco ?? item.valor;
            const id = item.id || item.productId || `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

            // Build description: text + price
            const descParts = [];
            if (desc) descParts.push(desc.slice(0, 50));
            if (price != null && price !== '' && price !== 0) {
                const formattedPrice = typeof price === 'number'
                    ? `R$ ${price.toFixed(2).replace('.', ',')}`
                    : `R$ ${price}`;
                descParts.push(formattedPrice);
            }

            return {
                id: String(id).slice(0, 200),
                title: name.slice(0, 24),
                description: descParts.join(' | ').slice(0, 72) || 'Ver detalhes'
            };
        })
    }));

    return {
        phone: String(phone).replace(/\D/g, ''),
        title: `Catálogo — ${(agentName || 'Assistente').slice(0, 15)}`.slice(0, 24),
        description: 'Selecione um item para saber mais:',
        buttonText: 'Ver produtos',
        sections
    };
};

/**
 * Send product catalog as an interactive WhatsApp menu via Uazapi.
 * 
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Recipient phone number
 * @param {Array} products - Product array from config.products
 * @param {string} agentName - Agent name
 * @returns {Promise<boolean>} true if sent successfully
 */
export const sendCatalogMenu = async (tokenAPI, phone, products, agentName) => {
    if (!tokenAPI || !phone) {
        console.log('[Uazapi] Skipping Catalog: Missing tokenAPI or phone.');
        return false;
    }

    if (!Array.isArray(products) || products.length === 0) {
        console.log('[Uazapi] Skipping Catalog: No products available.');
        return false;
    }

    try {
        const payload = buildMenuPayload(phone, products, agentName);
        if (!payload) {
            console.log('[Uazapi] Skipping Catalog: Failed to build menu payload.');
            return false;
        }

        console.log(`[Uazapi] Sending Catalog Menu to ${phone} (${products.length} products, ${payload.sections.length} sections)`);

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
            console.error(`[Uazapi] Catalog Menu Failed (${response.status}):`, errorText);
            return false;
        }

        console.log('[Uazapi] Catalog Menu Sent Successfully');
        return true;
    } catch (error) {
        console.error('[Uazapi] Catalog Menu Exception:', error.message);
        return false;
    }
};
