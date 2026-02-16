import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugSystemPrompt() {
    try {
        console.log('🔍 VERIFICANDO O QUE A IA VÊ...\n');

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

        // Filter active products only
        const activeProducts = products.filter(p => p.active !== false);

        console.log(`📊 TOTAL DE PRODUTOS ATIVOS: ${activeProducts.length}\n`);
        console.log('═'.repeat(80));

        // Show what AI sees
        let productList = "";
        activeProducts.forEach((p, index) => {
            const isService = p.type === 'service';
            const typeLabel = isService ? 'SERVIÇO' : 'PRODUTO';

            productList += `- [${typeLabel}] ID: ${p.id} | Nome: ${p.name} | Preço: R$ ${p.price}\n`;

            if (p.variantItems && p.variantItems.length > 0) {
                p.variantItems.forEach(v => {
                    const hasImage = v.image || p.image;
                    productList += `  -- [VARIAÇÃO] ID: ${v.id} | ${v.name} | ${hasImage ? '[TEM_IMAGEM]' : ''}\n`;
                });
            } else {
                const imageInstruction = p.image ? '[TEM_IMAGEM] ⚠️ USE: [SHOW_IMAGE: ' + p.id + ']' : '';
                productList += `  -- [ITEM ÚNICO] ID: ${p.id} | ${imageInstruction}\n`;
            }
            productList += '\n';
        });

        console.log('📋 LISTA EXATA QUE A IA VÊ:');
        console.log('═'.repeat(80));
        console.log(productList);
        console.log('═'.repeat(80));

        // Check specific products
        console.log('\n🔍 VERIFICANDO PRODUTOS ESPECÍFICOS:\n');
        const heroi = activeProducts.find(p => p.name.toLowerCase().includes('herói'));
        const eng = activeProducts.find(p => p.name.toLowerCase().includes('engenheiro'));
        const avent = activeProducts.find(p => p.name.toLowerCase().includes('aventureiro'));

        console.log('Camisa Herói:', heroi ? `✅ EXISTE (ID: ${heroi.id}, Imagem: ${heroi.image ? 'SIM' : 'NÃO'})` : '❌ NÃO EXISTE');
        console.log('Camisa Engenheiro:', eng ? `✅ EXISTE (ID: ${eng.id})` : '❌ NÃO EXISTE');
        console.log('Camisa Aventureiro:', avent ? `✅ EXISTE (ID: ${avent.id})` : '❌ NÃO EXISTE');

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugSystemPrompt();
