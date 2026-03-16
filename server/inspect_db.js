import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajusta a URL do banco para apontar para prisma/dev.db
process.env.DATABASE_URL = `file:${path.join(__dirname, 'prisma', 'dev.db')}`;

const prisma = new PrismaClient();

async function main() {
    const companies = await prisma.company.findMany({
        include: {
            users: { select: { email: true, id: true } },
            agents: { select: { id: true, name: true, prompIdentity: true, prompConnectionId: true } },
            prompChannels: {
                include: {
                    agents: { select: { id: true, name: true } }
                }
            }
        }
    });

    console.log(JSON.stringify(companies, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
