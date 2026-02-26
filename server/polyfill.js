import 'buffer';

if (typeof global.File === 'undefined') {
    global.File = class File extends Blob {
        constructor(fileBits, fileName, options = {}) {
            super(fileBits, options);
            this.name = fileName;
            this.lastModified = options.lastModified === undefined ? Date.now() : options.lastModified;
        }
    };
}

import('./index.js');
