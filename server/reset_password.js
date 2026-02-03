import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load env if exists
dotenv.config();

const prisma = new PrismaClient();

async function resetPassword() {
    const email = 'hugo@promp.com.br';
    const newPassword = 'promp_admin_reset';

    console.log("--- DIAGNÓSTICO DE RESET DE SENHA ---");
    console.log(`📂 Diretório Atual: ${process.cwd()}`);
    console.log(`🗄️  DATABASE_URL: ${process.env.DATABASE_URL || 'Não definido (usando padrão do schema)'}`);

    try {
        // 1. Listar usuários
        console.log("\n👥 Usuários encontrados no banco:");
        const users = await prisma.user.findMany();
        users.forEach(u => console.log(` - [${u.role}] ${u.email} (ID: ${u.id})`));

        // 2. Buscar usuário específico
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            console.log(`\n❌ ERRO: Usuário ${email} não encontrado neste banco.`);
            return;
        }

        // 3. Resetar
        console.log(`\n🔄 Resetando senha para: ${email}...`);
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });

        console.log(`✅ Senha atualizada no banco.`);

        // 4. Verificação imediata
        console.log(`\n🕵️ Verificando se a senha funciona...`);
        const updatedUser = await prisma.user.findUnique({ where: { email } });
        const isValid = await bcrypt.compare(newPassword, updatedUser.password);

        if (isValid) {
            console.log("✅ CHECK: A senha nova é VÁLIDA (bcrypt compare passou).");
            console.log(`� Login: ${email}`);
            console.log(`🔑 Senha: ${newPassword}`);
        } else {
            console.log("❌ CHECK: A senha falhou na verificação imediata. Algo muito estranho aconteceu.");
        }

    } catch (error) {
        console.error('❌ EXCEÇÃO:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetPassword();
