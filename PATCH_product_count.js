// PATCH: Product Count Verification
// Insert this code right after line 1616 (after the products.forEach loop ends)

// Count products by type
const productCounts = { produtos: [], servicos: [] };
config.products.forEach(p => {
    if (p.active !== false) {
        if (p.type === 'service') {
            productCounts.servicos.push(p.name);
        } else {
            productCounts.produtos.push(p.name);
        }
    }
});

// Build verification header
let verificationHeader = `
🔴 VERIFICAÇÃO DE ESTOQUE ATUAL (GERADA AUTOMATICAMENTE):
═══════════════════════════════════════════════════════════════
`;
if (productCounts.produtos.length > 0) {
    verificationHeader += `PRODUTOS: EXATAMENTE ${productCounts.produtos.length} disponíveis:\n`;
    productCounts.produtos.forEach((name, idx) => {
        verificationHeader += `  ${idx + 1}. ${name}\n`;
    });
}
if (productCounts.servicos.length > 0) {
    verificationHeader += `\nSERVIÇOS: EXATAMENTE ${productCounts.servicos.length} disponíveis:\n`;
    productCounts.servicos.forEach((name, idx) => {
        verificationHeader += `  ${idx + 1}. ${name}\n`;
    });
}
verificationHeader += `
⚠️ ATENÇÃO: Você DEVE listar APENAS os itens acima.
⚠️ QUALQUER produto/serviço NÃO listado acima = NÃO EXISTE MAIS
═══════════════════════════════════════════════════════════════

`;

// Prepend verification header to product list
productList = verificationHeader + productList;
