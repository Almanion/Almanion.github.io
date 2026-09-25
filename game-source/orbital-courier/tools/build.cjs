/* Bundle the exact same source files into a portable, offline HTML document. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace(/<link\b[^>]*>/g,tag=>{const match=tag.match(/href="(src\/[^"]+)"/);if(!match||!tag.includes('stylesheet'))return tag;return '<style>\n'+fs.readFileSync(path.join(root,match[1]),'utf8')+'\n</style>';});
html=html.replace(/<script src="(src\/[^"]+)"><\/script>/g,(_,filename)=>'<script>\n'+fs.readFileSync(path.join(root,filename),'utf8')+'\n</script>');
fs.writeFileSync(path.join(root,'Orbital Courier.html'),html,'utf8');
console.log('Built Orbital Courier.html — '+Buffer.byteLength(html)+' bytes; zero network dependencies.');
