
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const companyId = 'b013dd1c-3cc8-4c57-bd4e-c5215f9337a3'; // From user log

    console.log('--- CHECKING COMPANY CONFIG ---');
    const config = await prisma.agentConfig.findUnique({ where: { companyId } });
    if (config) {
        console.log('Found Config:');
        console.log(' - Company ID:', config.companyId);
        console.log(' - OpenAI Key Set:', config.integrations?.openaiKey ? 'YES' : 'NO'); // Check JSON
        console.log(' - Promp UUID:', config.prompUuid ? 'YES (Value Present)' : 'NO');
        console.log(' - Promp Token:', config.prompToken ? 'YES (Value Present)' : 'NO');
        console.log(' - Persona Set:', config.persona ? 'YES' : 'NO');
    } else {
        console.log('❌ NO CONFIG FOUND for this Company!');
    }

    console.log('\n--- CHECKING GLOBAL CONFIG ---');
    const adminConfig = await prisma.globalConfig.findFirst();
    if (adminConfig) {
        console.log('Found AdminConfig:');
        console.log(' - Global OpenAI Key:', adminConfig.openaiKey ? 'YES (masked ending: ...' + adminConfig.openaiKey.slice(-4) + ')' : 'NO');
    } else {
        console.log('❌ NO ADMIN CONFIG FOUND!');
    }

    // Check if the Env also has it
    console.log(' - ENV OpenAI Key:', process.env.OPENAI_API_KEY ? 'YES' : 'NO');
}

check().then(() => prisma.$disconnect()).catch(e => console.error(e));
