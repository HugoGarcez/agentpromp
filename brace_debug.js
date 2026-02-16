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
            // console.log(`Brace closed: ${start} -> ${i+1}`);
            if (start === 1457 || start === 1458 || start === 1459) { // 1457 is try?
                console.log(`Brace from ~1457 closed at line ${i + 1}`);
            }
            if (balance < 0) {
                console.log(`ERROR: Negative balance at line ${i + 1}`);
                process.exit(1);
            }
        }
    }
}
