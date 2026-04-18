import { buildCarouselChoices } from './uazapiUtils.js';

const mockProducts = [
    {
        id: 'PROD_1',
        name: 'Smartphone Super',
        description: 'O melhor smartphone do mercado com câmera de 100MP.',
        price: 2999.90,
        imageUrl: 'https://exemplo.com/smartphone.jpg',
        productUrl: 'https://exemplo.com/comprar/smartphone'
    },
    {
        id: 'PROD_2',
        name: 'Notebook Ultra',
        description: 'Notebook potente para desenvolvedores famintos por RAM.',
        price: 5499.00,
        imageUrl: 'https://exemplo.com/notebook.jpg',
        productUrl: '' // No URL test
    }
];

const agentPhone = '5521990408505';
const agentName = 'Loja de Teste';

console.log('--- TEST: Carousel Choice Building ---');
const choices = buildCarouselChoices(mockProducts, agentPhone);

console.log('Choices Array:');
console.log(JSON.stringify(choices, null, 2));

// Payload simulation
const imageButton = mockProducts[0].imageUrl;
const payload = {
    number: '5511999999999',
    type: 'carousel',
    text: `📦 Conheça nossos produtos — ${agentName}`,
    choices,
    imageButton: imageButton,
    delay: 1000
};

console.log('\n--- FINAL PAYLOAD SIMULATION ---');
console.log(JSON.stringify(payload, null, 2));

// Verification of documentation requirements
const hasCards = choices.some(c => c.startsWith('['));
const hasImages = choices.some(c => c.startsWith('{'));
const hasCopy = choices.some(c => c.includes('|copy:'));
const hasCall = choices.some(c => c.includes('|call:'));
const hasUrl = choices.some(c => c.includes('|http'));

console.log('\n--- VALIDATION CHECK ---');
console.log('Has Cards ([...]):', hasCards ? '✅' : '❌');
console.log('Has Images ({...}):', hasImages ? '✅' : '❌');
console.log('Has Copy (copy:):', hasCopy ? '✅' : '❌');
console.log('Has Call (call:):', hasCall ? '✅' : '❌');
console.log('Has URL (http):', hasUrl ? '✅' : '❌');

if (hasCards && hasImages && hasCopy && hasCall && hasUrl) {
    console.log('\nSUCCESS: Format matches Uazapi requirements!');
} else {
    console.log('\nFAILURE: One or more formatting requirements missing.');
}
