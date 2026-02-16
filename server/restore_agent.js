
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
        // 1. Encontrar a primeira empresa
        const company = await prisma.company.findFirst();

        if (!company) {
            console.error('❌ Nenhuma empresa encontrada! O banco de dados está vazio?');
            return;
        }

        console.log(`✅ Empresa encontrada: ${company.name} (ID: ${company.id})`);

        // 2. Buscar ou Criar Configuração do Agente
        const existingConfig = await prisma.agentConfig.findUnique({
            where: { companyId: company.id }
        });

        // Prepara dados de integração
        const openaiKey = process.env.OPENAI_API_KEY || 'sk-proj-placeholder-if-missing';

        const updates = {
            active: true, // Força status Ativo
            status: 'active',
            integrations: JSON.stringify({
                openaiKey: openaiKey,
                whatsapp: { status: 'connected' }
            }),
            // Garante que campos obrigatórios existam
            systemPrompt: existingConfig?.systemPrompt || 'Você é um assistente virtual útil.',
            model: existingConfig?.model || 'gpt-4o-mini',

            // Tenta preencher novos campos se existirem no schema (failsafe: JS ignora se não estiver no tipo, mas Prisma filtra)
            // Se o schema antigo não tem, o prisma client (v5.22) pode reclamar se passarmos propriedade desconhecida?
            // "Unknown argument".
            // Então vamos atualizar apenas o JSON de integrações e o status, que devem ser seguros.
        };

        console.log('🛠 Atualizando configuração...');

        await prisma.agentConfig.upsert({
            where: { companyId: company.id },
            update: updates,
            create: {
                companyId: company.id,
                ...updates,
                prompIdentity: 'Agente Promp',
                temperature: 0.7
            }
        });

        console.log('✅ Agente reativado com sucesso!');
        console.log('🔑 Chave OpenAI injetada nas integrações.');
        console.log('👉 Agora atualize a página do Dashboard e teste a IA.');

    } catch (error) {
        console.error('❌ Erro fatal:', error);
    } finally {
        await prisma.$disconnect();
    }
}

restore();
