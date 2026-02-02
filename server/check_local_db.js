
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking database users...');

    // Find our specific user
    const email = 'hugo@promp.com.br';
    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log(`User ${email} NOT FOUND in local database.`);
        console.log('Listing all users:');
        const allUsers = await prisma.user.findMany();
        console.log(allUsers.map(u => u.email));
    } else {
        console.log(`User found: ${user.email}, Role: ${user.role}, CompanyId: ${user.companyId}`);
        // Test password
        const pass = 'promp_admin_123';
        const isMatch = await bcrypt.compare(pass, user.password);
        console.log(`Password '${pass}' match: ${isMatch}`);

        if (!isMatch) {
            console.log('Resetting password to promp_admin_123...');
            const hashed = await bcrypt.hash(pass, 10);
            await prisma.user.update({
                where: { email },
                data: { password: hashed }
            });
            console.log('Password reset complete.');
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
