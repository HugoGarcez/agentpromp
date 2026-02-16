import cron from 'node-cron';
// Removed PrismaClient import to use dependency injection
import { extractFromUrl } from './extractor.js'; // Note the .js extension for imports

// Initialize Scheduler
export function initScheduler(prisma) {
    console.log('[Scheduler] Initializing Product Extraction Scheduler...');

    // Run every hour
    cron.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Running scheduled extraction task...');
        await runScheduledExtractions(prisma);
    });
}

export async function runScheduledExtractions(prisma) {
    // ... (Logic remains same)
    try {
        const now = new Date();

        // Find sources due for update
        const sources = await prisma.productSource.findMany({
            where: {
                status: 'active',
                OR: [
                    { nextRun: { lte: now } },
                    { nextRun: null }
                ]
            }
        });

        console.log(`[Scheduler] Found ${sources.length} sources to process.`);

        for (const source of sources) {
            await processSource(source, prisma);
        }

    } catch (error) {
        console.error('[Scheduler] Error in runScheduledExtractions:', error);
    }
}

async function processSource(source, prisma) {
    try {
        console.log(`[Scheduler] Processing source ${source.id} (${source.url || 'File'})...`);

        let newProducts = [];

        if (source.type === 'URL' && source.url) {
            newProducts = await extractFromUrl(source.url);
        }

        if (newProducts.length > 0) {
            const config = await prisma.agentConfig.findUnique({ where: { companyId: source.companyId } });
            if (config) {
                let currentProducts = config.products ? JSON.parse(config.products) : [];

                const formattedProducts = newProducts.map(p => ({
                    id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: p.name,
                    price: p.price,
                    description: p.description,
                    image: p.image,
                    type: 'product',
                    active: true,
                    unit: 'Unidade',
                    sourceId: source.id
                }));

                const updatedProducts = [...currentProducts, ...formattedProducts];

                await prisma.agentConfig.update({
                    where: { id: config.id },
                    data: { products: JSON.stringify(updatedProducts) }
                });

                console.log(`[Scheduler] Added ${formattedProducts.length} products to Company ${source.companyId}`);
            }
        }

        let nextRun = new Date();
        if (source.frequency === 'hourly') nextRun.setHours(nextRun.getHours() + 1);
        else if (source.frequency === 'daily') nextRun.setDate(nextRun.getDate() + 1);
        else if (source.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        else {
            await prisma.productSource.update({
                where: { id: source.id },
                data: { status: 'completed', lastRun: new Date() }
            });
            return;
        }

        await prisma.productSource.update({
            where: { id: source.id },
            data: {
                lastRun: new Date(),
                nextRun: nextRun,
                error: null
            }
        });

    } catch (error) {
        console.error(`[Scheduler] Error processing source ${source.id}:`, error);
        await prisma.productSource.update({
            where: { id: source.id },
            data: { error: error.message, status: 'error' }
        });
    }
}

