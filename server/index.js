import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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



// --- Chat Endpoint (Protected) ---
app.post('/api/chat', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const { message, history, systemPrompt: overridePrompt, useConfigPrompt = true } = req.body;

    if (!message) return res.status(400).json({ error: 'Message required' });

    try {
        const config = await getCompanyConfig(companyId);

        if (!config || !config.integrations?.openaiKey) {
            return res.status(400).json({ error: 'OpenAI API Key not configured' });
        }

        const openai = new OpenAI({ apiKey: config.integrations.openaiKey });

        let systemPrompt = config.systemPrompt;
        if (!useConfigPrompt && overridePrompt) {
            systemPrompt = overridePrompt;
        }
        if (!systemPrompt) {
            systemPrompt = "Você é um assistente virtual útil.";
        }

        if (config.products && config.products.length > 0) {
            const productList = config.products.map(p =>
                `- ${p.name}: R$ ${p.price} (ID: ${p.id}). ${p.description || ''} ${p.image ? '[TEM_IMAGEM]' : ''}`
            ).join('\n');
            systemPrompt += `\n\nCONTEXTO DE PRODUTOS DISPONÍVEIS:\n${productList}\n\nINSTRUÇÃO IMPORTANTE: Se o usuário pedir para ver uma foto ou imagem de um produto e ele tiver a flag [TEM_IMAGEM], responda EXATAMENTE com a tag: [SHOW_IMAGE: ID_DO_PRODUTO]. Exemplo: [SHOW_IMAGE: 12345]. Não invente links.`;
        }

        systemPrompt += `\n\nDIRETRIZES DE HUMANIZAÇÃO (CRÍTICO):
        1. NATURALIDADE: Aja como um humano. NÃO inicie todas as respostas com cumprimentos (Olá, Tudo bem, etc) se a conversa já está fluindo. Seja direto.
        2. MEMÓRIA: Você tem acesso ao histórico da conversa. Use-o para manter a continuidade.
        3. CONCISÃO: Evite textos longos e robóticos, a menos que necessário.`;

        let messages = [{ role: "system", content: systemPrompt }];
        if (Array.isArray(history) && history.length > 0) {
            const cleanHistory = history.map(h => ({
                role: h.role === 'user' || h.role === 'assistant' ? h.role : 'user',
                content: h.content || ''
            }));
            messages = [...messages, ...cleanHistory];
        } else {
            messages.push({ role: "user", content: message });
        }

        const completion = await openai.chat.completions.create({
            messages: messages,
            model: "gpt-3.5-turbo",
        });

        const aiResponse = completion.choices[0].message.content;

        // Persist Chat
        try {
            await prisma.testMessage.create({
                data: { companyId, sender: 'user', text: message }
            });
            await prisma.testMessage.create({
                data: { companyId, sender: 'ai', text: aiResponse }
            });
        } catch (dbError) {
            console.error('Failed to save chat history:', dbError);
        }

        let audioBase64 = null;

        // --- Audio Generation Logic ---
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
                // If the user didn't send audio (which we can't detect yet properly in this text endpoint, assumes text input),
                // we might skip. But for now, let's treat "audio_only" as "Always" for text chats or implement logic if we had audio input.
                // Re-reading Settings.jsx: "Responder em áudio apenas quando o cliente enviar áudio".
                // Since our input is text, we should probably SKIP if this mode is on.
                // But typically users testing want to hear it. Let's strictly follow the rule:
                // If input was text, do not generate.
                // However, the test interface sends text.
                // Let's assume for TEST AI we force generation or respect the rule?
                // Stick to the rule: if audio_only, skip.
                shouldGenerate = false;
                console.log('Audio skipped: Mode is Audio Only and input was Text.');
            }

            // Correction: For TestAI, maybe we want to force it?
            // The user said "100% of messages". That's the percentage slider.

            if (shouldGenerate) {
                console.log('Attempting ElevenLabs generation...');
                try {
                    let voiceId = integrator.voiceId || integrator.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';

                    // Fallback for Agent IDs (which don't work with TTS)
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
                            text: aiResponse.replace(/\[SHOW_IMAGE:\s*\d+\]/g, ''),
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
                        console.log('Audio generated successfully.');
                    } else {
                        const errorText = await responseStream.text();
                        console.error('ElevenLabs API Error:', errorText);
                    }
                } catch (audioError) {
                    console.error('Audio Generation Error:', audioError);
                }
            }
        } else {
            if (!isVoiceEnabled) console.log('Audio disabled in settings.');
            else if (!integrator.elevenLabsKey) console.log('ElevanLabs Key missing.');
        }

        res.json({
            response: aiResponse,
            audio: audioBase64
        });

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


// --- Webhook Endpoint ---

// Webhook currently needs a way to identify the company.
// For now, I'll allow passing ?companyId=... or assume a single user scenario for simplicity if not provided,
// BUT since we mandated multi-tenancy, we must know the company.
// Option: Pass API Key or Company ID in payload.
// Let's assume the webhook URL is /webhook?key=COMPANY_ID or similar.
// Actually, let's use the 'User' contact info or just try to find ANY config if we want to be lax, but that's bad.
// Proper way: /webhook/:companyId
app.post('/webhook/:companyId?', async (req, res) => {
    try {
        const companyIdParam = req.params.companyId;

        // Validation: If no companyId in URL, we can't serve.
        // However, for backward compatibility with the user's previous "single tenant" setup, 
        // we might fallback to the first company found? No, better to be strict.

        let targetCompanyId = companyIdParam;

        if (!targetCompanyId) {
            // Fallback for demo: Try to find the "Promp Admin" company
            const adminCo = await prisma.company.findFirst({ where: { name: 'Promp Admin' } });
            if (adminCo) targetCompanyId = adminCo.id;
        }

        if (!targetCompanyId) {
            return res.status(400).json({ error: 'Company ID required in URL: /webhook/:companyId' });
        }

        console.log(`Webhook received for company: ${targetCompanyId}`);
        console.log('Webhook Body:', JSON.stringify(req.body, null, 2));

        const payload = Array.isArray(req.body) ? req.body[0] : req.body;
        const body = payload.body || {};
        const content = body.content || {};
        const contact = body.contact || {};

        const userMessage = content.text;

        if (!userMessage) {
            return res.status(400).json({ error: 'No message text found' });
        }

        // Load Company Config
        const config = await getCompanyConfig(targetCompanyId);

        if (!config || !config.integrations?.openaiKey) {
            console.error('OpenAI Key not configured for this company');
            return res.status(500).json({ error: 'OpenAI API Key not configured for this company' });
        }

        // Initialize OpenAI
        const openai = new OpenAI({
            apiKey: config.integrations.openaiKey,
        });

        // Construct System Prompt
        let systemPrompt = config.systemPrompt;

        if (!systemPrompt) {
            const persona = config.persona || {};
            systemPrompt = `Você é ${persona.name || 'Assistente'}, um ${persona.role || 'assistente helpful'}.`;
        }

        // Inject Products
        if (config.products && config.products.length > 0) {
            const productList = config.products.map(p =>
                `- ${p.name}: R$ ${p.price} (ID: ${p.id}). ${p.description || ''}`
            ).join('\n');
            systemPrompt += `\n\nPRODUTOS DISPONÍVEIS:\n${productList}`;
        }

        console.log('Calling OpenAI...');

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            model: "gpt-3.5-turbo",
        });

        const aiResponse = completion.choices[0].message.content;
        console.log('AI Response:', aiResponse);

        res.json({
            response: aiResponse,
            original_message: userMessage
        });

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Handle React Routing (SPA) - must be the last route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
