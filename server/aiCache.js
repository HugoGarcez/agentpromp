const aiSentMessagesCache = new Map();

/**
 * Registra o envio de uma mensagem de texto pela IA para um número específico.
 * Expira após 10 segundos para cobrir ecos e webhooks lentos sem interromper diálogos naturais.
 */
export const registerAiSentMessage = (number, text) => {
    if (!number || !text) return;
    const cleanNum = String(number).replace(/\D/g, '');
    const cleanText = text.trim().toLowerCase();
    const key = `${cleanNum}_${cleanText}`;
    aiSentMessagesCache.set(key, Date.now());
    
    console.log(`[AICache] Registered AI sent message to ${cleanNum}: "${cleanText.substring(0, 40)}..."`);

    setTimeout(() => {
        aiSentMessagesCache.delete(key);
    }, 10000); // 10 segundos
};

/**
 * Verifica se a mensagem recebida no webhook é a mesma que a IA acabou de enviar para o mesmo destinatário.
 */
export const isAiSentMessage = (number, text) => {
    if (!number || !text) return false;
    const cleanNum = String(number).replace(/\D/g, '');
    const cleanText = text.trim().toLowerCase();
    const key = `${cleanNum}_${cleanText}`;
    const found = aiSentMessagesCache.has(key);
    if (found) {
        console.log(`[AICache] Found matching AI sent message for ${cleanNum}: "${cleanText.substring(0, 40)}..."`);
    }
    return found;
};
