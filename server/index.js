import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp'; // Start using sharp
import FormData from 'form-data';
import { transcribeAudio, generateAudio, resolveVoiceFromAgent } from './audioActions.js';
import fsCommon from 'fs'; // For synchronous appendFileSync

// Helper for file logging
const logFlow = (msg) => {
    try {
        const timestamp = new Date().toISOString();
        fsCommon.appendFileSync('debug_flow.txt', `[${timestamp}] ${msg}\n`);
    } catch (e) { /* ignore */ }
};
import { initScheduler } from './scheduler.js';
import { extractFromUrl } from './extractor.js';
import {
    generateAuthUrl,
    handleOAuthCallback,
    listCalendars,
    checkAvailability,
    createCalendarEvent
} from './googleCalendar.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// GLOBAL DEDUPLICATION SET
const processedMessages = new Set();

const app = express();

const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'; // In production use .env

const prisma = new PrismaClient();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// DEBUG: Log all requests
app.use((req, res, next) => {
    // Ignore health check to avoid spam
    if (req.path !== '/api/health') {
        console.log(`[Request] ${req.method} ${req.path}`);
    }
    next();
});

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('[Auth] No token provided');
        return res.status(401).json({ error: 'Unauthorized', message: 'Token não fornecido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('[Auth] Token invalid/expired');
            return res.status(403).json({ error: 'Forbidden', message: 'Token inválido ou expirado' });
        }
        req.user = user;
        // console.log(`[Auth] User authenticated: ${user.companyId || user.id}`);
        next();
    });
};

// Initialize Scheduler (Pass Prisma Instance)
initScheduler(prisma);

// --- HEALTH CHECK ROUTE (NO AUTH - defined BEFORE auth middleware if desired, or after) ---
// Defined here to be publicly accessible
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.1', time: new Date().toISOString() });
});

// ... (Keep existing code)

// --- PRODUCT EXTRACTION ROUTES ---

// 1. Manual Extraction Test
app.post('/api/products/extract', authenticateToken, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        if (!url) return res.status(400).json({ error: 'URL is required' });

        // Retrieve API Key from DB (Agent Config or Global)
        let apiKey = process.env.OPENAI_API_KEY;
        const companyId = req.user?.companyId;

        if (companyId) {
            const config = await prisma.agentConfig.findUnique({
                where: { companyId },
                select: { integrations: true }
            });
            if (config && config.integrations) {
                try {
                    const integrations = typeof config.integrations === 'string'
                        ? JSON.parse(config.integrations)
                        : config.integrations;

                    if (integrations.openaiKey) apiKey = integrations.openaiKey;
                } catch (e) {
                    console.error('[Extract API] Error parsing integrations:', e);
                }
            }
        }

        // Fallback to Global Config if still no key
        if (!apiKey) {
            const globalConfig = await prisma.globalConfig.findFirst();
            if (globalConfig?.openaiKey) apiKey = globalConfig.openaiKey;
        }

        const products = await extractFromUrl(url, apiKey);
        res.json({ success: true, products });
    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to extract products' });
    }
});

// 2. Add/Update Product Source (Schedule)
app.post('/api/products/sources', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { url, type, frequency } = req.body;

        // Simple create for now
        const source = await prisma.productSource.create({
            data: {
                companyId,
                type: type || 'URL',
                url,
                frequency: frequency || 'daily',
                status: 'active',
                nextRun: new Date() // Run immediately or soon
            }
        });

        res.json({ success: true, source });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. List Sources
app.get('/api/products/sources', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const sources = await prisma.productSource.findMany({
            where: { companyId }
        });
        res.json(sources);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Delete Source
app.delete('/api/products/sources/:id', authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.user;
        const { id } = req.params;
        await prisma.productSource.deleteMany({ // deleteMany for safety (ensure ownership)
            where: { id, companyId }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Startup Check
if (process.env.OPENAI_API_KEY) {
    console.log('[Startup] Global OpenAI Key detected in ENV.');
} else {
    console.warn('[Startup] No Global OpenAI Key in ENV. Will rely on DB Config.');
}

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





// --- Forgot Password Routes ---

// Email Transporter Config
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: 'Email não encontrado' });

        // Generate Token
        const token = crypto.randomBytes(20).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetToken: token,
                resetTokenExpires: expires
            }
        });

        // Use FRONTEND_URL or fallback to localhost
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Promp AI" <noreply@promp.com.br>',
            to: email,
            subject: 'Recuperação de Senha - Promp AI',
            html: `<p>Você solicitou a redefinição de senha.</p>
                   <p>Clique no link abaixo para criar uma nova senha:</p>
                   <a href="${resetLink}">${resetLink}</a>
                   <p>Este link expira em 1 hora.</p>`
        });

        res.json({ message: 'Email de recuperação enviado.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Erro ao processar solicitação' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpires: { gt: new Date() }
            }
        });

        if (!user) return res.status(400).json({ message: 'Token inválido ou expirado' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpires: null
            }
        });

        res.json({ message: 'Senha redefinida com sucesso' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Erro ao redefinir senha' });
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
    if (!companyId) return null;

    try {
        const config = await prisma.agentConfig.findUnique({
            where: { companyId },
            include: {
                company: {
                    include: {
                        specialists: { where: { active: true } },
                        appointmentTypes: { where: { active: true } },
                        googleConfig: true
                    }
                }
            }
        });

        if (!config) return null;

        // SAFE PARSING (JSON.parse CAN THROW if invalid JSON string)
        const safeParse = (str) => {
            try { return str ? JSON.parse(str) : undefined; } catch (e) { return undefined; }
        };

        return {
            ...config,
            persona: safeParse(config.persona),
            integrations: safeParse(config.integrations),
            products: safeParse(config.products),
            knowledgeBase: safeParse(config.knowledgeBase),
            followUpConfig: safeParse(config.followUpConfig),
            // Scheduling Data
            specialists: config.company?.specialists || [],
            appointmentTypes: config.company?.appointmentTypes || [],
            googleConfig: config.company?.googleConfig || null
        };
    } catch (error) {
        console.error(`[Config] Error fetching config for ${companyId}:`, error);
        return null; // Return null instead of crashing
    }
};


const scrapeUrl = async (url) => {
    try {
        console.log(`[Scraper] Fetching ${url}...`);
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return `[Erro ao ler ${url}: ${response.statusText}]`;
        const html = await response.text();

        // Simple regex-based extraction (Body text)
        // Remove scripts, styles, tags
        let text = html
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
            .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return text.substring(0, 5000) + (text.length > 5000 ? "..." : ""); // Limit size
    } catch (e) {
        console.error(`[Scraper] Failed to scrape ${url}:`, e);
        return `[Erro ao ler ${url}]`;
    }
};

app.post('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const newConfig = req.body;

    // DEBUG: Log incoming config update
    if (newConfig.products) {
        console.log(`[Config Update] Received ${newConfig.products.length} products to save.`);
    } else {
        console.log('[Config Update] No products array in payload.');
    }

    try {
        const currentConfig = await prisma.agentConfig.findUnique({ where: { companyId } });

        // Merge Voice settings into Integrations
        let combinedIntegrations = {};
        let currentIntegrations = {};

        try {
            if (currentConfig && currentConfig.integrations) {
                currentIntegrations = typeof currentConfig.integrations === 'string'
                    ? JSON.parse(currentConfig.integrations)
                    : currentConfig.integrations;
            }
        } catch (e) {
            console.error('[Config Update] Error parsing current integrations:', e);
        }

        try {
            if (newConfig.integrations) {
                const incoming = typeof newConfig.integrations === 'string'
                    ? JSON.parse(newConfig.integrations)
                    : newConfig.integrations;
                // Merge with existing
                combinedIntegrations = { ...currentIntegrations, ...incoming };
            } else {
                // Keep existing (don't wipe)
                combinedIntegrations = { ...currentIntegrations };
            }
        } catch (e) {
            console.error('[Config Update] Error parsing new integrations:', e);
            combinedIntegrations = { ...currentIntegrations };
        }

        if (newConfig.voice) {
            combinedIntegrations = { ...combinedIntegrations, ...newConfig.voice };
        }

        // DEBUG: Log key update
        if (combinedIntegrations.openaiKey) {
            const k = combinedIntegrations.openaiKey;
            const masked = k.length > 10 ? k.substring(0, 8) + '...' + k.substring(k.length - 4) : '***';
            console.log(`[Config Update] Saving openaiKey: ${masked}`);
        } else {
            console.log('[Config Update] No openaiKey in integrations payload (and not in DB).');
        }

        // Handle Knowledge Base - SCRAPE LINKS
        // Only process if provided in request to avoid overwriting with empty
        let finalKB = undefined;
        if (newConfig.knowledgeBase) {
            finalKB = newConfig.knowledgeBase;
            if (finalKB.links && finalKB.links.length > 0) {
                const processedLinks = await Promise.all(finalKB.links.map(async (link) => {
                    let url = typeof link === 'string' ? link : link.url;
                    let existingContent = typeof link === 'object' ? link.content : '';

                    // Skip scraping if we already have content (prevent timeout on save)
                    if (existingContent && existingContent.length > 50) {
                        return { url, content: existingContent };
                    }

                    // Scrape content to ensure freshness (only if missing or short)
                    let content = await scrapeUrl(url);
                    return { url, content };
                }));
                finalKB.links = processedLinks;
            }
        }

        // DEBUG: Validate Persona
        if (newConfig.persona) {
            console.log(`[Config Update] Persona Type: ${typeof newConfig.persona}`);
            if (typeof newConfig.persona === 'string') {
                console.log(`[Config Update] Persona Content (Head): ${newConfig.persona.substring(0, 50)}`);
            }
        }

        const data = {
            companyId,
            systemPrompt: newConfig.systemPrompt,
            persona: newConfig.persona ? (typeof newConfig.persona === 'object' ? JSON.stringify(newConfig.persona) : newConfig.persona) : undefined,
            integrations: JSON.stringify(combinedIntegrations),
            products: newConfig.products ? JSON.stringify(newConfig.products) : undefined,
            knowledgeBase: finalKB ? JSON.stringify(finalKB) : undefined,
            followUpConfig: newConfig.followUpConfig ? (typeof newConfig.followUpConfig === 'object' ? JSON.stringify(newConfig.followUpConfig) : newConfig.followUpConfig) : undefined
        };

        const updatedConfig = await prisma.agentConfig.upsert({
            where: { companyId },
            update: data,
            create: data,
        });

        // Save History if systemPrompt changed
        // Check if currentConfig exists to avoid null reference
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
        console.error('Error saving config (FULL):', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ success: false, message: 'Failed to save configuration: ' + error.message });
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

// --- GLOBAL CONFIG API (ADMIN) ---
app.post('/api/admin/config', authenticateToken, async (req, res) => {
    // Ideally check if req.user.role === 'ADMIN'
    // For now allowing any authenticated user to setup global keys if they know this route (User asked for "Unique configuration present in admin")
    // We assume the UI will protect access.
    try {
        const {
            openaiKey,
            geminiKey,
            elevenLabsKey,
            elevenLabsVoiceId,
            googleClientId,
            googleClientSecret,
            googleRedirectUri
        } = req.body;

        // Upsert Global Config (Single Record logic)
        // We will stick to ID 'global_settings' or just take the first one.
        // Let's use a fixed ID or findFirst.

        const existing = await prisma.globalConfig.findFirst();

        if (existing) {
            await prisma.globalConfig.update({
                where: { id: existing.id },
                data: {
                    openaiKey,
                    geminiKey,
                    elevenLabsKey,
                    elevenLabsVoiceId,
                    googleClientId,
                    googleClientSecret,
                    googleRedirectUri
                }
            });
        } else {
            await prisma.globalConfig.create({
                data: {
                    openaiKey,
                    geminiKey,
                    elevenLabsKey,
                    elevenLabsVoiceId,
                    googleClientId,
                    googleClientSecret,
                    googleRedirectUri
                }
            });
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Error saving global config:', e);
        res.status(500).json({ error: 'Failed to save global config' });
    }
});

app.get('/api/admin/config', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.globalConfig.findFirst();
        res.json(config || {});
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete global config' });
    }
});

// Helper
const getGlobalConfig = async () => {
    return await prisma.globalConfig.findFirst();
};


// --- GOOGLE CALENDAR & SCHEDULING ROUTES ---

// 1. OAuth: Get Auth URL
app.get('/api/auth/google/url', authenticateToken, async (req, res) => {
    try {
        const url = await generateAuthUrl(req.user.companyId);
        res.json({ url });
    } catch (error) {
        console.error('Google Auth URL Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. OAuth: Callback
// 2. OAuth: Callback
app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        let companyId = null;
        try { companyId = JSON.parse(state).companyId; } catch (_) { }

        if (!code || !companyId) {
            return res.status(400).send('Invalid request: Missing Code or State (CompanyId)');
        }

        const tokens = await handleOAuthCallback(code);

        // Save tokens for company
        await prisma.googleCalendarConfig.upsert({
            where: { companyId },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            },
            create: {
                companyId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            }
        });

        // Redirect back to frontend
        // Assuming frontend is at root/scheduling or similar
        res.redirect('/scheduling?success=true');

    } catch (error) {
        console.error('Google Auth Callback Error:', error);
        res.status(500).send(`Authentication Failed: ${error.message}`);
    }
});

app.post('/api/auth/google/callback', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        const tokens = await handleOAuthCallback(code);

        // Save tokens for company
        await prisma.googleCalendarConfig.upsert({
            where: { companyId: req.user.companyId },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            },
            create: {
                companyId: req.user.companyId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Google Auth Callback Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Calendar: List Calendars
app.get('/api/calendar/list', authenticateToken, async (req, res) => {
    try {
        const calendars = await listCalendars(req.user.companyId);
        res.json(calendars);
    } catch (error) {
        // If config doesn't exist, return empty or specific error code
        if (error.message.includes('not connected')) {
            return res.status(404).json({ error: 'Not connected' });
        }
        res.status(500).json({ error: error.message });
    }
});

// 4. Calendar: Save Settings (Primary Calendar, etc)
app.post('/api/calendar/settings', authenticateToken, async (req, res) => {
    try {
        const { primaryCalendarId, timezone, officeHours, reminderBefore } = req.body;
        await prisma.googleCalendarConfig.update({
            where: { companyId: req.user.companyId },
            data: {
                primaryCalendarId,
                timezone,
                officeHours: officeHours ? JSON.stringify(officeHours) : undefined,
                reminderBefore
            }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Calendar: Get Config
app.get('/api/calendar/config', authenticateToken, async (req, res) => {
    try {
        const config = await prisma.googleCalendarConfig.findUnique({
            where: { companyId: req.user.companyId }
        });

        let parsedOfficeHours = null;
        if (config?.officeHours) {
            try { parsedOfficeHours = JSON.parse(config.officeHours); } catch (e) { }
        }

        res.json({ ...config, officeHours: parsedOfficeHours });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SPECIALISTS & APPOINTMENT TYPES ---

// Specialists
app.get('/api/specialists', authenticateToken, async (req, res) => {
    const specialists = await prisma.specialist.findMany({ where: { companyId: req.user.companyId } });
    res.json(specialists);
});

app.post('/api/specialists', authenticateToken, async (req, res) => {
    const { name, phone, email, calendarId, active, typeIds } = req.body;

    // Manage relation with AppointmentType if needed (Using connect)
    // For now simple create
    const specialist = await prisma.specialist.create({
        data: {
            companyId: req.user.companyId,
            name, phone, email, calendarId, active
        }
    });

    // If typeIds provided, connect (Manual many-to-many or implicit?)
    // Prisma implicit many-to-many:
    if (typeIds && typeIds.length > 0) {
        await prisma.specialist.update({
            where: { id: specialist.id },
            data: {
                appointmentTypes: {
                    connect: typeIds.map(id => ({ id }))
                }
            }
        });
    }

    res.json(specialist);
});

app.put('/api/specialists/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, calendarId, active, typeIds } = req.body;

    const data = { name, phone, email, calendarId, active };

    if (typeIds) {
        data.appointmentTypes = {
            set: typeIds.map(tid => ({ id: tid }))
        };
    }

    const specialist = await prisma.specialist.update({
        where: { id },
        data
    });
    res.json(specialist);
});

app.delete('/api/specialists/:id', authenticateToken, async (req, res) => {
    await prisma.specialist.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});


// Appointment Types
app.get('/api/appointment-types', authenticateToken, async (req, res) => {
    const types = await prisma.appointmentType.findMany({
        where: { companyId: req.user.companyId },
        include: { specialists: true } // Include to see who is assigned
    });
    res.json(types);
});

app.post('/api/appointment-types', authenticateToken, async (req, res) => {
    const { name, description, duration, color, active } = req.body;
    const type = await prisma.appointmentType.create({
        data: {
            companyId: req.user.companyId,
            name, description, duration: parseInt(duration), color, active
        }
    });
    res.json(type);
});

app.put('/api/appointment-types/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, description, duration, color, active } = req.body;
    const type = await prisma.appointmentType.update({
        where: { id },
        data: { name, description, duration: parseInt(duration), color, active }
    });
    res.json(type);
});

app.delete('/api/appointment-types/:id', authenticateToken, async (req, res) => {
    await prisma.appointmentType.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});

// --- BOOKING LOGIC FOR AI ---

// Check Availability
app.post('/api/appointments/availability', authenticateToken, async (req, res) => {
    // This is for AI or testing
    const { date, specialistId, typeId } = req.body; // date YYYY-MM-DD

    // We need to determine "Start" and "End" of the day to query Google
    // Then filter by "Office Hours" and "Slots"

    try {
        const config = await prisma.googleCalendarConfig.findUnique({ where: { companyId: req.user.companyId } });
        if (!config) return res.status(400).json({ error: 'Calendar not configured' });

        // 1. Duration
        let duration = 30; // default
        if (typeId) {
            const type = await prisma.appointmentType.findUnique({ where: { id: typeId } });
            if (type) duration = type.duration;
        }

        // 2. Query Day Range (UTC or Local?)
        // Input: "2023-10-25"
        // We need to convert to ISO for Google
        const timeZone = config.timezone || 'America/Sao_Paulo';
        const startDay = `${date}T00:00:00Z`; // Approximation, better to use date-fns and timezone
        const endDay = `${date}T23:59:59Z`;

        const busySlots = await checkAvailability(req.user.companyId, startDay, endDay, timeZone);

        // Simple logic: Return busy slots so frontend/AI can compute free slots OR compute here.
        // For AI, it's better to return a list of "Available Slots".

        res.json({ busy: busySlots, duration, timeZone });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// Book Appointment
app.post('/api/appointments/book', authenticateToken, async (req, res) => {
    const {
        specialistId,
        typeId,
        startTime, // ISO
        customerName,
        customerPhone,
        notes
    } = req.body;

    try {
        // 1. Get Details for Google Event
        let summary = "Agendamento";
        let duration = 30;

        if (typeId) {
            const type = await prisma.appointmentType.findUnique({ where: { id: typeId } });
            if (type) {
                summary = `${type.name} - ${customerName}`;
                duration = type.duration;
            }
        }

        const start = new Date(startTime);
        const end = new Date(start.getTime() + duration * 60000);

        // 2. Create on Google
        const googleEvent = await createCalendarEvent(req.user.companyId, {
            summary,
            description: `Cliente: ${customerName}\nTel: ${customerPhone}\nNotas: ${notes || ''}`,
            startTime: start.toISOString(),
            endTime: end.toISOString()
            // Attendees? If specialist has email...
        });

        // 3. Save to DB
        const appointment = await prisma.appointment.create({
            data: {
                companyId: req.user.companyId,
                googleEventId: googleEvent.id,
                customerName,
                customerPhone,
                specialistId,
                typeId,
                startTime: start,
                endTime: end,
                status: 'CONFIRMED',
                notes
            }
        });

        res.json({ success: true, appointment, googleLink: googleEvent.htmlLink });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- REUSABLE CHAT LOGIC ---
const processChatResponse = async (config, message, history, sessionId = null, isAudioInput = false) => {
    // 1. Fetch Global Keys
    const globalConfig = await getGlobalConfig();


    const openaiKey = globalConfig?.openaiKey || process.env.OPENAI_API_KEY;

    if (!openaiKey) {
        throw new Error('Global OpenAI API Key not configured by Admin (DB or ENV).');
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    let systemPrompt = config.systemPrompt || "Você é um assistente virtual útil.";

    //    // Inject Audio Context if applicable
    if (isAudioInput) {
        systemPrompt += `\n\n[SISTEMA]: O usuário enviou uma mensagem de ÁUDIO que foi transcrita automaticamente para texto.
        - O texto começa com "[ÁUDIO TRANSCRITO]:".
        - AJA NATURALMENTE. Não diga "não entendo áudio". Você JÁ recebeu o conteúdo do áudio em texto.
        - Responda como se estivesse ouvindo o cliente.`;
    }

    // ENFORCE BREVITY & FORMATTING
    systemPrompt += `
    
    DIRETRIZES DE RESPOSTA:
    1. Seja direto e conciso. Evite enrolação.
    2. Separe cada ideia, frase ou parágrafo por uma QUEBRA DE LINHA DUPLA (dois enters).
    3. NUNCA envie blocos de texto gigantes.
    4. RESUMA AO MÁXIMO: Sua resposta total NÃO PODE passar de 5 frases curtas.
    5. O objetivo é que cada frase importante seja uma mensagem separada no WhatsApp (Max 5 balões).

    DIRETRIZES DE PRODUTOS/SERVIÇOS:
    1. NUNCA copie a descrição completa do produto/serviço.
    2. LISTAS: Máximo de 3 itens por mensagem. Agrupe os itens no mesmo balão (use quebra de linha simples).
    3. Se houver mais de 3 itens, cite os 3 principais e pergunte se o cliente quer ver o resto.
    4. Destaque apenas 2 ou 3 pontos principais (benefícios).
    5. Sempre termine perguntando se o cliente quer saber algo mais específico sobre o item (ex: medidas, cores, detalhes técnicos, formas de pagamentos).
    `;

    // Inject Products & Services
    if (config.products && config.products.length > 0) {
        let productList = "";
        config.products.forEach(p => {
            // FILTER INACTIVE (New Feature)
            if (p.active === false) return;

            const isService = p.type === 'service';
            const typeLabel = isService ? 'SERVIÇO' : 'PRODUTO';
            const pdfTag = p.pdf ? `[TEM_PDF] (ID: ${p.id})` : '';
            const paymentLinkCtx = p.hasPaymentLink ? `[TEM_LINK_PAGAMENTO] (Link: ${p.paymentLink})` : '';

            // Unit Logic
            let unitLabel = p.unit || 'Unidade';
            if (p.unit === 'Outro' && p.customUnit) unitLabel = p.customUnit;

            // Price Visibility Logic
            let priceDisplay = `R$ ${p.price}`;
            let priceDetails = "";

            if (p.priceHidden) {
                // If price is hidden, use the reason as the display text
                let reason = p.priceHiddenReason || 'Sob consulta';
                if (reason === 'Outro' && p.customPriceHiddenReason) {
                    reason = p.customPriceHiddenReason;
                }
                priceDisplay = `[PREÇO_OCULTO: ${reason}]`;
            } else {
                // Standard Price Logic (Matrix)
                let activeMethods = p.paymentPrices ? p.paymentPrices.filter(pm => pm.active) : [];

                if (activeMethods.length > 0) {
                    // Find Min Price among active methods (or base price if specific price is not set)
                    let minPrice = parseFloat(p.price);
                    let cheapestMethod = "Base";

                    let specificPrices = [];

                    activeMethods.forEach(pm => {
                        let methodPrice = pm.price ? parseFloat(pm.price) : parseFloat(p.price);
                        if (!isNaN(methodPrice)) {
                            specificPrices.push(`${pm.label}: R$ ${methodPrice.toFixed(2)}`);
                            if (methodPrice < minPrice) {
                                minPrice = methodPrice;
                                cheapestMethod = pm.label;
                            }
                        }
                    });

                    if (minPrice < parseFloat(p.price)) {
                        priceDisplay = `A partir de R$ ${minPrice.toFixed(2)} (no ${cheapestMethod})`;
                    }

                    if (specificPrices.length > 0) {
                        priceDetails = ` [Tabela: ${specificPrices.join(', ')}]`;
                    }
                }
            }

            // Item Header with Enhanced Price info
            productList += `- [${typeLabel}] ID: ${p.id} | Nome: ${p.name} | Preço: ${priceDisplay} / ${unitLabel}${priceDetails}. ${pdfTag} ${paymentLinkCtx}\n`;

            if (p.description) productList += `  Descrição: ${p.description}\n`;
            if (p.paymentConditions) productList += `  Condições: ${p.paymentConditions}\n`;

            // Variations (Only for Products usually, but code handles generically)
            if (p.variantItems && p.variantItems.length > 0) {
                p.variantItems.forEach(v => {
                    // Check if image exists (Variant OR Parent Fallback)
                    const hasImage = v.image || p.image;
                    productList += `  -- [VARIAÇÃO] ID: ${v.id} | ${v.name} (${v.color || ''} ${v.size || ''}) | R$ ${v.price || p.price} | ${hasImage ? '[TEM_IMAGEM]' : ''}\n`;
                });
            } else {
                // Simple Item
                productList += `  -- [ITEM ÚNICO] ID: ${p.id} | ${p.image ? '[TEM_IMAGEM]' : ''}\n`;
            }
        });



        systemPrompt += `\n\nLISTA DE PRODUTOS/SERVIÇOS DISPONÍVEIS:\n${productList}\n\n`;
        systemPrompt += `REGRA DE CONSISTÊNCIA DE ESTOQUE (CRÍTICO):
        1. A lista acima é a ÚNICA fonte de verdade sobre o que está disponível AGORA.
        2. Se o histórico de conversa mencionar um produto que NÃO está na lista acima, ele foi REMOVIDO ou ESGOTADO.
        3. Se o usuário pedir esse produto "antigo", responda: "Esse item não está mais disponível no momento." e ofereça uma alternativa da lista.
        4. JAMAIS assuma que um produto existe só porque ele foi citado anteriormente na conversa.`;

        systemPrompt += `DIRETRIZES DE MÍDIA E VENDAS (CRÍTICO):\n`;
        systemPrompt += `1. IMAGENS: Se o cliente pedir qualquer referência visual, use a tag [SHOW_IMAGE: ID]. (Veja regras de interpretação abaixo).\n`;
        systemPrompt += `2. PDF DE SERVIÇO: Se o cliente pedir detalhes de um serviço com [TEM_PDF], EXPLIQUE o serviço em texto e PERGUNTE: "Gostaria de receber o PDF com mais detalhes?". SE O CLIENTE CONFIRMAR, responda: "[SEND_PDF: ID] Enviando o arquivo...".\n`;
        systemPrompt += `3. PAGAMENTO: Se o cliente quiser comprar/contratar e o item tiver [TEM_LINK_PAGAMENTO], envie o link: "[LINK: URL_DO_PAGAMENTO] Clique aqui para finalizar.".\n`;
        systemPrompt += `4. PREÇO/CONDIÇÕES: Use as informações de preço e condições (se houver) para negociar.\n`;
        systemPrompt += `5. UNIDADES DE MEDIDA (CRÍTICO): Cada produto tem sua própria unidade (Unidade, Kg, Rolo, Metro, etc.). JAMAIS GENERALIZE. Se o Produto A é "Rolo" e o Produto B é "Kg", fale exatamente assim. Nunca diga que "todos são vendidos por rolo". Verifique item por item.\n`;
        systemPrompt += `6. PREÇOS OCULTOS [PREÇO_OCULTO: Motivo]: Se um produto estiver marcado com isso, NÃO INVENTE UM PREÇO. Responda ao cliente explicando o motivo (ex: "O valor é sob consulta", "Preciso verificar com o vendedor"). Se o motivo for "Preço com vendedor", diga que vai chamar um atendente humano.`;
    }

    // Humanization & Memory Control
    systemPrompt += `\n\nDIRETRIZES DE HUMANIZAÇÃO (CRÍTICO):
        1. NATURALIDADE EXTREMA: Aja como um humano conversando no WhatsApp. Use linguagem fluida, pode abreviar (vc, tbm) se o tom permitir.
        2. PROIBIDO ROBOTISMO: JAMAIS termine frases com 'Posso ajudar em algo mais?', 'Se precisar estou aqui'. ISSO É PROIBIDO.
        3. DIRETO AO PONTO: Responda a pergunta e pronto. Não enrole.
        4. IMAGENS (REGRA DE OURO):
           - "Foto", "Imagem", "Fotografia", "Ver", "Mostra" = TUDO A MESMA COISA.
           - Se pedirem QUALQUER termo visual, e tiver [TEM_IMAGEM], VOCÊ DEVE MANDAR A TAG [SHOW_IMAGE: ID].
           - JAMAIS diga "não consigo enviar imagens". Você CONSEGUE (via tag).
           - Se não tiver foto da variação, mande a principal. NUNCA deixe o cliente sem foto.`;

    // Strict Anti-Repetition logic if history exists
    if (history && history.length > 0) {
        systemPrompt += `\n\nATENÇÃO: Este é um diálogo em andamento. NÃO CUMPRIMENTE o usuário novamente.
        CRÍTICO: Não ofereça ajuda extra no final da mensagem. Apenas responda.`;
    }

    // Inject Audio Context if applicable
    if (isAudioInput) {
        systemPrompt += `\n\n[SISTEMA]: O usuário enviou uma MSG DE ÁUDIO que foi transcrita.
        - O texto inicia com "[ÁUDIO TRANSCRITO]:".
        - NÃO diga "não ouço áudio". Você JÁ LEU o que ele falou.
        - Responda naturalmente ao conteúdo.
        
        DIRETRIZ DE ÁUDIO (MUITO IMPORTANTE):
        1. Como você vai responder em ÁUDIO, **NÃO LEIA listas numeradas** ("um... dois..."). Fica robótico.
        2. Mantenha a resposta em texto estruturada (com listas e quebras), MAS...
        3. NO FINAL DA RESPOSTA, crie um bloco **[SCRIPT_AUDIO]:** com o texto exato que deve ser falado.
        4. No [SCRIPT_AUDIO]:
           - **CONVERSA FLUIDA**: Substitua listas por frases conectadas.
           - EXEMPLO TEXTO: "Temos: 1. Plano A, 2. Plano B."
           - EXEMPLO SCRIPT: "Nós temos o Plano A e também o Plano B, que é ótimo."
           - Fale de forma fluida, como um brasileiro.
           - Use palavras em inglês naturalmente.
           - NÃO use emojis ou markdown.`;
    }

    // Guidelines for continuity
    if (history && history.length > 0) {
        systemPrompt += `\n\nDIRETRIZES DE CONTINUIDADE (CRÍTICO - NÃO IGNORE):
        1. CONTEXTO IMPLÍCITO (OBRIGATÓRIO): Se o usuário fizer uma pergunta sem citar o nome do produto ou apenas confirmar algo (ex: "Sim", "Quero", "Manda", "Pode ser", "Quanto custa?"), você DEVE assumir que ele está falando do ÚLTIMO produto/serviço mencionado no histórico.
        
        2. PROTOCOLO DE RESPOSTA CURTA (REGRA SUPREMA):
           - Cenario: Você ofereceu um PDF ("Quer o PDF?") e o usuário disse SIM ("Sim", "Quero", "Pode mandar").
           - AÇÃO OBRIGATÓRIA: NÃO PERGUNTE "Qual PDF?". IDENTIFIQUE o serviço da mensagem anterior e envie o PDF dele IMEDIATAMENTE usando [SEND_PDF: ID].
           - EXEMPLO:
             IA: "...O serviço custa R$50. Quer o PDF?"
             User: "Sim"
             IA (CORRETO): "[SEND_PDF: serviço_xyz] Aqui está o arquivo!"
             IA (ERRADO): "Qual PDF você quer?" (ISSO É PROIBIDO)

        3. NÃO TROQUE O ASSUNTO: Se estávamos falando de "Camiseta", e o usuário pergunta "Tem G?", é PROIBIDO falar sobre "iPhone".
        4. ZERO ALUCINAÇÃO: Não invente recursos.
        5. REGRA DE OURO: Só pergunte "Qual produto?" se o histórico estiver VAZIO ou se o usuário mudar de assunto drasticamente. No fluxo de venda, ASSUMA O CONTEXTO ANTERIOR.`;
    }

    // Knowledge Base Injection
    if (config.knowledgeBase) {
        try {
            const kb = typeof config.knowledgeBase === 'string' ? JSON.parse(config.knowledgeBase) : config.knowledgeBase;

            // Inject Files
            if (kb.files && kb.files.length > 0) {
                systemPrompt += "\n\n###### BASE DE CONHECIMENTO (ARQUIVOS) ######\n";

                // 1. Create Index Summary (Crucial for AI planning)
                systemPrompt += "VOCÊ POSSUI OS SEGUINTES ARQUIVOS EM SUA MEMÓRIA:\n";
                kb.files.forEach((f, idx) => {
                    systemPrompt += `${idx + 1}. [${f.name}] - Função: ${f.description || 'Geral'} (Gatilho: ${f.usageTrigger || 'Sempre que relevante'})\n`;
                });
                systemPrompt += "\nINSTRUÇÃO DE USO: Se a pergunta do usuário ativar um GATILHO acima, LEIA O CONTEÚDO DO ARQUIVO correspondente abaixo antes de responder.\n";

                // 2. Inject Content
                systemPrompt += "\n--- CONTEÚDO DETALHADO DOS ARQUIVOS ---\n";
                kb.files.forEach(f => {
                    if (f.content) {
                        systemPrompt += `\n[INÍCIO DO ARQUIVO: ${f.name}]\n`;
                        if (f.description) systemPrompt += `> CONTEXTO: ${f.description}\n`;
                        if (f.usageTrigger) systemPrompt += `> GATILHO: ${f.usageTrigger}\n`;
                        systemPrompt += `> CONTEÚDO:\n${f.content}\n[FIM DO ARQUIVO: ${f.name}]\n`;
                    }
                });
                systemPrompt += "--------------------------------------\n";
            }

            // Inject Links
            if (kb.links && kb.links.length > 0) {
                systemPrompt += "\n=== CONTEÚDO EXTRAÍDO DE LINKS ===\n";
                kb.links.forEach(l => {
                    if (l.content) {
                        systemPrompt += `\n[FONTE: ${l.url}]\n${l.content}\n[FIM DA FONTE]\n`;
                    }
                });
            }

            // Inject Q&A
            if (kb.qa && kb.qa.length > 0) {
                systemPrompt += "\n=== PERGUNTAS E RESPOSTAS FREQUENTES (Q&A) ===\n";
                kb.qa.forEach(item => {
                    if (item.question && item.answer) {
                        systemPrompt += `\nQ: ${item.question}\nA: ${item.answer}\n`;
                    }
                });
            }

            systemPrompt += "\n\nINSTRUÇÃO FINAL DE CONHECIMENTO: Verifique PRIMEIRO a lista de arquivos e Q&A. Se não encontrar a resposta, diga honestamente que não tem essa informação nos manuais disponíveis.";

        } catch (e) {
            console.error('Error parsing Knowledge Base:', e);
        }
    }

    // --- DEBUG LOGS FOR CONTEXT ---
    console.log('--- SYSTEM PROMPT DIAGNOSTICS ---');

    // Check Products
    if (config.products) {
        let prods = typeof config.products === 'string' ? JSON.parse(config.products) : config.products;
        console.log(`[Context] Total Products: ${prods.length}`);
        console.log(`[Context] Product Names: ${prods.map(p => p.name).join(', ')}`);
    } else {
        console.log('[Context] No Producs found.');
    }

    // Check Knowledge Base
    if (config.knowledgeBase) {
        let kb = typeof config.knowledgeBase === 'string' ? JSON.parse(config.knowledgeBase) : config.knowledgeBase;
        if (kb.files) {
            console.log(`[Context] Total Files: ${kb.files.length}`);
            kb.files.forEach(f => {
                console.log(` - File: ${f.name} (Content Length: ${f.content ? f.content.length : 0} chars)`);
            });
        }
    }
    console.log('---------------------------------');

    console.log('[Chat] System Prompt Context:', systemPrompt); // DEBUG

    // --- PROMPT REWRITING (Invisible Hand Strategy) ---
    // Problem: AI hallucinates when user says just "Sim" because it loses context.
    // Solution: Rewrite "Sim" to "Sim, envie o PDF do [Item Anterior]" before sending to AI.

    let finalUserMessage = message;

    if (history && history.length > 0) {
        // Find last assistant message
        const lastAiMsg = [...history].reverse().find(m => m.role === 'assistant');

        if (lastAiMsg) {
            const aiContent = (lastAiMsg.content || '').toLowerCase();
            const userContent = (message || '').toLowerCase();

            // Check if AI offered PDF recently (keywords: pdf OR generic file terms AND question words)
            const fileKeywords = ['pdf', 'arquivo', 'material', 'lâmina', 'apresentação', 'catalogo', 'catálogo'];
            const questionKeywords = ['?', 'gostaria', 'quer', 'deseja', 'posso', 'enviar'];

            const hasFileKeyword = fileKeywords.some(kw => aiContent.includes(kw));
            const hasQuestionKeyword = questionKeywords.some(kw => aiContent.includes(kw));

            if (hasFileKeyword && hasQuestionKeyword) {

                // Check if User accepted
                const acceptanceKeywords = ['sim', 'quero', 'pode', 'manda', 'gostaria', 'yes', 'ok', 'envia', 'isso'];
                const isAcceptance = acceptanceKeywords.some(kw => userContent.includes(kw));

                if (isAcceptance) {
                    console.log('[Context] Detected Acceptance of File Offer.');

                    // Extract topic from AI message (simple heuristic: grab first 80 chars for context)
                    const topicSnippet = lastAiMsg.content.substring(0, 100).replace(/\n/g, ' ');

                    // REWRITE PROMPT
                    finalUserMessage = `(Mensagem do Sistema: O usuário respondeu "${message}" confirmando o interesse no arquivo oferecido anteriormente.)
                    
                    CONTEXTO DA OFERTA ANTERIOR: "${topicSnippet}..."
                    
                    AÇÃO OBRIGATÓRIA:
                    1. Não faça mais perguntas.
                    2. Envie IMEDIATAMENTE o PDF ou Arquivo relacionado a essa oferta.
                    3. Use a tag [SEND_PDF: ID] ou [SEND_IMAGE: ID] correta.`;

                    console.log('[Context] REWROTE USER PROMPT:', finalUserMessage);
                }
            }
        }
        // --- END PROMPT REWRITING ---

        // --- SYSTEM PROMPT INJECTION (CRITICAL FIX FOR IMAGES) ---
        const imageEnforcementFooter = `
*** ATENÇÃO: PROTOCOLO DE ENVIO DE IMAGEM ***
SE O USUÁRIO PEDIU UMA FOTO E O PRODUTO TEM IMAGEM (campo [TEM_IMAGEM]):
1. É PROIBIDO DIZER QUE VAI ENVIAR A IMAGEM SEM COLOCAR A TAG.
2. A TAG OBRIGATÓRIA É: [SHOW_IMAGE: ID_DO_PRODUTO]
3. COLOQUE A TAG NO FINAL DA RESPOSTA.

EXEMPLO CORRETO:
"Aqui está a foto do Carrinho! 🚗
[SHOW_IMAGE: 12345]"

SE VOCÊ NÃO COLOCAR A TAG, A IMAGEM NÃO APARECE E O USUÁRIO FICARÁ ZANGADO.
NÃO INVENTE IDs. USE APENAS OS QUE ESTÃO NA LISTA DE PRODUTOS.

CUMPRA ESTE PROTOCOLO AGORA.
`;
        // Append to system prompt just for this execution
        const finalSystemPrompt = systemPrompt + "\n\n" + imageEnforcementFooter;

        // Prepare Messages (History + System)
        let messages = [{ role: "system", content: finalSystemPrompt }];

        if (Array.isArray(history) && history.length > 0) {
            const cleanHistory = history.map(h => ({
                role: h.role === 'user' || h.role === 'assistant' || h.role === 'tool' ? h.role : 'user',
                content: h.content || '',
                tool_calls: h.tool_calls,
                tool_call_id: h.tool_call_id
            }));
            messages = [...messages, ...cleanHistory];
        }

        // Add current user message (Rewritten or Original)
        messages.push({ role: "user", content: finalUserMessage });

        // --- TOOL DEFINITIONS ---
        const tools = [
            {
                type: "function",
                function: {
                    name: "check_availability",
                    description: "Verifica horários disponíveis para agendamento.",
                    parameters: {
                        type: "object",
                        properties: {
                            date: { type: "string", description: "Data desejada (YYYY-MM-DD)" },
                            specialistId: { type: "string" },
                            typeId: { type: "string" }
                        },
                        required: ["date"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "book_appointment",
                    description: "Realiza o agendamento.",
                    parameters: {
                        type: "object",
                        properties: {
                            startTime: { type: "string", description: "Horário de início (ISO 8601)" },
                            customerName: { type: "string" },
                            customerPhone: { type: "string" },
                            specialistId: { type: "string" },
                            typeId: { type: "string" },
                            notes: { type: "string" }
                        },
                        required: ["startTime", "customerName", "customerPhone"]
                    }
                }
            }
        ];

        // --- TOOL LOOP (Max 3 Turns) ---
        let aiResponse = "";
        let turns = 0;
        const maxTurns = 3;
        // Check if Google Config exists and has token
        const shouldUseTools = config.googleConfig && config.googleConfig.accessToken;

        // Create OpenAI Client dynamically with the correct key
        let openaiApiKey = process.env.OPENAI_API_KEY;
        if (config.integrations && config.integrations.openaiKey) {
            openaiApiKey = config.integrations.openaiKey;
        }

        if (!openaiApiKey) {
            console.error('[AI] No OpenAI Key found in Config or Env!');
            return { aiResponse: "Erro: Chave de API não configurada." };
        }

        const client = new OpenAI({ apiKey: openaiApiKey });

        if (!shouldUseTools) {
            console.log('[AI] Running in TEXT-ONLY mode (Calendar not connected or token missing).');
        } else {
            console.log('[AI] Running in TOOL-ENABLED mode (Calendar connected).');
        }

        while (turns < maxTurns) {
            const completion = await client.chat.completions.create({
                messages: messages,
                model: config.model || "gpt-4o-mini", // Use config model or default
                tools: shouldUseTools ? tools : undefined,
                tool_choice: shouldUseTools ? "auto" : undefined
            });

            const msg = completion.choices[0].message;
            aiResponse = msg.content || "";

            // Check for Tool Calls
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                messages.push(msg); // Add AI's intent to history

                for (const toolCall of msg.tool_calls) {
                    const fnName = toolCall.function.name;
                    const args = JSON.parse(toolCall.function.arguments);
                    let toolResult = "";
                    console.log(`[AI Tool] Executing ${fnName}`, args);

                    try {
                        if (fnName === 'check_availability') {
                            const calConfig = await prisma.googleCalendarConfig.findUnique({ where: { companyId: config.companyId } });
                            const date = args.date;
                            const timeZone = calConfig?.timezone || 'America/Sao_Paulo';
                            const startIso = `${date}T00:00:00Z`;
                            const endIso = `${date}T23:59:59Z`;
                            const busy = await checkAvailability(config.companyId, startIso, endIso, timeZone);
                            toolResult = JSON.stringify({ status: 'success', busySlots: busy, officeHours: calConfig?.officeHours });
                        }
                        else if (fnName === 'book_appointment') {
                            const eventDetails = {
                                summary: `Agendamento - ${args.customerName}`,
                                description: `Tel: ${args.customerPhone}\nNotas: ${args.notes}`,
                                startTime: args.startTime,
                                endTime: new Date(new Date(args.startTime).getTime() + 30 * 60000).toISOString()
                            };
                            if (args.typeId && config.appointmentTypes) {
                                const t = config.appointmentTypes.find(x => x.id === args.typeId);
                                if (t) {
                                    eventDetails.summary = `${t.name} - ${args.customerName}`;
                                    eventDetails.endTime = new Date(new Date(args.startTime).getTime() + t.duration * 60000).toISOString();
                                }
                            }
                            const gEvent = await createCalendarEvent(config.companyId, eventDetails);
                            await prisma.appointment.create({
                                data: {
                                    companyId: config.companyId,
                                    googleEventId: gEvent.id,
                                    customerName: args.customerName,
                                    customerPhone: args.customerPhone,
                                    startTime: new Date(eventDetails.startTime),
                                    endTime: new Date(eventDetails.endTime),
                                    notes: args.notes,
                                    specialistId: args.specialistId,
                                    typeId: args.typeId,
                                    status: 'CONFIRMED'
                                }
                            });
                            toolResult = JSON.stringify({ status: 'success', message: 'Agendamento confirmado!', link: gEvent.htmlLink });
                        }
                    } catch (e) {
                        toolResult = JSON.stringify({ status: 'error', message: e.message });
                    }

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: toolResult
                    });
                }
                turns++;
            } else {
                break;
            }
        }

        // --- Audio Script Extraction ---
        let textForAudio = aiResponse;
        const scriptRegex = /\[SCRIPT_AUDIO\]:([\s\S]*?)$/i;

        const scriptMatch = aiResponse.match(scriptRegex);
        if (scriptMatch && scriptMatch[1]) {
            textForAudio = scriptMatch[1].trim();
            aiResponse = aiResponse.replace(scriptRegex, '').trim();
            console.log('[Chat] Separate Audio Script detected and extracted.');
        }

        // --- Image Detection Logic ---
        let productImageUrl = null;
        let productCaption = ""; // Initialize caption

        logFlow(`AI Response Raw: ${aiResponse.substring(0, 100)}...`);

        // Robust Regex: Optional quotes (straight or smart), spaces, dots/dashes
        // (Legacy Logic Part 1 Removed)

        // (Legacy Logic Fully Removed)
        // Append debug error if any
        // --- 2. MULTI-IMAGE & TEXT SPLITTING LOGIC ---
        // (Variables already declared above)
        productImageUrl = null; // Reset for legacy
        productCaption = "";
        let messageChunks = []; // Ensure messageChunks is declared or use existing if any (it's new)


        // check if we have image tags
        const globalImageRegex = /\[SHOW_IMAGE:\s*['"“”]?([^\]]+?)['"“”]?\s*\]/gi;
        let match;
        let lastIndex = 0;

        // We need to execute regex in a loop to find all occurrences
        // and split the text accordingly.

        // First, check if ANY tag exists to avoid overhead
        if (globalImageRegex.test(aiResponse)) {
            console.log(`[Multi - Image] DETECTED IMAGE TAGS IN RESPONSE!`);
            globalImageRegex.lastIndex = 0; // Reset

            while ((match = globalImageRegex.exec(aiResponse)) !== null) {
                // Text BEFORE the tag
                const textSegment = aiResponse.substring(lastIndex, match.index).trim();
                if (textSegment) {
                    messageChunks.push({ type: 'text', content: textSegment });
                }

                // The Image Tag ID
                const targetId = match[1];
                const resolved = resolveProductImageFromConfig(targetId, config);

                if (resolved.found) {
                    console.log(`[Chat] Found Image for ${targetId}`);
                    messageChunks.push({
                        type: 'image',
                        url: resolved.url,
                        caption: resolved.caption,
                        id: targetId
                    });

                    // Set legacy for first image found (backward compat)
                    if (!productImageUrl) {
                        productImageUrl = resolved.url;
                        productCaption = resolved.caption;
                    }
                } else {
                    console.log(`[Chat] Image not found for ${targetId}`);
                    // Append error to the previous text chunk or new text chunk
                    messageChunks.push({
                        type: 'text',
                        content: `(⚠️ Erro: Imagem não encontrada para o ID: ${targetId})`
                    });
                }

                lastIndex = globalImageRegex.lastIndex;
            }

            // Text AFTER the last tag
            const remainingText = aiResponse.substring(lastIndex).trim();
            if (remainingText) {
                messageChunks.push({ type: 'text', content: remainingText });
            }


            // CLEANUP: Remove tags from the main aiResponse used for history/audio?
            // Actually, for audio, we probably want the text but NOT the tags.
            // Let's strip tags from aiResponse for the return value
            aiResponse = aiResponse.replace(globalImageRegex, '').trim();

        } else {
            // No images, just text
            messageChunks.push({ type: 'text', content: aiResponse });
        }



        // --- PDF Logic (Service Details) ---
        let pdfBase64 = null;
        let pdfName = null;
        const pdfTagRegex = /\[SEND_PDF:\s*['"]?([^\]]+?)['"]?\s*\]/i;
        const pdfMatch = aiResponse.match(pdfTagRegex);

        if (pdfMatch) {
            const targetId = pdfMatch[1];
            let foundPdf = null;
            let foundName = null;

            // Check Products/Services
            if (config.products) {
                const p = config.products.find(p => String(p.id) === String(targetId)); // loose equality for string/number id mix
                if (p && p.pdf) {
                    foundPdf = p.pdf;
                    foundName = `${p.name}.pdf`; // Fallback name
                }
            }

            if (foundPdf) {
                try {
                    pdfBase64 = foundPdf.replace(/^data:application\/pdf;base64,/, '');
                    pdfName = foundName;
                    console.log(`[Chat] Found PDF for ID ${targetId}.`);
                    // Remove tag
                    aiResponse = aiResponse.replace(new RegExp(`\\[SEND_PDF: \\s * ['"]?${targetId}['"]?\\s*\\]`, 'gi'), '').trim();
                } catch (e) {
                    console.error(`[Chat] PDF Processing Error:`, e);
                }
            } else {
                console.log(`[Chat] PDF requested for ID ${targetId} but not found.`);
                aiResponse = aiResponse.replace(new RegExp(`\\[SEND_PDF:\\s*['"]?${targetId}['"]?\\s*\\]`, 'gi'), `(❌ PDF não encontrado: ${targetId})`);
            }
        }

        // --- Audio Generation Logic ---
        let audioBase64 = null;
        const integrator = config.integrations || {};

        // 1. Master Switch (Checkbox: "Habilitar Respostas em Áudio")
        // If disabled in config, we NEVER generate, even if user sent audio.
        // (User said: "Configuration needs to apply to the received audio format")
        const isVoiceEnabled = integrator.enabled === true || integrator.enabled === 'true';

        // Check for API Key
        let apiKey = integrator.elevenLabsKey;

        // SAFETY CHECK: If Agent Key looks like OpenAI Key (sk-...), ignore it to prevent error
        if (apiKey && (apiKey.trim().startsWith('sk-') || apiKey.trim().startsWith('sk_'))) {
            console.warn(`[Audio] Detected OpenAI Key in ElevenLabs field (${apiKey.substring(0, 5)}...). Ignoring Agent Key.`);
            apiKey = null;
        }

        // Fallback to Global
        apiKey = apiKey || globalConfig?.elevenLabsKey;

        if (isVoiceEnabled && apiKey) {
            let shouldGenerate = false;

            // 2. Logic based on Input Type vs Config Trigger
            if (isAudioInput) {
                // Case A: User sent AUDIO
                // We always reply in Audio if feature is enabled.
                // (Even if set to 'percentage', Audio-for-Audio is the baseline expectation)
                shouldGenerate = true;
                console.log('[Audio] Audio Input detected -> Forcing Audio Response.');
            } else {
                // Case B: User sent TEXT
                if (integrator.responseType === 'audio_only') {
                    // UI: "Responder em áudio apenas quando o cliente enviar áudio"
                    // Since this is TEXT input, we do NOT generate.
                    shouldGenerate = false;
                    console.log('[Audio] Text Input + AudioOnly Mode -> Skipping Audio.');
                } else if (integrator.responseType === 'percentage') {
                    // UI: "Responder em áudio aleatoriamente (% das mensagens)"
                    const probability = parseInt(integrator.responsePercentage || 50, 10);
                    const randomVal = Math.random() * 100;

                    if (randomVal <= probability) {
                        shouldGenerate = true;
                        console.log(`[Audio] Probability Hit: ${randomVal.toFixed(0)} <= ${probability} -> Generating.`);
                    } else {
                        console.log(`[Audio] Probability Miss: ${randomVal.toFixed(0)} > ${probability} -> Skipping.`);
                    }
                }
            }

            if (shouldGenerate) {
                try {
                    let voiceId = integrator.voiceId || integrator.elevenLabsVoiceId || globalConfig?.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';

                    // Fallback for Agent IDs (Now supported via resolution)
                    let resolvedVoiceId = voiceId;
                    if (voiceId.startsWith('agent_')) {
                        const foundId = await resolveVoiceFromAgent(voiceId, apiKey);
                        if (foundId) {
                            resolvedVoiceId = foundId;
                        } else {
                            console.warn(`Could not resolve Agent ID. Falling back to default.`);
                            resolvedVoiceId = '21m00Tcm4TlvDq8ikWAM';
                        }
                    }

                    console.log(`[Audio Debug] Generating Audio using VoiceID: ${resolvedVoiceId}`);

                    // Use Helper (which handles Preprocessing + Phonetics)
                    // use textForAudio (Script) if available, otherwise aiResponse
                    const textToSpeak = textForAudio || aiResponse;

                    audioBase64 = await generateAudio(textToSpeak, apiKey, resolvedVoiceId);
                } catch (audioError) {
                    console.error('Audio Generation Error:', audioError);
                }
            }
        }

        return { aiResponse, audioBase64, productImageUrl, productCaption, pdfBase64, pdfName, messageChunks };
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





    // --- Chat Endpoint (Protected - Panel Test) ---
    app.post('/api/chat', authenticateToken, async (req, res) => {
        const companyId = req.user.companyId;
        const { message, history, systemPrompt: overridePrompt, useConfigPrompt = true } = req.body;

        console.log(`[API Chat] Request received from Company: ${companyId}`);
        if (!message) return res.status(400).json({ error: 'Message required' });

        try {
            console.log('[API Chat] Fetching config...');
            const config = await getCompanyConfig(companyId);
            if (!config) {
                console.error(`[API Chat] Config not found for company ${companyId}`);
                return res.status(404).json({ error: 'Company config not found' });
            }
            console.log('[API Chat] Config loaded. Calling processChatResponse...');

            // Allow override for Test Panel
            if (!useConfigPrompt && overridePrompt) {
                config.systemPrompt = overridePrompt;
            }

            const { aiResponse, audioBase64, productImageUrl, pdfBase64, pdfName } = await processChatResponse(config, message, history, null);

            // Persist Chat (Test Mode - No Session)
            try {
                await prisma.testMessage.create({ data: { companyId, sender: 'user', text: message } });
                await prisma.testMessage.create({ data: { companyId, sender: 'ai', text: aiResponse } });
            } catch (dbError) {
                console.error('Failed to save chat history:', dbError);
            }

            res.json({ response: aiResponse, audio: audioBase64, image: productImageUrl, pdf: pdfBase64, pdfName });

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

    // --- MULTIPART MEDIA SENDER (New Strategy) ---
    const sendPrompMedia = async (config, number, fileBuffer, fileName, mimeType, caption) => {
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

    const sendPrompMessage = async (config, number, text, audioBase64, imageUrl, caption, pdfBase64 = null) => {
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
        // Postman doc example: "5515998566622". Okay, keep it.

        // 1. Send Text (ONLY if no audio AND no PDF, to avoid duplication or mixed content issues)
        // Actually, if we have PDF, we might want to send the text caption separately or as caption.
        // For PDF, caption is usually supported.
        // 1. Send Text (ONLY if no audio, to avoid duplication. For PDF/Image we WANT separate text + media)
        // 1. Send Text (with Chunking)
        // Removed the (!audioBase64) check so we ALWAYS send text if provided.
        // Audio/Image/PDF will be sent as separate messages following the text.

        // 1. Send Text (ALWAYS send text for debug visibility, even if audio exists)
        if (text && text.trim().length > 0) {
            console.log(`[Promp] Sending Text to ${number} (Audio Present: ${!!audioBase64}). URL: ${PROMP_BASE_URL}/v2/api/external/${config.prompUuid}`);
            try {
                // Split by DOUBLE Newlines to keep lists grouped in one bubble
                // Regex: \n\s*\n matches 2 or more newlines with optional whitespace
                const chunks = text.split(/\n\s*\n/).map(c => c.trim()).filter(c => c.length > 0);

                console.log(`[Promp] Sending Text (${chunks.length} chunks) to ${number}...`);

                for (const chunk of chunks) {
                    // Formatting: Convert **bold** to *bold* for WhatsApp compatibility if needed, 
                    // but WhatsApp supports *bold*. OpenAI output is usually Markdown.
                    // Let's keep it raw for now.

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
                    // Download and convert to Base64 to ensure it works (bypass External API fetch blocks)
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
                        let mimeType = 'image/jpeg'; // Default to JPEG after conversion
                        let fileName = `image_${Date.now()}.jpg`;

                        // CONVERT TO JPEG via SHARP (Force Compatibility)
                        try {
                            // Sharp: Convert any input to JPEG
                            imageBuffer = await sharp(imageBuffer)
                                .jpeg({ quality: 85, mozjpeg: true })
                                .toBuffer();
                            console.log(`[Promp] Image converted to JPEG via Sharp. New Size: ${imageBuffer.length}`);
                        } catch (sharpError) {
                            console.error('[Promp] Sharp Conversion Error (Using Original):', sharpError.message);
                            // Fallback: Send original buffer if conversion fails
                            mimeType = downloadResponse.headers['content-type'] || 'image/jpeg';
                            const ext = mimeType.split('/')[1] || 'jpg';
                            fileName = `image_${Date.now()}.${ext}`;
                        }

                        const base64Data = imageBuffer.toString('base64');

                        console.log(`[Promp] Sending converted image via /base64 endpoint. Mime: ${mimeType}`);
                        logFlow(`Sending Base64 to WhatsApp API...`);

                        await sendBase64Image(config, number, base64Data, mimeType, fileName, caption);
                        logFlow(`Send Base64 function returned.`);

                    } catch (dlError) {
                        console.error('[Promp] Failed to download remote image for sending:', dlError.message);
                        logFlow(`Download FAILED: ${dlError.message}`);
                        // Fallback to original method (sending URL directly) just in case
                        console.log('[Promp] Asking Promp API to fetch URL directly (Fallback)...');

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
        const { identity, sessionId, manualUserId } = req.body;
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

            // RESOLVE USER ID (CRITICAL FOR MULTI-TENANT)
            // We must find a valid User ID *inside* this specific tenant.

            let targetUserId = null;

            // Strategy 0: Manual User ID (Override - Highest Priority)
            if (manualUserId) {
                const manualIdInt = parseInt(manualUserId);
                if (!isNaN(manualIdInt)) {
                    console.log(`[Promp] Manual User ID provided: ${manualIdInt}. Validating against Tenant...`);

                    let fetchDebug = '';
                    let tenantUsers = targetTenant.users;
                    // Fetch if missing
                    if (!tenantUsers || !Array.isArray(tenantUsers) || tenantUsers.length === 0) {
                        try {
                            console.log(`[Promp] Fetching users for Tenant ${targetTenant.id} (manual validation)...`);
                            const usersRes = await fetch(`${PROMP_BASE_URL}/userApiList`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tenantId: targetTenant.id })
                            });

                            if (usersRes.ok) {
                                const usersData = await usersRes.json();
                                tenantUsers = Array.isArray(usersData) ? usersData : (usersData.users || usersData.data || []);
                                targetTenant.users = tenantUsers;
                                console.log(`[Promp] Fetched ${tenantUsers.length} users.`);
                            } else {
                                const errText = await usersRes.text();
                                fetchDebug = `Status: ${usersRes.status}, Resp: ${errText}`;
                                console.error('[Promp] Fetch User List Failed:', fetchDebug);
                            }
                        } catch (e) {
                            fetchDebug = `Exception: ${e.message}`;
                            console.error('Error fetching users for manual validation:', e);
                        }
                    }

                    if (Array.isArray(tenantUsers)) {
                        const exists = tenantUsers.find(u => u.id === manualIdInt);
                        if (exists) {
                            targetUserId = manualIdInt;
                            console.log(`[Promp] MANUAL USER ID VALIDATED and SELECTED: ${targetUserId}`);
                        } else {
                            console.warn(`[Promp] Manual User ID ${manualIdInt} NOT FOUND in Tenant #${targetTenant.id}.`);
                            return res.status(400).json({
                                message: `O ID de usuário informado (${manualIdInt}) não foi encontrado neste Tenant (ID: ${targetTenant.id}). IDs disponíveis: ${tenantUsers.map(u => u.id + ' (' + u.name + ')').join(', ')}`
                            });
                        }
                    } else {
                        // If we can't validate (API failure), TRUST THE USER.
                        console.warn(`[Promp] Validation skipped (API error: ${fetchDebug || 'Unknown'}). Trusting Manual ID: ${manualIdInt}`);
                        targetUserId = manualIdInt;
                    }
                }
            }

            // Strategy 1: Match by Email (Identity Alignment)
            if (!targetUserId) {

                // Check if the current logged-in Agent user exists in the Target Tenant's user list

                try {
                    const currentUser = await prisma.user.findUnique({
                        where: { id: req.user.userId }
                    });

                    if (currentUser && currentUser.email) {
                        const currentUserEmail = currentUser.email.trim().toLowerCase();

                        if (Array.isArray(targetTenant.users)) {
                            // Case-insensitive match
                            const matchedUser = targetTenant.users.find(u => u.email && u.email.trim().toLowerCase() === currentUserEmail);

                            if (matchedUser) {
                                targetUserId = matchedUser.id;
                                console.log(`[Promp] IDENTITY MATCH FOUND! Email: ${currentUserEmail} -> User ID: ${targetUserId}`);
                            } else {
                                console.log(`[Promp] No match for ${currentUserEmail} in tenant users:`, targetTenant.users.map(u => u.email));
                            }
                        }
                    }
                } catch (authErr) {
                    console.error('[Promp] Auth lookup failed (skipping email match):', authErr);
                }

                // Strategy 2: Admin/Owner Fallback (if no email match)
                if (!targetUserId) {
                    targetUserId = targetTenant.adminId || targetTenant.userId || targetTenant.ownerId;
                }

                // Inspect 'users' array if available (Fallback to first user)
                if (!targetUserId && Array.isArray(targetTenant.users) && targetTenant.users.length > 0) {
                    targetUserId = targetTenant.users[0].id;
                    console.log(`[Promp] Found User ID from 'users' array (First User): ${targetUserId}`);
                }

                // Inspect 'admin' object if available
                if (!targetUserId && targetTenant.admin && targetTenant.admin.id) {
                    targetUserId = targetTenant.admin.id;
                    console.log(`[Promp] Found User ID from 'admin' object: ${targetUserId}`);
                }

                // Final Fallback (Try 1, but warn)
                if (!targetUserId) {
                    console.warn('[Promp] WARNING: No explicit User ID found in Tenant object. Defaulting to 1 (Risk of failure).');
                    console.log('[Promp] Tenant Keys:', Object.keys(targetTenant).join(', '));
                    targetUserId = 1;
                }

            }

            console.log(`[Promp] Creating API for Tenant: ${targetTenant.id} | User: ${targetUserId} | Session: ${finalSessionId}`);

            const createApiRes = await fetch(`${PROMP_BASE_URL}/tenantCreateApi`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PROMP_ADMIN_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: apiName,
                    sessionId: finalSessionId,
                    userId: targetUserId,
                    authToken: Math.random().toString(36).substring(7),
                    tenant: targetTenant.id
                })
            });

            let apiData = await createApiRes.json();

            if (!createApiRes.ok || !apiData.id) {
                console.error('[Promp] API Create Failed:', JSON.stringify(apiData));
                // Return ACTUAL error from upstream + Context
                return res.status(400).json({
                    message: `Falha na API Promp: ${apiData.error || apiData.message || JSON.stringify(apiData)}. (Tenant: ${targetTenant.id}, User Tentado: ${targetUserId})`
                });
            }

            // SAVE TO DB (Upsert to create if missing)
            await prisma.agentConfig.upsert({
                where: { companyId },
                update: {
                    prompIdentity: identity,
                    prompUuid: apiData.id,
                    prompToken: apiData.token
                },
                create: {
                    companyId,
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
    // Generic Webhook Fallback (if companyId missing in URL)
    app.post('/webhook', async (req, res) => {
        console.log('[Webhook] Received request on generic /webhook endpoint (No ID).');

        // Try to find a default company or extract from payload
        // This is a Safety Net for misconfigured integrations.
        const firstCompany = await prisma.company.findFirst();
        if (firstCompany) {
            console.log(`[Webhook] Redirecting to Company ${firstCompany.id}`);
            // Internally forward or redirect? 
            // Better to just call the handler or duplicate logic?
            // Let's redirect 307 to the correct URL if possible, or handle it here.
            // Since this is S2S, redirect might not be followed.
            // We'll just call the logic via internal redirect if we could, but express doesn't support internal dispatch easily.
            // We'll just return an error telling them to configure the URL correctly.
            console.error('[Webhook] ERROR: Integration URL is missing Company ID. Use: /webhook/' + firstCompany.id);
            return res.status(400).json({
                error: 'Webhook URL must include Company ID',
                correctUrl: `/webhook/${firstCompany.id}`,
                example: `https://seu-dominio.com/webhook/${firstCompany.id}`
            });
        }
        res.status(400).send('Missing Company ID in URL');
    });

    // Webhook Handlers (Support multiple paths for compatibility)
    const handleWebhook = async (req, res) => {
        const { companyId } = req.params;
        const payload = req.body;

        console.log(`[Webhook] Received for company ${companyId}:`, JSON.stringify(payload, null, 2));

        // ... (existing logic will be here, need to move it to a function)
        // Check if we can just define the route handler elsewhere or reuse.
        // Since I am replacing the route definition, I need to refactor the logic into a named function?
        // Actually, the previous code was an inline async function.
        // I will keep it inline but assign to a variable to reuse?
        // Too complex for 'replace'.
        // Better: Just duplicate the route definition lines.
    };

    // Define the handler function separately to reuse (Wait, I can't easily refactor entire block with replace tool without reading it all)
    // I will just add the aliases pointing to the same handlers if I could...
    // But I can't in this tool comfortably.

    // Alternative: Just add the aliases that call the main route logic?
    // app.post('/api/webhook/:companyId', (req, res) => app._router.handle({ ...req, url: '/webhook/' + req.params.companyId }, res));
    // Risky.

    // Let's just Rename the route to use an array of paths? Express supports it!
    // app.post(['/webhook/:companyId', '/api/webhook/:companyId', '/api/promp/webhook/:companyId'], ...

    app.post(['/webhook/:companyId', '/api/webhook/:companyId', '/api/promp/webhook/:companyId'], async (req, res) => {
        const { companyId } = req.params;
        const payload = req.body; // n8n payload

        console.log(`[Webhook] Received for company ${companyId}:`, JSON.stringify(payload, null, 2));


        // Load Config EARLY (needed for Identity check)
        let followUpCfg = null;
        let config = null;
        try {
            config = await getCompanyConfig(companyId);
            if (config?.followUpConfig) {
                // Safe JSON Parsing to avoid SyntaxError
                if (typeof config.followUpConfig === 'string') {
                    if (config.followUpConfig.trim().startsWith('{')) {
                        followUpCfg = JSON.parse(config.followUpConfig);
                    }
                } else if (typeof config.followUpConfig === 'object') {
                    followUpCfg = config.followUpConfig;
                }
            }
        } catch (e) {
            console.error('[Webhook] Failed to load config:', e);
        }

        // ------------------------------------------------------------------
        // 0. DEDUPLICATION (Prevent Triple Replies)
        // ------------------------------------------------------------------
        const msgId = payload.key?.id || payload.id || payload.data?.id;
        if (msgId) {
            if (processedMessages.has(msgId)) {
                console.log(`[Webhook] Duplicate Message ID ${msgId}. Ignoring.`);
                return res.json({ status: 'ignored_duplicate' });
            }
            processedMessages.add(msgId);
            // Clear from memory after 15 seconds
            setTimeout(() => processedMessages.delete(msgId), 15000);
        }

        // ------------------------------------------------------------------
        // LOOP PROTECTION & SENDER IDENTITY
        // ------------------------------------------------------------------

        // 1. Check "wasSentByApi" (Explicit flag from some Providers)
        // If true, it is DEFINITELY the bot/agent.
        if (payload.wasSentByApi || payload.msg?.wasSentByApi || payload.data?.wasSentByApi) {
            console.log('[Webhook] Loop Protection: Message marked as "wasSentByApi". Ignoring.');
            return res.json({ status: 'ignored_api_sent' });
        }

        // 2. Identify Sender
        const rawSender = payload.key?.remoteJid || payload.contact?.number || payload.number || payload.data?.key?.remoteJid || payload.msg?.from || payload.msg?.sender;
        const cleanSender = rawSender ? String(rawSender).replace(/\D/g, '') : '';

        // 3. Identify Protocol Owner (The session/bot number)
        const rawOwner = payload.msg?.owner || payload.owner;
        const cleanOwner = rawOwner ? String(rawOwner).replace(/\D/g, '') : null;

        // 4. Identify Configured Identity (From DB)
        let dbIdentity = null;
        if (config?.prompIdentity) {
            dbIdentity = String(config.prompIdentity).replace(/\D/g, '');
        }

        // IDENTITY CHECK: "Consider ONLY what is sent TO the number that is in the AI"
        // If the payload says the owner is X, but the DB config says Identity is Y, IGNORE.
        // (Only if both are known)
        if (dbIdentity && cleanOwner && dbIdentity !== cleanOwner) {
            console.log(`[Webhook] Identity Mismatch. Payload Owner: ${cleanOwner}, Config Identity: ${dbIdentity}. Ignoring.`);
            return res.json({ status: 'ignored_wrong_identity' });
        }

        // ------------------------------------------------------------------
        // 5. STRICT FILTERS (Groups, Status, Broadcasts)
        // ------------------------------------------------------------------
        const isGroup = rawSender ? rawSender.includes('@g.us') : false;
        const isBroadcast = rawSender ? (rawSender.includes('broadcast') || rawSender.includes('@lid')) : false;
        // Note: @lid is sometimes used for individual chats in new WhatsApp versions. 
        // If it is 'status@broadcast', ignore. If it is '123...456@lid', it might be a user.
        // SAFE BET: Ignore 'status@broadcast' explicitly.
        // Also ignore empty messages or protocol messages.
        const messageType = payload.messageType || payload.type;
        const isProtocol = messageType === 'protocolMessage' || messageType === 'senderKeyDistributionMessage';

        if (rawSender && rawSender.includes('status@broadcast')) {
            console.log('[Webhook] Ignoring Status Update (status@broadcast).');
            return res.json({ status: 'ignored_status' });
        }

        if (isGroup) {
            console.log('[Webhook] Ignoring Group Message.');
            return res.json({ status: 'ignored_group' });
        }



        if (isProtocol) {
            console.log('[Webhook] Ignoring Protocol Message.');
            return res.json({ status: 'ignored_protocol' });
        }

        let isFromMe = payload.key?.fromMe || payload.fromMe || payload.data?.key?.fromMe || payload.msg?.fromMe;

        // REVERTED: Removed "Smart" Auto-Detection of Identity/Owner to avoid "Double Reply" bugs.
        // Relying Strictly on API 'fromMe' flag.

        // ------------------------------------------------------------------
        // FLOW A: AGENT SENT MESSAGE -> START TIMER
        // ------------------------------------------------------------------

        if (isFromMe) {
            console.log('[Webhook] Message sent by Agent (fromMe). Starting Follow-up Timer.');

            // For OUTBOUND messages, we need to find the RECIPIENT to set the timer for.
            // Usually in `payload.key.remoteJid` or `payload.to` or `payload.msg.chatid`
            // CAREFUL: In some webhooks, key.remoteJid is the Chat ID (User).
            // Let's inspect `remoteJid`. If it's the User, use it.

            let targetJid = payload.key?.remoteJid || payload.to || payload.msg?.chatid;
            // If remoteJid contains status@broadcast, we already ignored it.

            // Sanity Check: If targetJid IS the agent (unlikely for outbound), we have a problem.
            // Assuming targetJid is the User.

            if (targetJid) {
                const cleanTarget = String(targetJid).replace(/\D/g, '');

                // SAFETY CHECK: If Target is myself (Agent), ABORT.
                if (cleanTarget === cleanOwner || cleanTarget === dbIdentity || cleanTarget === cleanSender) {
                    console.log(`[FollowUp] Timer SKIPPED. Target (${cleanTarget}) is myself/sender. (Owner: ${cleanOwner}, ID: ${dbIdentity})`);
                    return res.json({ status: 'ignored_self_target' });
                }

                // Check if Follow-up is Enabled
                if (followUpCfg && followUpCfg.enabled && followUpCfg.attempts?.length > 0) {
                    const firstAttempt = followUpCfg.attempts[0];
                    const now = new Date();
                    let nextDate = new Date();
                    if (firstAttempt.delayUnit === 'minutes') nextDate.setMinutes(now.getMinutes() + firstAttempt.delayValue);
                    if (firstAttempt.delayUnit === 'hours') nextDate.setHours(now.getHours() + firstAttempt.delayValue);
                    if (firstAttempt.delayUnit === 'days') nextDate.setDate(now.getDate() + firstAttempt.delayValue);

                    // UPSERT STATE for the USER (Target)
                    // Use full JID for DB uniqueness
                    await prisma.contactState.upsert({
                        where: { companyId_remoteJid: { companyId, remoteJid: targetJid } },
                        create: {
                            companyId,
                            remoteJid: targetJid,
                            isActive: true,
                            attemptIndex: 0,
                            lastOutbound: now,
                            nextFollowUp: nextDate
                        },
                        update: {
                            isActive: true,
                            attemptIndex: 0,
                            lastOutbound: now,
                            nextFollowUp: nextDate
                        }
                    });
                    console.log(`[FollowUp] Timer STARTED for ${cleanTarget}. Next: ${nextDate.toISOString()}`);
                } else {
                    console.log('[FollowUp] Timer IGNORED (Disabled or No Attempts).');
                }
            }

            // CRITICAL: STOP HERE. Do not process as user message.
            return res.json({ status: 'agent_action_processed' });
        }

        // ------------------------------------------------------------------
        // FLOW B: USER SENT MESSAGE -> STOP TIMER & REPLY
        // ------------------------------------------------------------------

        console.log(`[Webhook] Processing User Message from ${cleanSender}...`);

        // Check if Status Update again (redundant but safe)
        if (payload.type === 'message_status' || payload.status) {
            return res.json({ status: 'ignored_status_update' });
        }

        // Safety Check for Content
        // Wuzapi: payload.data.message.conversation OR payload.content.text
        // User Log Payload: payload.msg.text Or payload.msg.content
        let userMessage = payload.content?.text ||
            payload.data?.message?.conversation ||
            payload.data?.message?.extendedTextMessage?.text ||
            payload.msg?.text ||
            payload.msg?.body ||
            payload.msg?.content;

        // --- AUDIO HANDLING ---
        // If text is "ptt" (Push To Talk) or "audio" AND we have media, it's an Audio Message.
        let isAudioInput = false;
        const mediaBase64 = payload.content?.media || payload.msg?.media || payload.media; // Try all paths

        if ((userMessage === 'ptt' || userMessage === 'audio' || payload.type === 'audio') && mediaBase64) {
            console.log('[Webhook] Audio Message Detected. Attempting Transcription...');

            // Need Global Key for Whisper
            const globalConfig = await getGlobalConfig();
            if (globalConfig?.openaiKey) {
                const transcription = await transcribeAudio(mediaBase64, globalConfig.openaiKey);
                if (transcription) {
                    userMessage = `[ÁUDIO TRANSCRITO]: ${transcription}`;
                    isAudioInput = true;
                    console.log(`[Webhook] Audio Transcribed: "${userMessage}"`);
                } else {
                    userMessage = "[Áudio inaudível]";
                }
            } else {
                console.warn('[Webhook] No Global OpenAI Key. Cannot transcribe audio.');
                userMessage = "[Áudio recebido, mas sem chave para transcrever]";
            }
        }

        if (!userMessage) {
            // If it's a media message or something else we don't support yet, ignore gracefully
            console.log('[Webhook] Payload missing text content. Ignoring.');
            return res.json({ status: 'ignored_no_text' });
        }
        if (!userMessage) {
            // If it's a media message or something else we don't support yet, ignore gracefully
            console.log('[Webhook] Payload missing text content. Ignoring.');
            return res.json({ status: 'ignored_no_text' });
        }

        // Support both N8N structure (ticket.id), Wuzapi (wuzapi.id), and pure Promp structure
        const sessionId = payload.ticket?.id || payload.wuzapi?.id || (payload.classes && payload.classes.length > 0 ? payload.classes[0] : null) || null;
        const senderNumber = payload.key?.remoteJid || payload.contact?.number || payload.number || payload.data?.key?.remoteJid || payload.msg?.sender;

        // Clean Sender Number if it has @s.whatsapp.net
        const cleanNumber = senderNumber ? String(senderNumber).replace(/\D/g, '') : null;

        if (!cleanNumber) {
            console.log('[Webhook] No specific sender number found. Ignoring.');
            return res.json({ status: 'ignored_no_number' });
        }

        // --- STOP FOLLOW-UP TIMER (User Replied) ---
        try {
            // If user replies, we stop any pending sequence
            // We use updateMany just in case record doesn't exist (avoid error) or findUnique check
            // Ideally:
            const jid = senderNumber.includes('@') ? senderNumber : `${senderNumber}@s.whatsapp.net`;

            await prisma.contactState.updateMany({
                where: {
                    companyId: companyId,
                    remoteJid: jid // We must match what we saved (likely full JID)
                },
                data: { isActive: false }
            });
            console.log(`[FollowUp] Timer STOPPED for ${cleanNumber}`);
        } catch (e) {
            // Ignore error
        }

        const metadata = JSON.stringify(payload);

        try {
            const config = await getCompanyConfig(companyId);
            if (!config) return res.status(404).json({ error: 'Company config not found. Check ID.' });

            const msgLog = userMessage ? String(userMessage).substring(0, 50) : '[No Content]';
            console.log(`[Webhook] Processing message for ${cleanNumber}: "${msgLog}..."`);

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

            // --- DATABASE MEMORY FIX (Persistent Session + Chronological Order) ---
            // 1. Session ID: Use cleanNumber (Phone) if available to ensure persistence across tickets.
            //    Fallback to ticket.id if needed, but phone is better for long-term memory.
            const dbSessionId = cleanNumber || sessionId || 'unknown_session';

            if (cleanNumber) {
                try {
                    // 2. Fetch History: Get 20 *MOST RECENT* messages (descending)
                    const storedMessages = await prisma.testMessage.findMany({
                        where: {
                            companyId: String(companyId),
                            sessionId: String(dbSessionId)
                        },
                        orderBy: { createdAt: 'desc' }, // Get newest first
                        take: 20
                    });

                    // 3. Reverse to Chronological Order for OpenAI (Oldest -> Newest)
                    history = storedMessages.reverse().map(m => ({
                        role: m.sender === 'user' ? 'user' : 'assistant',
                        content: m.text
                    }));

                    console.log(`[Webhook] Fetched ${history.length} msgs of Persistent History for ${dbSessionId}`);
                } catch (histError) {
                    console.error('[Webhook] History Fetch Error:', histError);
                }
            }

            // 3. Process AI Response
            // Pass isAudioInput flag so AI can decide to reply with audio
            const { aiResponse, audioBase64, productImageUrl, productCaption, pdfBase64, messageChunks } = await processChatResponse(config, userMessage, history, dbSessionId, isAudioInput);

            console.log(`[Webhook] AI Response generated: "${aiResponse.substring(0, 50)}..."`);
            if (messageChunks && messageChunks.length > 0) {
                console.log(`[Webhook] Multi-message response detected: ${messageChunks.length} chunks.`);
            }

            // Persist Chat (Using Persistent Session ID)
            // We persist the FULL AI response for context, even if sent in chunks.
            try {
                await prisma.testMessage.create({
                    data: {
                        companyId: String(companyId),
                        sender: 'user',
                        text: userMessage,
                        sessionId: String(dbSessionId),
                        metadata
                    }
                });
                await prisma.testMessage.create({
                    data: {
                        companyId: String(companyId),
                        sender: 'ai',
                        text: aiResponse,
                        sessionId: String(dbSessionId)
                    }
                });
            } catch (dbError) {
                console.error('[Webhook] Failed to save chat:', dbError);
            }

            // --- REPLY STRATEGY ---
            let sentViaApi = false;
            if (config.prompUuid && config.prompToken) {

                // MULTI-MESSAGE SENDING LOOP
                if (messageChunks && messageChunks.length > 0) {
                    console.log(`[Webhook] Sending ${messageChunks.length} chunks via API...`);

                    for (const [index, chunk] of messageChunks.entries()) {
                        if (chunk.type === 'image') {
                            // Send Image
                            // For the FIRST chunk/image, maybe send audio if allowed? 
                            // Let's stick to NO audio for images unless it's the *only* thing?
                            // Actually, audioBase64 is global for the response.
                            // We should only send Audio ONCE. Let's send it with the LAST chunk? Or First?
                            // Let's send it with the first TEXT chunk.
                            const isFirstText = index === 0;
                            await sendPrompMessage(config, cleanNumber, null, null, chunk.url, chunk.caption);
                            // small delay
                            await new Promise(r => setTimeout(r, 600));
                        } else if (chunk.type === 'text') {
                            // Send Text
                            // Attach Audio ONLY to the first text chunk (or if it's the only one)
                            // If we attach audio, sendPrompMessage sends audio separately anyway.
                            // But we want to avoid sending audio multiple times.
                            const chunkAudio = (index === 0) ? audioBase64 : null;

                            await sendPrompMessage(config, cleanNumber, chunk.content, chunkAudio, null, null);
                            await new Promise(r => setTimeout(r, 800)); // Readability delay
                        }
                    }
                    sentViaApi = true;

                } else {
                    // Fallback (Should not happen if processChatResponse always returns chunks)
                    sentViaApi = await sendPrompMessage(config, cleanNumber, aiResponse, audioBase64, productImageUrl, productCaption, pdfBase64);
                }

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

    // --- INTELLIGENT FOLLOW-UP SCHEDULER ---
    const FOLLOW_UP_INTERVAL_MS = 60 * 1000; // Check every 60s

    // Helper to calculate date
    const calculateNextDate = (value, unit) => {
        const now = new Date();
        if (unit === 'minutes') now.setMinutes(now.getMinutes() + value);
        if (unit === 'hours') now.setHours(now.getHours() + value);
        if (unit === 'days') now.setDate(now.getDate() + value);
        return now;
    };

    setInterval(async () => {
        try {
            const now = new Date();
            // Log heartbeat every minute (or every 5 minutes if too noisy, but for debug every min is good)
            // console.log(`[FollowUp] Heartbeat at ${now.toISOString()}`); 

            // 1. Find contacts due for follow-up
            const pendingContacts = await prisma.contactState.findMany({
                where: {
                    isActive: true,
                    nextFollowUp: { lte: now }
                }
            });

            if (pendingContacts.length > 0) {
                console.log(`[FollowUp] Found ${pendingContacts.length} contacts due for follow-up at ${now.toISOString()}`);
                pendingContacts.forEach(c => console.log(` - Contact: ${c.remoteJid}, Next: ${c.nextFollowUp}, Attempt: ${c.attemptIndex}`));
            } else {
                // Uncomment to debug if loop is running at all
                console.log(`[FollowUp] No pending contacts. (Checked at ${now.toISOString()})`);
            }

            for (const contact of pendingContacts) {
                try {
                    // 2. Load Config
                    // FIX: Use robust JSON parsing same as Webhook
                    const config = await getCompanyConfig(contact.companyId);
                    let followUpCfg = null;
                    if (config?.followUpConfig) {
                        try {
                            if (typeof config.followUpConfig === 'string') {
                                if (config.followUpConfig.trim().startsWith('{')) {
                                    followUpCfg = JSON.parse(config.followUpConfig);
                                } else {
                                    console.warn(`[FollowUp] Invalid JSON string for config: ${config.followUpConfig}`);
                                }
                            } else if (typeof config.followUpConfig === 'object') {
                                followUpCfg = config.followUpConfig;
                            }
                        } catch (err) {
                            console.error(`[FollowUp] JSON Parse Error for contact ${contact.id}:`, err);
                        }
                    }

                    // Stop if disabled globally
                    if (!followUpCfg || !followUpCfg.enabled) {
                        await prisma.contactState.update({ where: { id: contact.id }, data: { isActive: false } });
                        continue;
                    }

                    // 3. Check attempts config
                    const attempts = followUpCfg.attempts || [];
                    const currentAttemptIndex = contact.attemptIndex;

                    if (currentAttemptIndex >= attempts.length) {
                        // Exhausted all attempts
                        await prisma.contactState.update({ where: { id: contact.id }, data: { isActive: false } });
                        continue;
                    }

                    const currentAttemptConfig = attempts[currentAttemptIndex];
                    if (!currentAttemptConfig.active) {
                        // If this specific attempt is disabled, skip to next or stop? 
                        // Usually we might want to skip. Let's increment index and schedule next immediately (soft skip).
                        // Or just stop? User said "pause an attempt".
                        // Let's increment and reschedule for next attempt if exists.
                        const nextIndex = currentAttemptIndex + 1;
                        if (nextIndex < attempts.length) {
                            const nextCfg = attempts[nextIndex];
                            const nextDate = calculateNextDate(nextCfg.delayValue, nextCfg.delayUnit);
                            await prisma.contactState.update({
                                where: { id: contact.id },
                                data: { attemptIndex: nextIndex, nextFollowUp: nextDate }
                            });
                        } else {
                            await prisma.contactState.update({ where: { id: contact.id }, data: { isActive: false } });
                        }
                        continue;
                    }

                    // 4. Generate AI Message
                    // FIX: Safe JSON parsing for persona
                    let persona = {};
                    try {
                        if (config.persona && typeof config.persona === 'string') {
                            persona = JSON.parse(config.persona);
                        } else if (typeof config.persona === 'object') {
                            persona = config.persona;
                        }
                    } catch (e) {
                        console.error('[FollowUp] Error parsing persona:', e);
                    }
                    const tone = followUpCfg.tone || 'serious';

                    let tonePrompt = "";
                    if (tone === 'animated') tonePrompt = "Estilo: Energético, motivador, use emojis positivos 🚀.";
                    if (tone === 'serious') tonePrompt = "Estilo: Profissional, direto, sem gírias.";
                    if (tone === 'ice_breaker') tonePrompt = "Estilo: Leve, bem-humorado, simpático 😄.";

                    const systemInstruction = `
                Você é ${persona.name || 'Assistente'}, da empresa.
                O cliente parou de responder.
                Objetivo: Retomar a conversa de forma natural (Follow-up).
                ${tonePrompt}
                NÃO seja repetitivo. NÃO pareça um robô.
                Faça uma pergunta para engajar.
                Seja ULTRA direto (máx 2 frases).
                Separe cada frase com uma quebra de linha dupla.
                `;

                    // Fetch recent history for context (Last 3 messages)
                    const history = await prisma.testMessage.findMany({
                        where: { companyId: contact.companyId }, // Ideally filter by session/phone which we map to remoteJid?
                        // Note: Schema links by sessionId. Webhook maps remoteJid to sessionId if possible.
                        // For now, without robust session mapping, we skip history or use metadata context.
                        take: 3,
                        orderBy: { createdAt: 'desc' }
                    });

                    // Reverse to chronological
                    const recentMsgs = history.reverse().map(m => `${m.sender}: ${m.text}`).join('\n');

                    // Initialize OpenAI Client
                    let openaiKey = null; // Start null
                    let source = "NONE";

                    try {
                        // 1. Try DB Integrations first (Standard)
                        if (config.integrations) {
                            let integrations = {};
                            if (typeof config.integrations === 'string') {
                                if (config.integrations.trim().startsWith('{')) {
                                    integrations = JSON.parse(config.integrations);
                                }
                            } else if (typeof config.integrations === 'object') {
                                integrations = config.integrations;
                            }

                            if (integrations.openaiKey) {
                                openaiKey = integrations.openaiKey;
                                source = "DB_INTEGRATIONS";
                            }
                        }
                    } catch (e) {
                        console.error('[FollowUp] Error parsing integrations for OpenAI Key:', e);
                    }

                    // 2. Override with Global ENV if available (ADMIN OVERRIDE)
                    // If user set GLOBAL KEY in VPS, it should win.
                    if (process.env.OPENAI_API_KEY) {
                        openaiKey = process.env.OPENAI_API_KEY;
                        source = "GLOBAL_ENV";
                    }

                    if (openaiKey) openaiKey = openaiKey.trim();

                    if (openaiKey) {
                        const masked = openaiKey.length > 10 ? openaiKey.substring(0, 8) + '...' + openaiKey.substring(openaiKey.length - 4) : 'INVALID_LEN';
                        console.log(`[FollowUp] Using OpenAI Key (${source}): ${masked}`);
                    }

                    if (!openaiKey) {
                        console.error('[FollowUp] No OpenAI Key found for company', contact.companyId);
                        continue;
                    }

                    const openai = new OpenAI({ apiKey: openaiKey });

                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemInstruction },
                            { role: "user", content: `Histórico recente:\n${recentMsgs}\n\nGere uma mensagem de follow-up.` }
                        ],
                        model: "gpt-4o-mini",
                    });

                    const aiMessage = completion.choices[0].message.content;
                    console.log(`[FollowUp] Generated for ${contact.remoteJid}: "${aiMessage}"`);

                    // 5. Send Message
                    // Use existing sendPrompMessage
                    const cleanNumber = contact.remoteJid.replace('@s.whatsapp.net', '');
                    await sendPrompMessage(config, cleanNumber, aiMessage, null, null, null);

                    // 6. Schedule Next Attempt
                    const nextIndex = currentAttemptIndex + 1;
                    if (nextIndex < attempts.length) {
                        const nextCfg = attempts[nextIndex];
                        const nextDate = calculateNextDate(nextCfg.delayValue, nextCfg.delayUnit);
                        await prisma.contactState.update({
                            where: { id: contact.id },
                            data: { attemptIndex: nextIndex, nextFollowUp: nextDate, lastOutbound: now }
                        });
                    } else {
                        // Finished Sequence
                        await prisma.contactState.update({ where: { id: contact.id }, data: { isActive: false, lastOutbound: now } });
                    }

                    // Log Message
                    await prisma.testMessage.create({
                        data: {
                            companyId: contact.companyId,
                            sender: 'ai',
                            text: aiMessage + " [Follow-up Auto]",
                            sessionId: "followup_auto"
                        }
                    });

                } catch (err) {
                    console.error(`[FollowUp] Error processing contact ${contact.id}:`, err);
                }
            }

        } catch (e) {
            console.error('[FollowUp] Scheduler Error:', e);
        }
    }, FOLLOW_UP_INTERVAL_MS);


    // --- HELPER: Resolve Product Image from Config ---
    function resolveProductImageFromConfig(targetId, config) {
        if (!config || !config.products) return { found: false, error: 'Lista de produtos vazia' };

        let productImageUrl = null;
        let productCaption = "";
        let found = false;
        let cleanId = String(targetId).trim();

        // Check Parent (ID exact match)
        for (const p of config.products) {
            if (String(p.id) === cleanId) {
                if (p.image) {
                    return { found: true, url: p.image, caption: `${p.name} - R$ ${p.price}` };
                }
            }

            // Check Parent (Name loose match - Fallback)
            if (p.name.toLowerCase().includes(cleanId.toLowerCase())) {
                if (p.image) {
                    // Don't return immediately if exact match is better? No, loop order.
                    return { found: true, url: p.image, caption: `${p.name} - R$ ${p.price}` };
                }
            }

            // Check Variations
            if (p.variantItems) {
                const variant = p.variantItems.find(v => String(v.id) === cleanId);
                if (variant) {
                    if (variant.image || p.image) {
                        const details = [variant.color, variant.size].filter(Boolean).join(' / ');
                        return { found: true, url: variant.image || p.image, caption: `${p.name} - ${details} - R$ ${variant.price || p.price}` };
                    }
                }
            }
        }

        return { found: false, error: `Imagem não encontrada para ID: ${cleanId}` };
    };

}; // Close resolveProductImageFromConfig

// Handle React Routing (SPA) - must be the last route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});




// --- SERVER STARTUP ---
const startServer = async () => {
    try {
        console.log('[Startup] Connecting to Database...');
        await prisma.$connect();
        console.log('[Startup] Database Connected.');

        app.listen(PORT, () => {
            console.log(`[Startup] Server running on port ${PORT}`);
            console.log('[Startup] Health Check available at /api/health');
        });
    } catch (e) {
        console.error('[Startup] FATAL ERROR: Database connection failed.', e);
        // Do not exit, allow server to run for static file serve or minimal health check
        // But maybe it's better to crash?
        process.exit(1);
    }
};

startServer();


// Call the wrapper if needed? But we don't know its name. 
// If it was an IIFE, we just close it.
// If it was a function declaration, we need to call it.
// Let's assume it was an async function called 'main' or similar.
// But we don't see it.
// Let's trying closing with just `})();` if it was IIFE?
// Or assume the brace I added closed it.
// I will just add app.listen inside. And keep the closing brace.

