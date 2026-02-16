
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load server/.env to ensuring we hit the correct DB
dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function fix() {
    console.log('--- FIXING GLOBAL CONFIG (RESET) ---');
    console.log(`Database URL: ${process.env.DATABASE_URL}`);

    try {
        // 1. Delete all existing
        const deleted = await prisma.globalConfig.deleteMany({});
        console.log(`Cleared Global Config table. Deleted count: ${deleted.count}`);

        // 2. Create fresh record
        const created = await prisma.globalConfig.create({
            data: {
                openaiKey: '',
                geminiKey: '',
                elevenLabsKey: '',
                elevenLabsVoiceId: '',
                googleClientId: '',
                googleClientSecret: '',
                googleRedirectUri: ''
            }
        });
        console.log('Created FRESH Global Config record with ID:', created.id);

    } catch (e) {
        console.error('Error during fix:', e);
    }
}

fix().then(() => prisma.$disconnect());
