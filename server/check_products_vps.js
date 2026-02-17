import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProducts() {
    try {
        const configs = await prisma.agentConfig.findMany({
            include: { company: true },
            orderBy: { id: 'desc' }
        });

        for (const config of configs) {
            console.log('\n' + '='.repeat(80));
            console.log(`🏢 ${config.company?.name || 'N/A'} (${config.companyId})`);
            console.log('='.repeat(80));

            const products = typeof config.products === 'string'
                ? JSON.parse(config.products)
                : config.products;

            const activeProducts = products?.filter(p => p.active !== false) || [];
            console.log(`📦 Produtos ativos: ${activeProducts.length}\n`);

            activeProducts.forEach((p, i) => {
                console.log(`${i + 1}. ${p.name}`);
                console.log(`   ID: ${p.id}`);
                console.log(`   Preço: R$ ${p.price}`);
                console.log(`   Imagem: ${p.image ? '✅ TEM' : '❌ FALTA'}`);
                if (p.image) {
                    const imgType = p.image.startsWith('data:') ? 'BASE64' : 'URL';
                    const preview = p.image.substring(0, 50);
                    console.log(`   Tipo: ${imgType} (${preview}...)`);
                }
                console.log(`   CompanyId: ${p.companyId || '⚠️ SEM'}`);

                if (p.variantItems?.length > 0) {
                    console.log(`   Variações: ${p.variantItems.length}`);
                    p.variantItems.forEach((v, j) => {
                        console.log(`      ${j + 1}. ${v.color || ''} ${v.size || ''} (${v.id})`);
                        console.log(`         Img: ${v.image ? '✅' : '❌'}`);
                    });
                }
                console.log('');
            });
        }
    } catch (error) {
        console.error('❌', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkProducts();
