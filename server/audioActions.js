
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

// 2. Generate Audio (ElevenLabs)
export const generateAudio = async (text, elevenLabsKey, voiceId) => {
    if (!text || !elevenLabsKey || !voiceId) {
        console.log('[Audio] Skipping Generation (Missing Config/Text)');
        return null;
    }

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
