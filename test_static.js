import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use('/uploads', express.static(path.join(__dirname, 'server/public/uploads')));

app.get('*', (req, res) => res.send('HTML'));

app.listen(3005, () => console.log('started'));
