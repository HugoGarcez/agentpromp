import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugProductList() {
    try {
        console.log('🔍 Verificando como os produtos são apresentados para a IA...\n');

        const agentConfig = await prisma.agentConfig.findUnique({
            where: {
                companyId: 'b013dd1c-3cc8-4c57-bd4e-c5215f9337a3'
            }
        });

        if (!agentConfig) {
            console.log('❌ AgentConfig não encontrado!');
            return;
        }

        // Parse products
        let products = agentConfig.products;
        if (typeof products === 'string') {
            products = JSON.parse(products);
        }

        console.log('📋 LISTA FORMATADA COMO A IA VÊ:\n');
        console.log('═'.repeat(80));

        products.forEach((p, index) => {
            if (p.active === false) return;

            const isService = p.type === 'service';
            const typeLabel = isService ? 'SERVIÇO' : 'PRODUTO';
            const pdfTag = p.pdf ? `[TEM_PDF] (ID: ${p.id})` : '';
            const paymentLinkCtx = p.hasPaymentLink ? `[TEM_LINK_PAGAMENTO] (Link: ${p.paymentLink})` : '';

            let unitLabel = p.unit || 'Unidade';
            let priceDisplay = `R$ ${p.price}`;

            console.log(`\n${index + 1}. [${typeLabel}] ID: ${p.id} | Nome: ${p.name} | Preço: ${priceDisplay} / ${unitLabel}. ${pdfTag} ${paymentLinkCtx}`);

            if (p.description) console.log(`  Descrição: ${p.description}`);
            if (p.paymentConditions) console.log(`  Condições: ${p.paymentConditions}`);

            // Variações ou Item Único
            if (p.variantItems && p.variantItems.length > 0) {
                p.variantItems.forEach(v => {
                    const hasImage = v.image || p.image;
                    console.log(`  -- [VARIAÇÃO] ID: ${v.id} | ${v.name} (${v.color || ''} ${v.size || ''}) | R$ ${v.price || p.price} | ${hasImage ? '[TEM_IMAGEM]' : ''}`);
                });
            } else {
                // Item Único
                console.log(`  -- [ITEM ÚNICO] ID: ${p.id} | ${p.image ? '[TEM_IMAGEM]' : ''}`);
            }
        });

        console.log('\n' + '═'.repeat(80));

        // Verificar especificamente as duas camisas
        console.log('\n\n🔬 ANÁLISE ESPECÍFICA DAS CAMISAS:\n');

        const camisaHeroi = products.find(p => p.name.toLowerCase().includes('herói'));
        const camisaEng = products.find(p => p.name.toLowerCase().includes('engenheiro'));

        if (camisaHeroi) {
            console.log('👕 CAMISA DO HERÓI:');
            console.log(`   ID: ${camisaHeroi.id}`);
            console.log(`   Nome: ${camisaHeroi.name}`);
            console.log(`   Nome (bytes): ${Buffer.from(camisaHeroi.name).toString('hex')}`);
            console.log(`   Tem image field: ${camisaHeroi.image ? 'SIM' : 'NÃO'}`);
            console.log(`   Image value: ${camisaHeroi.image || 'null'}`);
        }

        if (camisaEng) {
            console.log('\n👔 CAMISA ENGENHEIRO:');
            console.log(`   ID: ${camisaEng.id}`);
            console.log(`   Nome: ${camisaEng.name}`);
            console.log(`   Nome (bytes): ${Buffer.from(camisaEng.name).toString('hex')}`);
            console.log(`   Tem image field: ${camisaEng.image ? 'SIM' : 'NÃO'}`);
            console.log(`   Image value: ${camisaEng.image || 'null'}`);
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugProductList();
