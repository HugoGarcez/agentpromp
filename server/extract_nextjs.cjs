const fs = require('fs');

async function run() {
    const res = await fetch('https://documenter.getpostman.com/view/47232905/2sBXcHhypC');
    const text = await res.text();

    const match = text.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (match) {
        fs.writeFileSync('next_data.json', match[1]);
        const data = JSON.parse(match[1]);
        
        const collection = data.props?.pageProps?.collection?.item || [];
        function printEndpoints(items, prefix = "") {
            for (let item of items) {
                if (item.item) {
                    printEndpoints(item.item, prefix + item.name + " > ");
                } else if (item.request) {
                    const u = item.request.url?.raw || item.request.url;
                    console.log(prefix + item.name + " | " + item.request.method + " | " + u);
                }
            }
        }
        
        printEndpoints(collection);
    } else {
        console.log('Could not find NEXT_DATA');
    }
}
run();
