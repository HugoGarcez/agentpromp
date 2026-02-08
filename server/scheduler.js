const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { extractFromUrl } = require('./extractor');

const prisma = new PrismaClient();

// Initialize Scheduler
function initScheduler() {
    console.log('[Scheduler] Initializing Product Extraction Scheduler...');

    // Run every hour
    cron.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Running scheduled extraction task...');
        await runScheduledExtractions();
    });
}

async function runScheduledExtractions() {
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
            await processSource(source);
        }

    } catch (error) {
        console.error('[Scheduler] Error in runScheduledExtractions:', error);
    }
}

async function processSource(source) {
    try {
        console.log(`[Scheduler] Processing source ${source.id} (${source.url || 'File'})...`);

        let newProducts = [];

        if (source.type === 'URL' && source.url) {
            newProducts = await extractFromUrl(source.url);
        }
        // TODO: Handle File re-processing if needed (usually files are one-time or re-uploaded)

        if (newProducts.length > 0) {
            // Update Agent Config
            // We need to merge or replace? 
            // Strategy: Add new, Update existing by Name text match?
            // For simplicity: Append new ones that don't exist?
            // Or if it's a catalog sync, maybe replace ALL from this source?
            // Current DB structure puts all products in one JSON blob in AgentConfig.
            // This is tricky.
            // Let's look at AgentConfig.

            const config = await prisma.agentConfig.findUnique({ where: { companyId: source.companyId } });
            if (config) {
                let currentProducts = config.products ? JSON.parse(config.products) : [];

                // Simple Merge Strategy: Append new items with a tag 'sourceId'?
                // Or just add them.
                // Let's map new products to our schema
                const formattedProducts = newProducts.map(p => ({
                    id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: p.name,
                    price: p.price,
                    description: p.description,
                    image: p.image,
                    type: 'product',
                    active: true,
                    unit: 'Unidade',
                    sourceId: source.id // Track origin
                }));

                // Filter out duplicates by name?
                // Provide option later. For now, just add.
                const updatedProducts = [...currentProducts, ...formattedProducts];

                await prisma.agentConfig.update({
                    where: { id: config.id },
                    data: { products: JSON.stringify(updatedProducts) }
                });

                console.log(`[Scheduler] Added ${formattedProducts.length} products to Company ${source.companyId}`);
            }
        }

        // Update Next Run
        let nextRun = new Date();
        if (source.frequency === 'hourly') nextRun.setHours(nextRun.getHours() + 1);
        else if (source.frequency === 'daily') nextRun.setDate(nextRun.getDate() + 1);
        else if (source.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        else {
            // 'once' -> disable
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
            data: { error: error.message, status: 'error' } // Or keep active to retry?
        });
    }
}

module.exports = { initScheduler, runScheduledExtractions };
