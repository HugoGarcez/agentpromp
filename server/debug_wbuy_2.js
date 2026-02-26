import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    const configs = await prisma.agentConfig.findMany();

    let wbuyConfig = null;
    let fallbackConfig = null;
    for (let c of configs) {
        if (!c.integrations) continue;
        try {
            const parsed = JSON.parse(c.integrations);
            if (parsed.wbuy && parsed.wbuy.apiUser && parsed.wbuy.apiPassword) {
                fallbackConfig = parsed.wbuy;
                if (parsed.wbuy.enabled) {
                    wbuyConfig = parsed.wbuy;
                    break;
                }
            }
        } catch (e) { }
    }

    wbuyConfig = wbuyConfig || fallbackConfig;

    if (!wbuyConfig) { console.log("No wbuy credentials found anywhere."); return; }

    console.log("Using API User: " + wbuyConfig.apiUser);

    const authStr = `${wbuyConfig.apiUser}:${wbuyConfig.apiPassword}`;
    const base64Auth = Buffer.from(authStr).toString('base64');

    const res = await fetch('https://sistema.sistemawbuy.com.br/api/v1/product', {
        headers: {
            'Authorization': `Bearer ${base64Auth}`,
            'User-Agent': `PrompIA Debug`
        }
    });

    if (!res.ok) {
        console.log("API Error:", res.status, res.statusText);
        return;
    }

    const data = await res.json();
    fs.writeFileSync('debug_wbuy_payload.json', JSON.stringify(data, null, 2));
    console.log(`Saved debug_wbuy_payload.json`);
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
