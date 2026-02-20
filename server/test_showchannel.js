import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function test() {
    const config = await prisma.agentConfig.findFirst({
        where: { prompToken: { not: null } }
    });
    
    if (!config) {
        console.log("No config with prompToken found");
        return;
    }
    
    console.log("Found token:", config.prompToken);
    
    // We need a number to test. Let's take the latest testMessage owner
    const msg = await prisma.testMessage.findFirst({
        where: { owner: { not: null }, companyId: config.companyId },
        orderBy: { createdAt: 'desc' }
    });
    
    const number = msg ? msg.owner : "5515998566622"; // default to the one from screenshot
    console.log("Testing with number:", number);
    
    const url = `${process.env.PROMP_BASE_URL}/v2/api/external/${config.prompToken}/showChannel`;
    console.log("Calling", url);
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number })
        });
        
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
