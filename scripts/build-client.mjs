import { build } from 'esbuild';
await build({ entryPoints:['src/client.tsx'], outfile:'dist/client.js', bundle:true, platform:'browser',format:'cjs', external:['react','react/jsx-runtime'], banner:{js:'window.__ModuleLoader__.load({ id: "dsh-session-messenger", factory(require) { const module = { exports: {} }; const exports = module.exports;'},footer:{js:'return module.exports; } });'} });
