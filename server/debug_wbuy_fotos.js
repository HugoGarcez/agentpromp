import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    const configs = await prisma.agentConfig.findMany();

    let wbuyConfig = null;
    for (let c of configs) {
        if (!c.integrations) continue;
        try {
            const parsed = JSON.parse(c.integrations);
            if (parsed.wbuy && parsed.wbuy.apiUser && parsed.wbuy.apiPassword) {
                wbuyConfig = parsed.wbuy;
                if (parsed.wbuy.enabled) break;
            }
        } catch (e) { }
    }

    if (!wbuyConfig) { console.log("No wbuy credentials found."); return; }

    const authStr = `${wbuyConfig.apiUser}:${wbuyConfig.apiPassword}`;
    const base64Auth = Buffer.from(authStr).toString('base64');
    const headers = {
        'Authorization': `Bearer ${base64Auth}`,
        'User-Agent': `PrompIA Debug`
    };

    const res = await fetch('https://sistema.sistemawbuy.com.br/api/v1/product', { headers });
    if (!res.ok) { console.log("API Error:", res.status); return; }

    const data = await res.json();
    const products = data.data || data;

    if (!Array.isArray(products) || products.length === 0) {
        console.log("No products found.");
        return;
    }

    // Find a product with variations AND fotos
    const withVariations = products.filter(p => Array.isArray(p.estoque) && p.estoque.length > 0);
    const withFotos = products.filter(p => Array.isArray(p.fotos) && p.fotos.length > 0);

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total products: ${products.length}`);
    console.log(`Products with estoque (variations): ${withVariations.length}`);
    console.log(`Products with fotos: ${withFotos.length}`);

    // Show first product with both fotos AND estoque
    const target = products.find(p => 
        Array.isArray(p.estoque) && p.estoque.length > 0 && 
        Array.isArray(p.fotos) && p.fotos.length > 0
    );

    if (target) {
        console.log(`\n=== SAMPLE PRODUCT WITH FOTOS + ESTOQUE ===`);
        console.log(`Nome: ${target.produto}`);
        console.log(`\n--- FOTOS (${target.fotos.length} fotos) ---`);
        target.fotos.slice(0, 5).forEach((f, i) => {
            console.log(`  [${i}] Keys: ${Object.keys(f).join(', ')}`);
            console.log(`      foto: ${f.foto}`);
            console.log(`      id_cor: ${f.id_cor}`);
            console.log(`      cor_id: ${f.cor_id}`);
            console.log(`      idCor: ${f.idCor}`);
            console.log(`      Full: ${JSON.stringify(f)}`);
        });

        console.log(`\n--- ESTOQUE (${target.estoque.length} variações) ---`);
        target.estoque.slice(0, 5).forEach((v, i) => {
            console.log(`  [${i}] Var ID: ${v.id} | cor.id: ${v.cor?.id} | cor.nome: ${v.cor?.nome}`);
            console.log(`       v.imagem: ${v.imagem} | v.foto: ${v.foto} | v.image: ${v.image}`);
            console.log(`       v.cor keys: ${v.cor ? Object.keys(v.cor).join(', ') : 'none'}`);
            console.log(`       v.cor: ${JSON.stringify(v.cor)}`);
        });
    } else {
        console.log("\nNo product found with both fotos AND estoque!");
        
        if (withFotos.length > 0) {
            console.log(`\n=== SAMPLE PRODUCT WITH FOTOS ONLY ===`);
            const p = withFotos[0];
            console.log(`Nome: ${p.produto}`);
            console.log(`Fotos keys: ${p.fotos[0] ? Object.keys(p.fotos[0]).join(', ') : 'empty'}`);
            p.fotos.slice(0, 3).forEach((f, i) => {
                console.log(`  [${i}] ${JSON.stringify(f)}`);
            });
        }
        
        if (withVariations.length > 0) {
            console.log(`\n=== SAMPLE PRODUCT WITH ESTOQUE ONLY ===`);
            const p = withVariations[0];
            console.log(`Nome: ${p.produto}`);
            const v = p.estoque[0];
            console.log(`Estoque[0] keys: ${Object.keys(v).join(', ')}`);
            console.log(`v.cor: ${JSON.stringify(v.cor)}`);
        }
    }

    // Also save full payload for manual inspection
    fs.writeFileSync('debug_wbuy_fotos_payload.json', JSON.stringify(
        products.slice(0, 3), null, 2
    ));
    console.log(`\nSaved first 3 products to debug_wbuy_fotos_payload.json`);
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
