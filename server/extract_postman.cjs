const fs = require('fs');

async function run() {
    const res = await fetch('https://documenter.getpostman.com/view/47232905/2sBXcHhypC');
    const text = await res.text();

    const match = text.match(/window\.__documenterData\s*=\s*({.*?});/);
    if (match) {
        fs.writeFileSync('postman_promp.json', match[1]);
        console.log('Saved postman_promp.json');
        
        const data = JSON.parse(match[1]);
        // Let's print all endpoint names
        function printEndpoints(items, prefix = "") {
            for (let item of items) {
                if (item.item) {
                    printEndpoints(item.item, prefix + item.name + " > ");
                } else if (item.request) {
                    console.log(prefix + item.name + " [" + item.request.method + "]");
                }
            }
        }
        
        if (data.collection && data.collection.item) {
            printEndpoints(data.collection.item);
        }
    } else {
        console.log('Could not find documenterData');
    }
}
run();
