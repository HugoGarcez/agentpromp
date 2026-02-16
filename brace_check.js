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
            if (balance < 0) {
                console.log(`ERROR: Negative balance at line ${i + 1}`);
                process.exit(1);
            }
        }
    }
    // Check specific line of interest
    if (i + 1 === 2176) {
        console.log(`Status at line 2176: Balance=${balance}. Last opened at: ${stack[stack.length - 1]}`);
    }
}

console.log(`Final Balance: ${balance}`);
if (balance !== 0) {
    console.log(`Unclosed braces starting at: ${stack.join(', ')}`);
}
