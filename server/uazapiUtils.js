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
            number: String(phone).replace(/\D/g, ''),
            presence: 'composing'
        };

        if (type === 'audio') {
            body.presence = 'recording';
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

/**
 * Send audio as a WhatsApp voice note (PTT) via Uazapi.
 * Uses POST /send/media with type: "ptt".
 * 
 * Documentation: https://docs.uazapi.com/endpoint/post/send~media
 * 
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Recipient phone number
 * @param {string} audioBase64 - Audio content in Base64 (MP3/OGG)
 * @returns {Promise<boolean>} true if sent successfully
 */
export const sendUazapiAudio = async (tokenAPI, phone, audioBase64) => {
    if (!tokenAPI || !phone || !audioBase64) {
        console.log('[Uazapi] Skipping Audio: Missing tokenAPI, phone or audio content.');
        return false;
    }

    try {
        const cleanNumber = String(phone).replace(/\D/g, '');
        const base64Content = `data:audio/ogg;base64,${audioBase64}`;

        // Payload redundante para cobrir diferentes versões da API Uazapi
        const payload = {
            number: cleanNumber,
            file: base64Content,    // Padrão novo
            media: base64Content,   // Padrão antigo
            type: 'audio',          // Tipo base
            ptt: true,              // Força o modo PTT (gravado na hora)
            caption: '',            // Garante que não haja legenda
            delay: 0
        };

        console.log(`[Uazapi] Sending PTT Audio to ${cleanNumber} (ptt: true)...`);
        
        // Tentamos o endpoint /send/audio que é mais específico para PTT
        const response = await fetch(`${UAZAPI_BASE_URL}/send/audio`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': tokenAPI
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text().catch(() => 'No response body');

        if (!response.ok) {
            console.error(`[Uazapi] Audio Send Failed (${response.status}):`, responseText);
            // Se falhar no /send/audio, tentamos o /send/media como fallback imediato
            console.log('[Uazapi] Retrying via /send/media...');
            const retryRes = await fetch(`${UAZAPI_BASE_URL}/send/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': tokenAPI },
                body: JSON.stringify({ ...payload, type: 'ptt' })
            });
            
            if (!retryRes.ok) return false;
        }

        console.log(`[Uazapi] Audio Sent Successfully (PTT/Audio mode).`);
        return true;
    } catch (error) {
        console.error('[Uazapi] Audio Send Exception:', error.message);
        return false;
    }
};

// Legacy export for backwards compatibility
export const sendCatalogMenu = sendCatalogCarousel;

// ──────────────────────────────────────────────────────────────
// MESSAGE REACTIONS
// ──────────────────────────────────────────────────────────────

/**
 * Default emoji reactions for each recognized situation.
 * Can be overridden via config.reactionConfig in AgentConfig.
 */
export const DEFAULT_REACTION_CONFIG = {
    enabled: true,
    afirmacao: '👍',   // Client confirms or agrees
    interesse: '🔥',   // Client shows interest in a product/service
    explicacao: '👀',  // Client explains a situation or context
    elogio: '🥰'       // Client compliments the company, team, or product
};

// Keywords per situation (normalized to lowercase, no accents)
const REACTION_PATTERNS = {
    afirmacao: [
        'sim', 'pode ser', 'claro', 'com certeza', 'ok', 'certo', 'perfeito',
        'combinado', 'fechado', 'ta bom', 'tudo bem', 'beleza', 'positivo',
        'concordo', 'isso mesmo', 'exato', 'correto', 'confirmado', 'afirmativo',
        'pode', 'pode sim', 'topo', 'aceito', 'topei'
    ],
    interesse: [
        'quero', 'tenho interesse', 'me interessa', 'quero saber mais',
        'como funciona', 'qual o preco', 'quanto custa', 'me fala mais',
        'me conta mais', 'quero comprar', 'quero contratar', 'quero conhecer',
        'pode me enviar', 'quero ver', 'me manda', 'me envia', 'quero adquirir',
        'quero assinar', 'quero testar', 'gostei', 'me interessei'
    ],
    elogio: [
        'otimo', 'excelente', 'parabens', 'adorei', 'muito bom', 'incrivel',
        'fantastico', 'maravilhoso', 'amo', 'show', 'sensacional', 'demais',
        'gostei muito', 'muito satisfeito', 'voces sao otimos', 'melhor',
        'top', 'nota 10', 'nota dez', 'perfeitos', 'muito bom mesmo',
        'amei', 'adorei', 'gostei bastante', 'muito eficiente', 'muito rapido'
    ]
};

// Explanation is detected heuristically (longer message + explanation keywords)
const EXPLICACAO_KEYWORDS = [
    'porque', 'entao', 'o que acontece', 'explico', 'e que', 'acontece que',
    'na verdade', 'basicamente', 'como te disse', 'o motivo', 'a razao',
    'a situacao', 'preciso que', 'o problema', 'o caso e', 'aconteceu que',
    'queria explicar', 'deixa eu explicar', 'vou te explicar'
];

/**
 * Detect which reaction situation (if any) applies to a user message.
 * Returns the situation key or null if none detected.
 *
 * @param {string} message - The user's text message
 * @returns {'afirmacao'|'interesse'|'explicacao'|'elogio'|null}
 */
export const detectReactionSituation = (message) => {
    if (!message || typeof message !== 'string') return null;

    const normalized = message
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    // Elogio — check first to avoid misclassifying as afirmacao
    if (REACTION_PATTERNS.elogio.some(kw => normalized.includes(kw))) {
        return 'elogio';
    }

    // Interesse
    if (REACTION_PATTERNS.interesse.some(kw => normalized.includes(kw))) {
        return 'interesse';
    }

    // Afirmação — short affirmative messages
    if (
        REACTION_PATTERNS.afirmacao.some(kw => normalized === kw || normalized.startsWith(kw + ' ') || normalized.endsWith(' ' + kw)) &&
        normalized.length <= 60
    ) {
        return 'afirmacao';
    }

    // Explicação — longer message with explanation markers
    if (normalized.length > 80 && EXPLICACAO_KEYWORDS.some(kw => normalized.includes(kw))) {
        return 'explicacao';
    }

    return null;
};

/**
 * Send a WhatsApp reaction emoji to a specific message via Uazapi.
 * Uses POST /message/react.
 *
 * @param {string} tokenAPI - Uazapi API token
 * @param {string} phone - Sender phone number (who sent the original message)
 * @param {string} messageId - The WhatsApp message ID to react to
 * @param {string} emoji - The emoji to react with
 * @returns {Promise<boolean>} true if sent successfully
 */
export const sendMessageReaction = async (tokenAPI, phone, messageId, emoji) => {
    if (!tokenAPI || !phone || !messageId || !emoji) {
        console.log('[Uazapi] Skipping Reaction: Missing tokenAPI, phone, messageId or emoji.');
        return false;
    }

    try {
        const payload = {
            number: String(phone).replace(/\D/g, ''),
            msgId: messageId,
            emoji
        };

        console.log(`[Uazapi] Sending Reaction payload:`, JSON.stringify(payload));

        const response = await fetch(`${UAZAPI_BASE_URL}/message/react`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': tokenAPI
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[Uazapi] Reaction Failed (${response.status}):`, errorText);
            return false;
        }

        console.log(`[Uazapi] Reaction "${emoji}" sent to message ${messageId} (${phone})`);
        return true;
    } catch (error) {
        console.error('[Uazapi] Reaction Exception:', error.message);
        return false;
    }
};

/**
 * Detect situation in user message and, if matched, send a reaction emoji.
 * Fire-and-forget — does not block the main response flow.
 *
 * @param {object} config - Agent config (must have reactionConfig and Uazapi token)
 * @param {string} phone - Sender phone number
 * @param {string} messageId - WhatsApp message ID to react to
 * @param {string} userMessage - The user's text message
 */
export const reactToUserMessage = (config, phone, messageId, userMessage) => {
    try {
        const uazapiCfg = getUazapiConfig(config);
        if (!uazapiCfg) return;

        // Merge default config with any per-agent overrides
        const reactionCfg = { ...DEFAULT_REACTION_CONFIG, ...(config.reactionConfig || {}) };

        if (!reactionCfg.enabled) return;
        if (!messageId) return;

        const situation = detectReactionSituation(userMessage);
        if (!situation) return;

        const emoji = reactionCfg[situation];
        if (!emoji) return;

        console.log(`[Uazapi] Reaction detected: "${situation}" → ${emoji}`);

        // Fire-and-forget: do not await so the main flow is not blocked
        sendMessageReaction(uazapiCfg.tokenAPI, phone, messageId, emoji).catch(() => {});
    } catch (e) {
        console.error('[Uazapi] reactToUserMessage Exception:', e.message);
    }
};


