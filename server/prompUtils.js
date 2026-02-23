import axios from 'axios';
import FormData from 'form-data';
import path from 'path';
import sharp from 'sharp';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Helper for file logging (Local to this module)
const logFlow = (msg) => {
    try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync('debug_flow.txt', `[${timestamp}] [PrompUtils] ${msg}\n`);
    } catch (e) { /* ignore */ }
};

const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';

// --- MULTIPART MEDIA SENDER ---
export const sendPrompMedia = async (config, number, fileBuffer, fileName, mimeType, caption) => {
    if (!config.prompUuid || !config.prompToken) return false;

    try {
        const form = new FormData();
        form.append('number', number);
        form.append('body', caption || "Arquivo enviado");
        form.append('externalKey', `media_${Date.now()}`);
        form.append('isClosed', 'false');

        // Specific field 'media' as requested
        form.append('media', fileBuffer, {
            filename: fileName,
            contentType: mimeType
        });

        console.log(`[Promp] Uploading Multipart Media (${fileName}) to ${number}...`);

        const response = await axios.post(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}`, form, {
            headers: {
                'Authorization': `Bearer ${config.prompToken}`,
                ...form.getHeaders()
            }
        });

        console.log('[Promp] Multipart Upload Success:', response.data);
        return true;
    } catch (error) {
        console.error('[Promp] Multipart Upload Failed:', error.response ? error.response.data : error.message);
        return false;
    }
};

// --- PRESENCE STATE (Typing/Recording) ---
export const sendPrompPresence = async (config, number, ticketId, state) => {
    // Uazapi maps: 'typing' -> 'composing', 'recording' -> 'recording', 'paused' -> 'paused'
    let uazapiState = state;
    if (state === 'typing') uazapiState = 'composing';

    // 1. Check if we have native Wuzapi/Uazapi credentials to bypass Promp API
    const integrations = config.integrations || {};
    const legacyWuzapi = integrations.uazapi || integrations.wuzapi || integrations.evolution;

    if (legacyWuzapi && legacyWuzapi.url && legacyWuzapi.session && legacyWuzapi.token) {
        try {
            // Trim trailing slashes from URL
            const cleanUrl = legacyWuzapi.url.replace(/\/+$/, '');
            console.log(`[Promp] Sending Native Uazapi Presence (${uazapiState}) to ${number}`);

            const response = await fetch(`${cleanUrl}/message/presence`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${legacyWuzapi.token}`,
                    'apikey': legacyWuzapi.token, // Support both formats
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    number: number,
                    session: legacyWuzapi.session,
                    delay: 1000,
                    presence: uazapiState
                })
            });

            if (!response.ok) {
                console.error('[Promp] Native Uazapi Presence Failed:', await response.text());
                return false;
            }
            return true;
        } catch (error) {
            console.error('[Promp] Native Uazapi Presence Exception:', error.message);
            return false;
        }
    }

    // 2. Fallback to Standard Promp API (If supported in future)
    console.log(`[Promp] Native Uazapi config not found or incomplete. Falling back to Promp API Presence...`);
    if (!config.prompUuid || !config.prompToken) return false;

    // Ensure prompUuid is clean
    const uuid = config.prompUuid.trim();

    try {
        const response = await fetch(`${PROMP_BASE_URL}/v2/api/external/${uuid}/sendPresence`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.prompToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ticketId: Number(ticketId),
                state: state // "typing", "recording", "paused"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Silence the unsuported capability log to prevent spam on PM2
            if (errorText.includes('uazapi') || errorText.includes('não suportado')) {
                // Silenced
            } else {
                console.error('[Promp] Promp API Presence Update Failed:', errorText);
            }
            return false;
        }
        return true;
    } catch (error) {
        console.error('[Promp] Promp API Presence Exception:', error.message);
        return false;
    }
};

export const sendPrompMessage = async (config, number, text, audioBase64, imageUrl, caption, pdfBase64 = null) => {
    if (!config.prompUuid || !config.prompToken) {
        // Check legacy integration object (JSON) if columns are missing
        const integrations = config.integrations || {};
        const legacyWuzapi = integrations.wuzapi || integrations.evolution;

        if (legacyWuzapi && legacyWuzapi.session && legacyWuzapi.token) {
            config.prompUuid = legacyWuzapi.session;
            config.prompToken = legacyWuzapi.token;
            console.log('[Promp] Using Legacy Credentials from integrations JSON.');
        } else {
            console.log('[Promp] Skipping external API execution (Credentials missing).');
            return false;
        }
    }

    // Ensure prompUuid is clean (no spaces)
    config.prompUuid = config.prompUuid.trim();

    // 1. Send Text (ALWAYS send text for debug visibility, even if audio exists)
    if (text && text.trim().length > 0) {
        console.log(`[Promp] Sending Text to ${number} (Audio Present: ${!!audioBase64}). URL: ${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}`);
        try {
            // Split by DOUBLE Newlines to keep lists grouped in one bubble
            const chunks = text.split(/\n\s*\n/).map(c => c.trim()).filter(c => c.length > 0);

            console.log(`[Promp] Sending Text (${chunks.length} chunks) to ${number}...`);

            for (const chunk of chunks) {
                const textResponse = await fetch(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.prompToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        number: number,
                        body: chunk,
                        externalKey: `ai_${Date.now()}_${Math.random()}`,
                        isClosed: false
                    })
                });

                if (!textResponse.ok) {
                    console.error('[Promp] Text Chunk Send Failed:', await textResponse.text());
                } else {
                    // Small delay to ensure order in WhatsApp
                    await new Promise(r => setTimeout(r, 600));
                }
            }
        } catch (e) {
            console.error('[Promp] Text Exception:', e);
        }
    }

    // 4. Send PDF (Multipart Strategy)
    if (pdfBase64) {
        try {
            console.log(`[Promp] Preparing PDF for Multipart Upload to ${number}...`);
            let cleanPdf = pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
            cleanPdf = cleanPdf.replace(/[\r\n]+/g, '');

            const pdfBuffer = Buffer.from(cleanPdf, 'base64');

            await sendPrompMedia(config, number, pdfBuffer, `documento_${Date.now()}.pdf`, 'application/pdf', caption || "Segue o PDF solicitado.");
        } catch (e) {
            console.error('[Promp] PDF Send Exception:', e);
        }
    }

    // 2. Send Image (Hybrid: URL vs Base64 vs Local File)
    if (imageUrl) {
        try {
            let finalImageUrl = imageUrl.trim();
            const isDataUri = finalImageUrl.startsWith('data:');
            const isHttpUrl = finalImageUrl.startsWith('http://') || finalImageUrl.startsWith('https://');

            console.log(`[Promp] Processing Image. Type: ${isDataUri ? 'Base64' : (isHttpUrl ? 'Remote URL' : 'Local File')}`);

            if (isDataUri) {
                // --- CASE A: Base64 Data URI ---
                const matches = finalImageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const mimeType = matches[1];
                    const base64Data = matches[2];
                    const ext = mimeType.split('/')[1] || 'jpg';
                    const fileName = `image_${Date.now()}.${ext}`;

                    console.log(`[Promp] Sending via /base64 endpoint (Data URI). Mime: ${mimeType}`);
                    await sendBase64Image(config, number, base64Data, mimeType, fileName, caption);
                } else {
                    console.error('[Promp] Invalid Data URI format.');
                }

            } else if (isHttpUrl) {
                // --- CASE B: Remote URL ---
                console.log(`[Promp] Downloading Remote Image: ${finalImageUrl}`);
                logFlow(`Starting Download of: ${finalImageUrl}`);

                try {
                    const downloadResponse = await axios.get(finalImageUrl, {
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                        },
                        timeout: 15000
                    });

                    logFlow(`Download Success. Status: ${downloadResponse.status}. Size: ${downloadResponse.data.length}`);

                    let imageBuffer = Buffer.from(downloadResponse.data);
                    let mimeType = 'image/jpeg';
                    let fileName = `image_${Date.now()}.jpg`;

                    // CONVERT TO JPEG via SHARP
                    try {
                        imageBuffer = await sharp(imageBuffer)
                            .jpeg({ quality: 85, mozjpeg: true })
                            .toBuffer();
                        console.log(`[Promp] Image converted to JPEG via Sharp.`);
                    } catch (sharpError) {
                        console.error('[Promp] Sharp Conversion Error (Using Original):', sharpError.message);
                        mimeType = downloadResponse.headers['content-type'] || 'image/jpeg';
                        const ext = mimeType.split('/')[1] || 'jpg';
                        fileName = `image_${Date.now()}.${ext}`;
                    }

                    const base64Data = imageBuffer.toString('base64');
                    console.log(`[Promp] Sending converted image via /base64 endpoint.`);

                    await sendBase64Image(config, number, base64Data, mimeType, fileName, caption);

                } catch (downloadErr) {
                    console.error('[Promp] Failed to download remote image:', downloadErr.message);
                }

            } else {
                // --- CASE C: Local File Path ---
                try {
                    const filePath = path.resolve(finalImageUrl);
                    if (fs.existsSync(filePath)) {
                        const fileBuffer = fs.readFileSync(filePath);
                        const base64Data = fileBuffer.toString('base64');
                        const mimeType = 'image/jpeg'; // Assume JPEG for local
                        const fileName = path.basename(filePath);

                        console.log(`[Promp] Local file read success. Sending via /base64...`);
                        await sendBase64Image(config, number, base64Data, mimeType, fileName, caption);
                    } else {
                        console.error('[Promp] Local image file not found:', filePath);
                    }
                } catch (readErr) {
                    console.error('[Promp] Failed to read local image file:', readErr);
                }
            }
        } catch (e) {
            console.error('[Promp] Image Send Exception:', e);
        }
    }

    // Helper function for Base64 sending
    async function sendBase64Image(config, number, base64Data, mimeType, fileName, caption) {
        const imgResponse = await fetch(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}/base64`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.prompToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                number: number,
                body: caption || "",
                base64Data: base64Data,
                mimeType: mimeType,
                fileName: fileName,
                externalKey: `ai_img_${Date.now()}`,
                isClosed: false
            })
        });

        if (!imgResponse.ok) {
            const errRes = await imgResponse.text();
            console.error('[Promp] Base64 Image Send Failed:', errRes);
        } else {
            console.log('[Promp] SUCCESS: Image sent via Base64 endpoint.');
        }
    }


    // 3. Send Audio (if exists)
    if (audioBase64) {
        try {
            console.log(`[Promp] Sending Audio to ${number}...`);
            const audioResponse = await fetch(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}/base64`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.prompToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    number: number,
                    body: "Áudio da IA",
                    base64Data: audioBase64,
                    mimeType: "audio/mp3",
                    fileName: `audio_ia_${Date.now()}.mp3`,
                    externalKey: `ai_audio_${Date.now()}`,
                    isClosed: false
                })
            });

            if (!audioResponse.ok) {
                console.error('[Promp] Audio Send Failed:', await audioResponse.text());
            } else {
                console.log('[Promp] Audio Sent Successfully');
            }
        } catch (e) {
            console.error('[Promp] Audio Exception:', e);
        }
    }

    return true;
};

// --- TAGS MANAGEMENT (IA Autotagging) ---

export const getPrompTags = async (config) => {
    if (!config.prompUuid || !config.prompToken) return [];

    try {
        const url = `${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}/listTags?isActive=true`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${config.prompToken}` }
        });

        // A API retorna um objeto que contém o array 'tags'
        return response.data?.tags || [];
    } catch (error) {
        console.error('[Promp] Failed to List Tags:', error.response?.data || error.message);
        return [];
    }
};

export const applyPrompTag = async (config, ticketId, tagId) => {
    if (!config.prompUuid || !config.prompToken || !ticketId || !tagId) return false;

    try {
        // Usar endpoint /addTag para somar tag ao ticket existente
        const url = `${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}/addTag`;
        const payload = {
            ticketId: Number(ticketId),
            tagId: Number(tagId)
        };

        console.log(`[Promp] Applying Tag ${tagId} to Ticket ${ticketId}...`);

        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${config.prompToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('[Promp] Tag Applied Successfully:', response.data);
        return true;
    } catch (error) {
        console.error('[Promp] Failed to Apply Tag:', error.response?.data || error.message);
        return false;
    }
};
