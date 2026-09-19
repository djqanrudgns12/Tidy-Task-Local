import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';
const bins=(process.env.PATH||'').split(path.delimiter);const bin=bins.find(v=>v.includes('_npx')&&v.endsWith('.bin'));if(!bin)throw Error('npm tool path missing');
const req=createRequire(path.resolve(bin,'../package.json'));const prettier=req('prettier');const plugin=req.resolve('prettier-plugin-svelte');
for(const dir of ['src/lib/timers','src/lib/toolkit','src/components/timers','src/components/toolkit'])for(const f of await fs.readdir(dir)){if(!/\.(js|svelte|css)$/.test(f))continue;const file=path.join(dir,f);const formatted=await prettier.format(await fs.readFile(file,'utf8'),{filepath:file,plugins:[plugin],singleQuote:true,printWidth:100});await fs.writeFile(file,formatted);}
