const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    const agents = await prisma.agentConfig.findMany();
    console.log('Total agents:', agents.length);
    for (let ag of agents) {
        console.log(`Agent: ${ag.id} | Name: ${ag.name} | Company: ${ag.companyId}`);
        console.log(`Persona:`, ag.persona ? ag.persona.substring(0, 50) : 'null');
        console.log(`KnowledgeBase:`, ag.knowledgeBase ? ag.knowledgeBase.substring(0, 50) : 'null');
    }
}

debug()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
