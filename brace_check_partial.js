import fs from 'fs';

const content = fs.readFileSync('server/index.js', 'utf8');
const lines = content.split('\n').slice(0, 470); // Only check up to 470

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
            stack.pop();
        }
    }
}
console.log(`Balance at 470: ${balance}`);
if (balance !== 0) {
    console.log(`Open braces: ${stack.join(', ')}`);
}
