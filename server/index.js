import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve Static Frontend (Vite Build)
app.use(express.static(path.join(__dirname, '../dist')));

// Path to store config
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Helper to read config
const readConfig = async () => {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
};

// Helper to save config
const saveConfig = async (config) => {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
};

// Endpoint to receive configuration from Frontend
app.post('/api/config', async (req, res) => {
    try {
        const newConfig = req.body;
        console.log('Received new config:', newConfig);

        // Merge with existing config or overwrite
        const currentConfig = await readConfig() || {};
        const updatedConfig = { ...currentConfig, ...newConfig };

        await saveConfig(updatedConfig);

        res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({ success: false, message: 'Failed to save configuration' });
    }
});

// Endpoint for Webhook
app.post('/webhook', async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));

        // Handle array format (as per user request example)
        const payload = Array.isArray(req.body) ? req.body[0] : req.body;
        const body = payload.body || {};
        const content = body.content || {};
        const contact = body.contact || {};

        const userMessage = content.text;
        const userName = contact.name || 'Usuário';

        if (!userMessage) {
            return res.status(400).json({ error: 'No message text found' });
        }

        // Load Configuration
        const config = await readConfig();
        if (!config || !config.integrations?.openaiKey) {
            console.error('OpenAI Key not configured');
            return res.status(500).json({ error: 'OpenAI API Key not configured on server' });
        }

        // Initialize OpenAI
        const openai = new OpenAI({
            apiKey: config.integrations.openaiKey,
        });

        // Construct System Prompt
        // If we have a stored system prompt from frontend, use it. Otherwise fallback.
        let systemPrompt = config.systemPrompt;

        if (!systemPrompt) {
            // Fallback construction if raw prompt isn't saved, but parts are
            const persona = config.persona || {};
            systemPrompt = `Você é ${persona.name || 'Assistente'}, um ${persona.role || 'assistente helpful'}.`;
        }

        // Inject Products if available
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

        // In a real scenario, you would send this response back to the chat platform (e.g., via n8n or another webhook).
        // For now, we return it in the response.

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
