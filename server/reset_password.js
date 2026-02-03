import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPassword() {
    const email = 'hugo@promp.com.br';
    const newPassword = 'promp_admin_reset'; // Temporary password

    try {
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            console.log(`❌ Usuário ${email} não encontrado.`);
            return;
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });

        console.log(`✅ Senha alterada com sucesso!`);
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Nova Senha Temporária: ${newPassword}`);

    } catch (error) {
        console.error('Erro ao resetar senha:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetPassword();
