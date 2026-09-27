import { CATALOG, CATALOG_VERSION } from '../../src/lib/vote/speech/catalog.js';
process.stdout.write(JSON.stringify({ version: CATALOG_VERSION, entries: CATALOG }));
