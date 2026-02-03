import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'; // In production use .env

const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Serve Static Frontend (Vite Build)
app.use(express.static(path.join(__dirname, '../dist')));


// --- Auth Routes ---

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, companyId: user.companyId, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                companyId: user.companyId
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, email: true, role: true, companyId: true, company: true }
        });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user' });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Senha atual incorreta' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.json({ success: true, message: 'Senha alterada com sucesso' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Erro ao alterar senha' });
    }
});



// --- Admin Routes ---

const authenticateAdmin = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Acesso negado' });
        }
        next();
    });
};

app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const [users, companies, configs] = await Promise.all([
            prisma.user.count(),
            prisma.company.count(),
            prisma.agentConfig.count()
        ]);
        res.json({ users, companies, configs });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar estatísticas' });
    }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                company: { select: { id: true, name: true } }
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar usuários' });
    }
});

app.post('/api/admin/users', authenticateAdmin, async (req, res) => {
    const { email, password, companyName, role } = req.body;

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(400).json({ message: 'Email já cadastrado' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const company = await prisma.company.create({ data: { name: companyName || 'Nova Empresa' } });

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role: role || 'USER',
                companyId: company.id
            }
        });

        res.json({ success: true, user: { id: user.id, email: user.email } });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ message: 'Erro ao criar usuário' });
    }
});

app.put('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { password, role, companyName } = req.body;

    try {
        const updates = {};
        if (password) updates.password = await bcrypt.hash(password, 10);
        if (role) updates.role = role;

        if (Object.keys(updates).length > 0) {
            await prisma.user.update({
                where: { id },
                data: updates
            });
        }

        if (companyName) {
            const user = await prisma.user.findUnique({ where: { id } });
            await prisma.company.update({
                where: { id: user.companyId },
                data: { name: companyName }
            });
        }

        res.json({ success: true, message: 'Usuário atualizado' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar usuário' });
    }
});


// --- Configuration Routes (Protected) ---

// Helper to get config from DB
const getCompanyConfig = async (companyId) => {
    const config = await prisma.agentConfig.findUnique({
        where: { companyId }
    });

    if (!config) return null;

    // Parse JSON fields
    return {
        ...config,
        persona: config.persona ? JSON.parse(config.persona) : undefined,
        integrations: config.integrations ? JSON.parse(config.integrations) : undefined,
        products: config.products ? JSON.parse(config.products) : undefined,
    };
};

app.post('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const newConfig = req.body;

    try {
        const currentConfig = await prisma.agentConfig.findUnique({ where: { companyId } });

        // Merge Voice settings into Integrations for storage
        // The frontend sends 'integrations' (LLM keys) and 'voice' (Audio settings) separately.
        // We store them together in the 'integrations' JSON column.
        let combinedIntegrations = newConfig.integrations || {};
        if (newConfig.voice) {
            combinedIntegrations = { ...combinedIntegrations, ...newConfig.voice };
        }

        const data = {
            companyId,
            systemPrompt: newConfig.systemPrompt,
            persona: newConfig.persona ? JSON.stringify(newConfig.persona) : undefined,
            integrations: JSON.stringify(combinedIntegrations),
            products: newConfig.products ? JSON.stringify(newConfig.products) : undefined,
        };

        const updatedConfig = await prisma.agentConfig.upsert({
            where: { companyId },
            update: data,
            create: data,
        });

        // Save History if systemPrompt changed
        if (currentConfig && currentConfig.systemPrompt !== newConfig.systemPrompt && newConfig.systemPrompt && currentConfig.systemPrompt) {
            await prisma.promptHistory.create({
                data: {
                    agentConfigId: updatedConfig.id,
                    systemPrompt: currentConfig.systemPrompt
                }
            });
        }

        res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({ success: false, message: 'Failed to save configuration' });
    }
});

app.get('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    try {
        const config = await getCompanyConfig(companyId);
        res.json(config || {});
    } catch (error) {
        console.error('Error fetching config:', error);
        res.status(500).json({ message: 'Error fetching config' });
    }
});

// --- REUSABLE CHAT LOGIC ---
const processChatResponse = async (config, message, history, sessionId = null) => {
    if (!config || !config.integrations?.openaiKey) {
        throw new Error('OpenAI API Key not configured');
    }

    const openai = new OpenAI({ apiKey: config.integrations.openaiKey });

    let systemPrompt = config.systemPrompt || "Você é um assistente virtual útil.";

    // Inject Products
    if (config.products && config.products.length > 0) {
        let productList = "";
        config.products.forEach(p => {
            // Parent Product Line
            productList += `- [PRODUTO PAI] ID: ${p.id} | Nome: ${p.name} | Preço Base: R$ ${p.price}. Descrição: ${p.description || ''}\n`;

            // Variations
            if (p.variantItems && p.variantItems.length > 0) {
                p.variantItems.forEach(v => {
                    productList += `  -- [VARIAÇÃO] ID: ${v.id} | Nome: ${p.name} (${v.color || ''} ${v.size || ''}) | Cor: ${v.color || 'N/A'} | Tamanho: ${v.size || 'N/A'} | Preço: R$ ${v.price || p.price} | ${v.image ? '[TEM_IMAGEM]' : ''}\n`;
                });
            } else {
                // Legacy or Simple Product
                productList += `  -- [ITEM ÚNICO] ID: ${p.id} | ${p.image ? '[TEM_IMAGEM]' : ''} (Use este ID para vender o produto base)\n`;
            }
        });

        systemPrompt += `\n\nCONTEXTO DE PRODUTOS DISPONÍVEIS:\n${productList}\n\nINSTRUÇÃO DE IMAGEM (PRIORIDADE MÁXIMA): Se o usuário pedir foto de um produto que tenha a flag [TEM_IMAGEM], você DEVE responder EXATAMENTE assim: "[SHOW_IMAGE: ID_DA_VARIAÇÃO] Aqui está a foto que pediu!".\nIMPORTANTE: Use o ID específico da VARIAÇÃO (ex: var_12345) se o cliente especificou cor/tamanho.`;
    }

    // Humanization & Memory Control
    systemPrompt += `\n\nDIRETRIZES DE HUMANIZAÇÃO (CRÍTICO):
        1. NATURALIDADE EXTREMA: Aja como um humano conversando no WhatsApp. Use linguagem fluida, pode abreviar (vc, tbm) se o tom permitir.
        2. PROIBIDO ROBOTISMO: JAMAIS termine frases com 'Posso ajudar em algo mais?', 'Se precisar estou aqui'. ISSO É PROIBIDO.
        3. DIRETO AO PONTO: Responda a pergunta e pronto. Não enrole.
        4. IMAGENS: Se tiver [TEM_IMAGEM], Mande a tag [SHOW_IMAGE: ID].`;

    // Strict Anti-Repetition logic if history exists
    if (history && history.length > 0) {
        systemPrompt += `\n\nATENÇÃO: Este é um diálogo em andamento. NÃO CUMPRIMENTE o usuário novamente.
        CRÍTICO: Não ofereça ajuda extra no final da mensagem. Apenas responda.`;

        systemPrompt += `\n\nDIRETRIZES DE CONTINUIDADE (IMPORTANTE):
        1. MEMÓRIA DE CURTO PRAZO: Ao responder, LEIA O HISTÓRICO RECENTE para identificar sobre qual produto o cliente está falando.
        2. FOCO NO PRODUTO ATUAL: Se o cliente perguntar "tem outras cores?" ou "qual o preço?", refira-se ao MESMO produto discutido nas mensagens anteriores.
        3. NÃO ALUCINE: Nunca traga informações de um produto diferente (ex: iPhone) se estamos falando de outro (ex: Camisa), a menos que o cliente mude de assunto explicitamente.`;
    }

    console.log('[Chat] System Prompt Context:', systemPrompt); // DEBUG

    // Prepare Messages (History + System)
    let messages = [{ role: "system", content: systemPrompt }];

    if (Array.isArray(history) && history.length > 0) {
        const cleanHistory = history.map(h => ({
            role: h.role === 'user' || h.role === 'assistant' ? h.role : 'user',
            content: h.content || ''
        }));
        messages = [...messages, ...cleanHistory];
    }

    // Add current user message
    messages.push({ role: "user", content: message });

    const completion = await openai.chat.completions.create({
        messages: messages,
        model: "gpt-4o-mini", // Better & Cheaper than 3.5-turbo
    });

    let aiResponse = completion.choices[0].message.content;

    // --- Image Detection Logic ---
    let productImageUrl = null;
    let productCaption = ""; // Initialize caption
    const imageMatch = aiResponse.match(/\[SHOW_IMAGE:\s*([a-zA-Z0-9_-]+)\]/); // Support alphanum IDs

    if (imageMatch && config.products) {
        const targetId = imageMatch[1];
        let found = false;

        // Search in Parent Products or Variations
        for (const p of config.products) {
            // Check Parent
            if (String(p.id) === String(targetId)) {
                if (p.image) {
                    productImageUrl = p.image;
                    productCaption = `${p.name} - R$ ${p.price}`;
                    found = true;
                    break;
                }
            }

            // Check Variations
            if (p.variantItems) {
                const variant = p.variantItems.find(v => String(v.id) === String(targetId));
                if (variant && variant.image) {
                    productImageUrl = variant.image;
                    const details = [variant.color, variant.size].filter(Boolean).join(' / ');
                    productCaption = `${p.name} - ${details} - R$ ${variant.price || p.price}`;
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            console.log(`[Chat] Found Product/Variant Image for ID ${targetId}: ${productImageUrl}`);
            console.log(`[Chat] Caption: ${productCaption}`);
        } else {
            console.log(`[Chat] Image requested for ID ${targetId} but not found.`);
        }

        // Remove the tag from the text displayed to user
        aiResponse = aiResponse.replace(/\[SHOW_IMAGE:\s*[a-zA-Z0-9_-]+\]/g, '').trim();
    }

    // --- Audio Generation Logic ---
    let audioBase64 = null;
    const integrator = config.integrations || {};
    const isVoiceEnabled = integrator.enabled === true || integrator.enabled === 'true';

    if (isVoiceEnabled && integrator.elevenLabsKey) {
        let shouldGenerate = true;

        // Probability Check
        if (integrator.responseType === 'percentage') {
            const probability = parseInt(integrator.responsePercentage || 50, 10);
            const randomVal = Math.random() * 100;
            if (randomVal > probability) {
                shouldGenerate = false;
                console.log(`Audio skipped by probability: ${randomVal.toFixed(0)} > ${probability}`);
            }
        } else if (integrator.responseType === 'audio_only') {
            shouldGenerate = false; // Simplified logic for now
        }

        if (shouldGenerate) {
            try {
                let voiceId = integrator.voiceId || integrator.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';

                // Fallback for Agent IDs
                if (voiceId.startsWith('agent_')) {
                    console.warn(`Invalid Voice ID for TTS detected (${voiceId}). Falling back to default 'Rachel'.`);
                    voiceId = '21m00Tcm4TlvDq8ikWAM';
                }

                const responseStream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                    method: 'POST',
                    headers: {
                        'xi-api-key': integrator.elevenLabsKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        text: aiResponse,
                        model_id: "eleven_multilingual_v2", // Updated for Portuguese support
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75
                        }
                    })
                });

                if (responseStream.ok) {
                    const arrayBuffer = await responseStream.arrayBuffer();
                    audioBase64 = Buffer.from(arrayBuffer).toString('base64');
                } else {
                    console.error('ElevenLabs API Error:', await responseStream.text());
                }
            } catch (audioError) {
                console.error('Audio Generation Error:', audioError);
            }
        }
    }

    return { aiResponse, audioBase64, productImageUrl, productCaption };
};

// --- Config History Routes ---
app.get('/api/config/history', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    try {
        const config = await prisma.agentConfig.findUnique({ where: { companyId } });
        if (!config) return res.json([]);

        const history = await prisma.promptHistory.findMany({
            where: { agentConfigId: config.id },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        res.json(history);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar histórico' });
    }
});

app.post('/api/config/restore', authenticateToken, async (req, res) => {
    const { historyId } = req.body;
    const companyId = req.user.companyId;

    try {
        const historyItem = await prisma.promptHistory.findUnique({ where: { id: historyId } });
        if (!historyItem) return res.status(404).json({ message: 'Versão não encontrada' });

        await prisma.agentConfig.update({
            where: { companyId },
            data: { systemPrompt: historyItem.systemPrompt }
        });

        res.json({ success: true, message: 'Prompt restaurado com sucesso' });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao restaurar versão' });
    }
});

app.get('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    try {
        const config = await getCompanyConfig(companyId);
        res.json(config || {});
    } catch (error) {
        console.error('Error fetching config:', error);
        res.status(500).json({ message: 'Error fetching config' });
    }
});



// --- Chat Endpoint (Protected - Panel Test) ---
app.post('/api/chat', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const { message, history, systemPrompt: overridePrompt, useConfigPrompt = true } = req.body;

    if (!message) return res.status(400).json({ error: 'Message required' });

    try {
        const config = await getCompanyConfig(companyId);

        // Allow override for Test Panel
        if (!useConfigPrompt && overridePrompt) {
            config.systemPrompt = overridePrompt;
        }

        const { aiResponse, audioBase64, productImageUrl } = await processChatResponse(config, message, history, null);

        // Persist Chat (Test Mode - No Session)
        try {
            await prisma.testMessage.create({ data: { companyId, sender: 'user', text: message } });
            await prisma.testMessage.create({ data: { companyId, sender: 'ai', text: aiResponse } });
        } catch (dbError) {
            console.error('Failed to save chat history:', dbError);
        }

        res.json({ response: aiResponse, audio: audioBase64, image: productImageUrl });

    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: error.message || 'Error processing chat' });
    }
});

app.get('/api/chat/history', authenticateToken, async (req, res) => {
    try {
        const history = await prisma.testMessage.findMany({
            where: { companyId: req.user.companyId },
            orderBy: { createdAt: 'asc' }, // Oldest first
            take: 50 // Limit to last 50
        });

        // Map to frontend format
        const formatted = history.map(h => ({
            id: h.id, // String UUID
            sender: h.sender,
            text: h.text
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ message: 'Failed to fetch history' });
    }
});


// --- PROMP API INTEGRATION ---

const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';
// MUST be set in .env on the server
const PROMP_ADMIN_TOKEN = process.env.PROMP_ADMIN_TOKEN;

const sendPrompMessage = async (config, number, text, audioBase64, imageUrl, caption) => {
    if (!config.prompUuid || !config.prompToken) {
        console.log('[Promp] Skipping external API execution (Credentials missing).');
        return false;
    }

    // Removing '55' prefix if exists (Promp API usually handles it, or check documentation)
    // Postman doc example: "5515998566622". Okay, keep it.

    // 1. Send Text (ONLY if no audio, to avoid duplication)
    if (!audioBase64) {
        try {
            console.log(`[Promp] Sending Text to ${number}...`);
            const textResponse = await fetch(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.prompToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    number: number,
                    body: text,
                    externalKey: `ai_${Date.now()}`,
                    isClosed: false
                })
            });

            if (!textResponse.ok) {
                console.error('[Promp] Text Send Failed:', await textResponse.text());
            }
        } catch (e) {
            console.error('[Promp] Text Exception:', e);
        }
    } else {
        console.log(`[Promp] Skipping text message because audio is being sent.`);
    }

    // 2. Send Image (Hybrid: URL vs Base64 vs Local File)
    if (imageUrl) {
        try {
            let finalImageUrl = imageUrl.trim();
            const isDataUri = finalImageUrl.startsWith('data:');
            const isHttpUrl = finalImageUrl.startsWith('http://') || finalImageUrl.startsWith('https://');

            console.log(`[Promp] Processing Image. Type: ${isDataUri ? 'Base64' : (isHttpUrl ? 'Remote URL' : 'Local File')}`);
            console.log(`[Promp] Raw Image String (First 50 chars): ${finalImageUrl.substring(0, 50)}...`);

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
                console.log(`[Promp] Sending via /url endpoint: ${finalImageUrl}`);
                const imgResponse = await fetch(`${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}/url`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.prompToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        number: number,
                        body: caption || "",
                        mediaUrl: finalImageUrl,
                        externalKey: `ai_img_${Date.now()}`
                    })
                });

                if (!imgResponse.ok) {
                    const errRes = await imgResponse.text();
                    console.error('[Promp] Image URL Send Failed:', errRes);
                } else {
                    console.log('[Promp] SUCCESS: Image sent via URL endpoint.');
                }

            } else {
                // --- CASE C: Local File Path ---
                // Try to resolve path relative to project root or use absolute path
                // config/index.js is in 'server', so project root is '..'
                // But better to check absolute first.

                try {
                    let filePath = finalImageUrl;
                    // If relative, assume relative to project root NOT server dir 
                    // (images usually in stored in public or uploads at root)
                    if (!path.isAbsolute(filePath)) {
                        filePath = path.join(__dirname, '..', filePath);
                    }

                    console.log(`[Promp] Handling Local File: ${filePath}`);

                    // define mimeType mapping
                    const ext = path.extname(filePath).toLowerCase().replace('.', '');
                    const mimeTypes = {
                        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                        'png': 'image/png', 'gif': 'image/gif',
                        'webp': 'image/webp'
                    };
                    const mimeType = mimeTypes[ext] || 'application/octet-stream';

                    const fileBuffer = await fs.readFile(filePath);
                    const base64Data = fileBuffer.toString('base64');
                    const fileName = path.basename(filePath);

                    console.log(`[Promp] Local file read success. Size: ${base64Data.length}. Sending via /base64...`);
                    await sendBase64Image(config, number, base64Data, mimeType, fileName, caption);

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
        // We need to upload file or send as base64. 
        // Postman "SendMessageAPITextBase64" endpoint exists: /base64
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
                    body: "Áudio da IA", // Caption
                    base64Data: audioBase64,
                    mimeType: "audio/mp3", // ElevenLabs output
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

app.post('/api/promp/connect', authenticateToken, async (req, res) => {
    // SessionID manual input support
    const { identity, sessionId } = req.body;
    const companyId = req.user.companyId;

    if (!PROMP_ADMIN_TOKEN) {
        return res.status(500).json({ message: 'Server misconfiguration: PROMP_ADMIN_TOKEN missing' });
    }

    try {
        console.log(`[Promp] Auto-connecting for identity: ${identity} (Manual Session: ${sessionId || 'No'})`);

        // 1. List Tenants to get IDs
        const tenantsRes = await fetch(`${PROMP_BASE_URL}/tenantApiListTenants`, {
            headers: { 'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}` }
        });

        if (!tenantsRes.ok) throw new Error('Failed to list tenants');

        const tenantsData = await tenantsRes.json();
        const tenantListBasic = Array.isArray(tenantsData) ? tenantsData : (tenantsData.tenants || tenantsData.data || []);

        console.log(`[Promp] Checking ${tenantListBasic.length} tenants for identity (Parallel Fetch)...`);

        // 2. Parallel Fetch Details (identity is only in detailed view)
        const detailPromises = tenantListBasic.map(async (t) => {
            try {
                const res = await fetch(`${PROMP_BASE_URL}/tenantApiShowTenant`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: t.id })
                });
                if (!res.ok) return null;
                const json = await res.json();
                const tenantObj = Array.isArray(json.tenant) ? json.tenant[0] : json.tenant;
                return tenantObj || json;
            } catch (e) {
                return null;
            }
        });

        const detailedTenants = await Promise.all(detailPromises);

        // Exact match on identity string (Sanitized)
        const sanitize = (str) => String(str || '').replace(/\D/g, '');
        const targetIdentity = sanitize(identity);

        const targetTenant = detailedTenants.find(t => t && sanitize(t.identity) === targetIdentity);

        if (!targetTenant) {
            console.log('[Promp] Available Identities:', detailedTenants.map(t => t?.identity).join(', '));
            return res.status(404).json({ message: 'Tenant não encontrado na Promp com esta identidade.' });
        }

        console.log(`[Promp] Found Tenant: ${targetTenant.name} (ID: ${targetTenant.id})`);

        // 3. Create API (Best Effort)
        const apiName = "Agente IA Auto";

        // Priority: Manual Session ID > Tenant ID (Fallback)
        // If manual sessionId is provided, use it blindly.
        // If not, use tenant.id (which failed before, but is the best guess if no other option).
        const finalSessionId = sessionId || targetTenant.id;

        const createApiRes = await fetch(`${PROMP_BASE_URL}/tenantCreateApi`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: apiName,
                sessionId: finalSessionId,
                userId: targetTenant.adminId || 1,
                authToken: Math.random().toString(36).substring(7),
                tenant: targetTenant.id
            })
        });

        let apiData = await createApiRes.json();

        if (!createApiRes.ok || !apiData.id) {
            console.error('[Promp] API Create Failed:', JSON.stringify(apiData));
            return res.status(400).json({
                message: `Falha ao criar API Key (Sessão inválida?). Tente informar o ID da Sessão/Conexão manualmente no campo ao lado.`
            });
        }

        // SAVE TO DB
        await prisma.agentConfig.update({
            where: { companyId },
            data: {
                prompIdentity: identity,
                prompUuid: apiData.id,
                prompToken: apiData.token
            }
        });

        res.json({ success: true, message: `Conectado a ${targetTenant.name}` });

    } catch (error) {
        console.error('Promp Connect Error:', error);
        res.status(500).json({ message: error.message || 'Erro ao conectar com Promp' });
    }
});


// --- Webhook Integration (Public) ---
app.post('/webhook/:companyId', async (req, res) => {
    const { companyId } = req.params;
    const payload = req.body; // n8n payload

    console.log(`[Webhook] Received for company ${companyId}:`, JSON.stringify(payload, null, 2));

    // Validate Payload & Ignore "fromMe" (Sent by us/AI)
    const isFromMe = payload.key?.fromMe || payload.fromMe || payload.data?.key?.fromMe;

    if (isFromMe) {
        console.log('[Webhook] Ignoring message sent by me (fromMe=true).');
        return res.json({ status: 'ignored_from_me' });
    }

    // Check for Status Updates (Delivery, Read) - Ignore them
    if (payload.type === 'message_status' || payload.status || (payload.messageType && payload.messageType !== 'conversation' && payload.messageType !== 'extendedTextMessage')) {
        // Be careful not to ignore text if type is missing, but usually type='message_status' is clear.
        if (payload.type === 'message_status') {
            console.log('[Webhook] Ignoring status update.');
            return res.json({ status: 'ignored_status_update' });
        }
    }

    // Safety Check for Content
    // Wuzapi: payload.data.message.conversation OR payload.content.text
    let userMessage = payload.content?.text || payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text;

    if (!userMessage) {
        // If it's a media message or something else we don't support yet, ignore gracefully
        console.log('[Webhook] Payload missing text content. Ignoring.');
        return res.json({ status: 'ignored_no_text' });
    }

    // Support both N8N structure (ticket.id), Wuzapi (wuzapi.id), and pure Promp structure
    const sessionId = payload.ticket?.id || payload.wuzapi?.id || (payload.classes && payload.classes.length > 0 ? payload.classes[0] : null) || null;
    const senderNumber = payload.key?.remoteJid || payload.contact?.number || payload.number || payload.data?.key?.remoteJid;

    // Clean Sender Number if it has @s.whatsapp.net
    const cleanNumber = senderNumber ? String(senderNumber).replace('@s.whatsapp.net', '') : null;

    if (!cleanNumber) {
        console.log('[Webhook] No specific sender number found. Ignoring.');
        return res.json({ status: 'ignored_no_number' });
    }

    const metadata = JSON.stringify(payload);

    try {
        const config = await getCompanyConfig(companyId);
        if (!config) return res.status(404).json({ error: 'Company config not found. Check ID.' });

        console.log(`[Webhook] Processing message for ${cleanNumber}: "${userMessage.substring(0, 50)}..."`);

        // Fetch History
        let history = [];

        // STRATEGY: Try fetching by sessionId. If fails (or sessionId null), try fetching by senderNumber (via metadata or new field... but metadata is lazy).
        // Let's rely on sessionId first. If sessionId is missing, we MIGHT lose history.
        // However, if the webhook provides ticket.id (which it seems to), we are good.
        // Issue: Previous logs show ticket.id changing.
        // Fallback: Query by metadata contains senderNumber? No, too slow.
        // Fix: Use sessionId (ticket.id) if available. If ticket.id IS available, trust it.
        // If ticket.id changes, it might be a new ticket/support case.
        // BUT, for a persistent AI, we might want to fetch history by 'sender' NOT 'sessionId'.
        // Let's Try: Find messages where companyId matches and metadata CONTAINS cleanNumber. (Slow regex)
        // BETTER: Use 'sessionId' field in DB to store 'cleanNumber' as a fallback identifier if ticket ID is unstable?
        // NO, 'sessionId' is for ticket grouping.
        // Let's stick to sessionId for now but improve the lookup debugging.

        let lookupId = sessionId ? String(sessionId) : null;

        // Hack for Promp/Uazapi: If ticket ID changes effectively, maybe we should use the phone number as the session ID for the AI memory?
        // If we use cleanNumber as sessionId, memory persists across tickets!
        // This solves "New Ticket = Context Loss".
        // Let's try using cleanNumber as the memory key primarily, OR combine them.
        // DECISION: Use cleanNumber as the 'sessionId' for AI memory purposes (DB storage).
        // This ensures the AI remembers the user regardless of the support ticket status.
        const dbSessionId = cleanNumber; // Using Phone Number as Session ID for persistence

        if (dbSessionId) {
            const storedMessages = await prisma.testMessage.findMany({
                where: { companyId, sessionId: String(dbSessionId) },
                orderBy: { createdAt: 'asc' },
                take: 20
            });
            history = storedMessages.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text
            }));
            console.log(`[Webhook] Fetched ${history.length} msgs of history for ${dbSessionId}`);
        }

        // Process Chat
        // Pass dbSessionId to processChatResponse if needed, but we don't really use it there except for logging.
        const { aiResponse, audioBase64, productImageUrl, productCaption } = await processChatResponse(config, userMessage, history, dbSessionId);

        console.log(`[Webhook] AI Response generated: "${aiResponse.substring(0, 50)}..."`);

        // Persist Chat
        try {
            await prisma.testMessage.create({
                data: { companyId, sender: 'user', text: userMessage, sessionId: String(dbSessionId), metadata }
            });
            await prisma.testMessage.create({
                data: { companyId, sender: 'ai', text: aiResponse, sessionId: String(dbSessionId) }
            });
        } catch (dbError) {
            console.error('[Webhook] Failed to save chat:', dbError);
        }

        // --- REPLY STRATEGY ---
        let sentViaApi = false;
        if (config.prompUuid && config.prompToken) {
            sentViaApi = await sendPrompMessage(config, cleanNumber, aiResponse, audioBase64, productImageUrl, productCaption);
            console.log(`[Webhook] Sent via API: ${sentViaApi}`);
        } else {
            console.log('[Webhook] Config missing prompUuid/Token. Falling back to JSON response.');
        }

        if (sentViaApi) {
            res.json({ status: 'sent_via_api' });
        } else {
            res.json({
                text: aiResponse,
                audio: audioBase64,
                image: productImageUrl,
                sessionId: sessionId
            });
        }

    } catch (error) {
        console.error('[Webhook] Error:', error);
        res.status(500).json({ error: error.message || 'Processing failed' });
    }
});

// Handle React Routing (SPA) - must be the last route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
