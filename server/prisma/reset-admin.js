
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const adminEmail = 'hugo@promp.com.br';
    const newPassword = 'promp.admin.2024'; // Senha Provisória Forte

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Upsert Admin Company
    const company = await prisma.company.upsert({
        where: { id: 'admin-company' }, // Tenta achar por ID, se não cria
        update: {},
        create: {
            id: 'admin-company',
            name: 'Promp Admin',
        }
    });

    // Upsert Admin User
    const user = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            password: hashedPassword,
            role: 'ADMIN',
            companyId: company.id
        },
        create: {
            email: adminEmail,
            password: hashedPassword,
            role: 'ADMIN',
            companyId: company.id
        }
    });

    console.log('✅ Admin Access Restored!');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${newPassword}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
