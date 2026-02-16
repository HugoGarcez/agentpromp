
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function restore() {
    console.log('🔄 Iniciando restauração do Agente...');

    try {
        const company = await prisma.company.findFirst();

        if (!company) {
            console.error('❌ Nenhuma empresa encontrada!');
            return;
        }

        console.log(`✅ Empresa encontrada: ${company.name} (ID: ${company.id})`);

        const existingConfig = await prisma.agentConfig.findUnique({
            where: { companyId: company.id }
        });

        const openaiKey = process.env.OPENAI_API_KEY || 'sk-proj-placeholder-if-missing';

        const updates = {
            prompIdentity: 'Agente Promp',
            // REMOVED INVALID FIELDS: active, status
            integrations: JSON.stringify({
                openaiKey: openaiKey,
                whatsapp: { status: 'connected' }
            }),
            systemPrompt: existingConfig?.systemPrompt || 'Você é um assistente virtual útil.',
            model: existingConfig?.model || 'gpt-4o-mini',
        };

        console.log('🛠 Atualizando configuração (Corrigido)...');
        console.log('Chave OpenAI:', openaiKey.substring(0, 10) + '...');

        await prisma.agentConfig.upsert({
            where: { companyId: company.id },
            update: updates,
            create: {
                companyId: company.id,
                ...updates,
                temperature: 0.7
            }
        });

        console.log('✅ Agente reativado com sucesso!');
        console.log('🔑 Integrações salvas no banco de dados.');

    } catch (error) {
        console.error('❌ Erro fatal:', error);
    } finally {
        await prisma.$disconnect();
    }
}

restore();
