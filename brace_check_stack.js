import fs from 'fs';

const content = fs.readFileSync('server/index.js', 'utf8');
const lines = content.split('\n');

let balance = 0;
let stack = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') {
            balance++;
            stack.push(i + 1);
        } else if (char === '}') {
            balance--;
            const start = stack.pop();
        }
    }
    if (i + 1 === 2553) {
        console.log(`Balance at 2553: ${balance}`);
        console.log(`Open braces at: ${stack.join(', ')}`);
    }
}
