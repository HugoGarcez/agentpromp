import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
    const adminEmail = 'hugo@promp.com.br';

    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    if (existingAdmin) {
        console.log('Admin user already exists.');
        return;
    }

    // Generate Random Password
    const adminPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create Admin Company
    const adminCompany = await prisma.company.create({
        data: {
            name: 'Promp Admin',
        },
    });

    // Create Admin User
    const adminUser = await prisma.user.create({
        data: {
            email: adminEmail,
            password: hashedPassword,
            role: 'ADMIN',
            companyId: adminCompany.id,
        },
    });

    console.log('------------------------------------------------');
    console.log('Admin User Created:');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log('------------------------------------------------');

    // Create Standard User for testing
    const standardEmail = 'user@promp.com.br';
    const standardPassword = crypto.randomBytes(8).toString('hex');
    const hashedStandardPassword = await bcrypt.hash(standardPassword, 10);

    const standardCompany = await prisma.company.create({
        data: {
            name: 'Demo Company',
        },
    });

    const standardUser = await prisma.user.create({
        data: {
            email: standardEmail,
            password: hashedStandardPassword,
            role: 'USER',
            companyId: standardCompany.id,
        },
    });

    console.log('Standard User Created:');
    console.log(`Email: ${standardEmail}`);
    console.log(`Password: ${standardPassword}`);
    console.log('------------------------------------------------');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
