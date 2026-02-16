import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listProducts() {
    try {
        console.log('🔍 Buscando produtos da empresa b013dd1c-3cc8-4c57-bd4e-c5215f9337a3...\n');

        const agentConfig = await prisma.agentConfig.findUnique({
            where: {
                companyId: 'b013dd1c-3cc8-4c57-bd4e-c5215f9337a3'
            }
        });

        if (!agentConfig) {
            console.log('❌ AgentConfig não encontrado!');
            return;
        }

        // Parse products if it's a string
        let products = agentConfig.products;
        if (typeof products === 'string') {
            console.log('⚠️  Products está como STRING (precisa do fix!)');
            products = JSON.parse(products);
        } else {
            console.log('✅ Products já está como ARRAY');
        }

        if (!Array.isArray(products)) {
            console.log('❌ Products não é um array!');
            console.log('Type:', typeof products);
            console.log('Value:', products);
            return;
        }

        console.log(`\n📦 Total de produtos: ${products.length}\n`);
        console.log('='.repeat(80));

        products.forEach((product, index) => {
            console.log(`\n${index + 1}. ID: ${product.id}`);
            console.log(`   Nome: ${product.name}`);
            console.log(`   Preço: R$ ${product.price}`);
            console.log(`   Imagem: ${product.image ? '✅ SIM' : '❌ NÃO'}`);

            if (product.name.toLowerCase().includes('engenheiro')) {
                console.log('   🎯 <<< ESTE É O PRODUTO QUE ESTÁ FALHANDO!');
            }
        });

        console.log('\n' + '='.repeat(80));

    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await prisma.$disconnect();
    }
}

listProducts();
