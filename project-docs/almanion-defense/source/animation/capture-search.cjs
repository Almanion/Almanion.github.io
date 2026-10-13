const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const out=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:810}});
  await page.goto('https://almanion.github.io/physics-10.html',{waitUntil:'domcontentloaded'});
  await page.locator('#searchInput').fill('погрешности');
  await page.waitForFunction(()=>document.querySelector('.site-search-count')?.textContent.includes('результат'));
  const search=await page.locator('#searchResultsPanel').evaluate(n=>n.outerHTML);
  const results=await page.locator('.search-result-item').allTextContents();
  await page.locator('.search-result-item').first().click();
  await page.waitForFunction(()=>location.hash==='#pogreshnosti-izmereniy');
  const destination=await page.evaluate(()=>({url:location.href,title:document.querySelector('#pogreshnosti-izmereniy h3').textContent}));
  const data={query:'погрешности',topic:'pogreshnosti-izmereniy',search,results,destination};
  fs.writeFileSync(path.join(__dirname,'search-example.json'),JSON.stringify(data,null,2));
  fs.writeFileSync(path.join(out,'evidence-v2/search-source.json'),JSON.stringify(data,null,2));
  await page.screenshot({path:path.join(out,'evidence-v2/search-source-destination.png')});
  console.log(JSON.stringify({query:data.query,results,destination},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
