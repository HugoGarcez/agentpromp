
import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to write base64 to temp file
const writeTempFile = async (base64Data, ext = 'mp3') => {
    const fileName = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = path.join(__dirname, '../temp', fileName);

    // Ensure temp dir exists
    if (!fs.existsSync(path.join(__dirname, '../temp'))) {
        fs.mkdirSync(path.join(__dirname, '../temp'), { recursive: true });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
};

// 1. Transcribe Audio (OpenAI Whisper)
export const transcribeAudio = async (base64Audio, openaiKey) => {
    if (!base64Audio || !openaiKey) return null;

    let tempFile = null;
    try {
        const openai = new OpenAI({ apiKey: openaiKey });

        // Write to file (Whisper needs a file object usually)
        tempFile = await writeTempFile(base64Audio, 'mp3'); // or ogg/wav depending on source

        console.log(`[Audio] Transcribing ${tempFile}...`);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFile),
            model: "whisper-1",
            language: "pt" // Optional: Force Portuguese slightly improves speed/accuracy
        });

        console.log(`[Audio] Transcription Result: "${transcription.text}"`);
        return transcription.text;

    } catch (error) {
        console.error('[Audio] Transcription Failed:', error);
        return null;
    } finally {
        // Cleanup
        if (tempFile) {
            fs.unlink(tempFile, (err) => {
                if (err) console.error('[Audio] Cleanup Error:', err);
            });
        }
    }
};

// 1.5 Preprocess Text for Better Pronunciation (Phonetic Mapping)
const preprocessTextForAudio = (text) => {
    if (!text) return "";

    let clean = text;

    // A. Remove Markdown characters that might confuse TTS (or be read literally)
    clean = clean.replace(/[*_#`]/g, '');

    // B. Phonetic Replacements (English -> Portuguese Phonetics)
    // Add more here as needed based on user feedback
    const phoneticMap = {
        'Prime': 'Praime',
        'prime': 'praime',
        'Premium': 'Prêmium',
        'premium': 'prêmium',
        'Black': 'Bléque',
        'black': 'bléque',
        'Gold': 'Gôuld',
        'gold': 'gôuld',
        'Standard': 'Istandard',
        'standard': 'istandard',
        'Business': 'Bízness',
        'business': 'bízness',
        'Enterprise': 'Enter praise',
        'enterprise': 'enter praise',
        'Online': 'On laine',
        'online': 'on laine',
        'Offline': 'Of laine',
        'offline': 'of laine',
        'Home': 'Rôum',
        'home': 'rôum',
        'Office': 'Ófis',
        'office': 'ófis',
        'Feedback': 'Fid béque',
        'feedback': 'fid béque',
        'Ticket': 'Tí que t',
        'ticket': 'tí que t',
        'Login': 'Loguin',
        'login': 'loguin',
        'E-mail': 'E-mail', // Usually ok
        'Email': 'E-mail',
        'email': 'e-mail',
        'Site': 'Saite',
        'site': 'saite',
        'Web': 'Ueb',
        'web': 'ueb',
        'App': 'Ép',
        'app': 'ép',
        'Software': 'Sóft uér',
        'software': 'sóft uér',
        'Design': 'Dezáin',
        'design': 'dezáin',
        'Layout': 'Lei aut',
        'layout': 'lei aut',
        'Briefing': 'Brífing',
        'briefing': 'brífing',
        'Deadline': 'Déd lain',
        'deadline': 'déd lain',
        'Budget': 'Bã djet',
        'budget': 'bã djet',
        'Follow-up': 'Folo uáp',
        'follow-up': 'folo uáp'
    };

    // Apply replacements using Word Boundary \b to avoid partial matches
    Object.keys(phoneticMap).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'g'); // strict word boundary
        clean = clean.replace(regex, phoneticMap[key]);
    });

    // C. Remove excessive newlines (Double enter in text = long pause in audio? Usually ok, but let's reduce > 2)
    clean = clean.replace(/\n{3,}/g, '\n\n');

    return clean;
};

// 2. Generate Audio (ElevenLabs)
export const generateAudio = async (rawText, elevenLabsKey, voiceId) => {
    if (!rawText || !elevenLabsKey || !voiceId) {
        console.log('[Audio] Skipping Generation (Missing Config/Text)');
        return null;
    }

    // Apply Preprocessing
    const text = preprocessTextForAudio(rawText);

    try {
        console.log(`[Audio] Generating Speech for: "${text.substring(0, 30)}..."`);
        console.log(`[Audio] Using Voice ID: ${voiceId}`);

        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            data: {
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            },
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': elevenLabsKey,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer' // Important for binary data
        });

        // Convert Buffer to Base64
        const audioBase64 = Buffer.from(response.data).toString('base64');
        console.log(`[Audio] Generation Success. Base64 Length: ${audioBase64.length}`);
        return audioBase64;

    } catch (error) {
        console.error('[Audio] Generation Failed:', error.response?.data ? JSON.stringify(error.response.data) : error.message);
        return null;
    }
};

// 3. Resolve Voice ID from Agent ID
export const resolveVoiceFromAgent = async (agentId, apiKey) => {
    if (!agentId || !agentId.startsWith('agent_')) return agentId;

    try {
        console.log(`[Audio] Resolving Voice ID for Agent: ${agentId}`);
        const response = await axios.get(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
            headers: { 'xi-api-key': apiKey }
        });

        const voiceId = response.data?.conversation_config?.tts?.voice_id;
        if (voiceId) {
            console.log(`[Audio] Resolved Agent ${agentId} -> Voice ${voiceId}`);
            return voiceId;
        } else {
            console.warn(`[Audio] Could not find Voice ID in Agent config. Using default.`);
            return null;
        }
    } catch (error) {
        console.error(`[Audio] Agent Resolution Failed: ${error.message}`);
        return null;
    }
};
