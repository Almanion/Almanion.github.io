const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{const b=await chromium.launch({channel:'msedge'});try{
 const p=await b.newPage();const source=JSON.parse(fs.readFileSync(path.join(__dirname,'physics-offline.json')));
 await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>'+source.body+'</body></html>');
 await p.addScriptTag({path:require.resolve('katex/dist/katex.min.js')});
 await p.addScriptTag({path:require.resolve('katex/dist/contrib/auto-render.min.js')});
 const html=await p.evaluate(()=>{const n=document.getElementById('pogreshnosti-izmereniy');renderMathInElement(n,{delimiters:[{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}],throwOnError:true});if(n.querySelectorAll('.katex').length<4)throw Error('Math was not rendered');return n.outerHTML;});
 fs.writeFileSync(path.join(__dirname,'search-topic.json'),JSON.stringify(html));console.log('Rendered original section 2.2 with bundled KaTeX.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
