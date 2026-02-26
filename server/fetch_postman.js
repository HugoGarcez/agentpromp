import fetch from 'node-fetch';
import fs from 'fs';

async function run() {
    const res = await fetch('https://documenter.getpostman.com/view/4141833/RWTsquyN');
    const text = await res.text();

    // The collection data is usually encoded in a script tag like: window.__documenterData = {...}
    const match = text.match(/window\.__documenterData\s*=\s*({.*?});/);
    if (match) {
        fs.writeFileSync('postman_docs.json', match[1]);
        console.log('Saved postman_docs.json');
    } else {
        console.log('Could not find documenterData');
    }
}
run();
