import { createServer } from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true,hmr:false,watch:{ignored:['**/output/**','**/src-tauri/**','**/.local-fixtures/**']}}});await server.listen();server.printUrls();
