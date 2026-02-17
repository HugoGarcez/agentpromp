import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProductImages() {
    try {
        console.log('🔍 Buscando todas configurações...\n');

        // Busca TODAS as configs
        const configs = await prisma.agentConfig.findMany({
            include: {
                company: true
            },
            orderBy: { id: 'desc' }
        });

        console.log(`✅ Encontradas ${configs.length} configs!\n`);

        for (const config of configs) {
            console.log('\n' + '='.repeat(100));
            console.log(`🏢 EMPRESA: ${config.company?.name || 'N/A'}`);
            console.log(`   Company ID: ${config.companyId}`);
            console.log('='.repeat(100));

            // Parse products
            const products = typeof config.products === 'string'
                ? JSON.parse(config.products)
                : config.products;

            console.log(`\n📦 Total de produtos nesta empresa: ${products?.length || 0}`);

            if (!products || products.length === 0) {
                console.log('⚠️ Nenhum produto encontrado!');
                continue;
            }

            // Analisar cada produto
            products.forEach((p, index) => {
                console.log(`\n   ${index + 1}. ${p.name || 'SEM NOME'}`);
                console.log(`      ID: ${p.id}`);
                console.log(`      Tipo: ${p.type || 'product'}`);
                console.log(`      Preço: R$ ${p.price || 'N/A'}`);
                console.log(`      Imagem: ${p.image ? '✅ TEM' : '❌ NÃO TEM'}`);
                if (p.image) {
                    const shortUrl = p.image.length > 60 ? p.image.substring(0, 60) + '...' : p.image;
                    console.log(`      URL: ${shortUrl}`);
                }
                console.log(`      Active: ${p.active !== false ? '✅' : '❌'}`);
                console.log(`      CompanyId: ${p.companyId || '⚠️ SEM companyId'}`);

                // Variações
                if (p.variantItems && p.variantItems.length > 0) {
                    console.log(`      Variações: ${p.variantItems.length}`);
                    p.variantItems.forEach((v, vIndex) => {
                        console.log(`         ${vIndex + 1}. ${v.color || ''} ${v.size || ''} - R$ ${v.price || p.price}`);
                        console.log(`            ID Variação: ${v.id}`);
                        console.log(`            Imagem: ${v.image ? '✅ TEM' : '❌ USA IMAGEM DO PAI'}`);
                    });
                }
            });

            console.log(`\n\n   📊 RESUMO DESTA EMPRESA:`);
            const withImage = products.filter(p => p.image);
            const withoutImage = products.filter(p => !p.image);

            console.log(`   Total: ${products.length}`);
            console.log(`   Com imagem: ${withImage.length}`);
            console.log(`   Sem imagem: ${withoutImage.length}`);
            console.log(`   Com companyId: ${products.filter(p => p.companyId).length}`);
            console.log(`   Ativos: ${products.filter(p => p.active !== false).length}`);
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkProductImages();
