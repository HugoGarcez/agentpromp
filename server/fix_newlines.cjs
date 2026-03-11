const fs = require('fs');
const targetFile = '/Users/hugogarcez/Documents/promp/agente-promp/src/pages/Settings.jsx';
let content = fs.readFileSync(targetFile, 'utf8');

// The previous script accidentally inserted literal "\\n" strings instead of actual newlines
// or combined lines incorrectly.
// Let's replace the literal "\\n" with real newlines.

const correctedContent = content.replace(/\\n/g, '\n');
fs.writeFileSync(targetFile, correctedContent);
console.log('Fixed newline formatting in Settings.jsx');
