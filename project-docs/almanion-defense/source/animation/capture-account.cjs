/* Read-only UI capture. Real account.js runs against an in-memory Firebase double.
   No registration request, password or account data is sent to a server. */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../../..'),out=path.resolve(__dirname,'../..');
(async()=>{const source=fs.readFileSync(path.join(root,'account.js'),'utf8');
 const live=await (await fetch('https://almanion.github.io/account.js')).text();assert.equal(live.replace(/\r\n/g,'\n'),source.replace(/\r\n/g,'\n'),'Published account source');
 const b=await chromium.launch({channel:'msedge'});try{const p=await b.newPage({viewport:{width:1440,height:810}}),site=JSON.parse(fs.readFileSync(path.join(__dirname,'physics-offline.json')));
 await p.route(/^https?:/,r=>r.abort());await p.setContent('<style>'+site.css+'</style><body class="'+site.classes+'">'+site.body+'</body>');
 await p.evaluate(()=>document.querySelectorAll('#kcReviewOverlay,#kcSelectOverlay,#settingsModal,#homeQuickDialog').forEach(n=>{n.hidden=true;n.classList.add('hidden')}));
 await p.evaluate(()=>{
  window.demoAuthCalls=[];let listener;
  const snapshot={val:()=>null,exists:()=>false,forEach:()=>{}};
  const ref={on(){},off(){},once:()=>Promise.resolve(snapshot),set:()=>Promise.resolve(),update:()=>Promise.resolve(),child:()=>ref};
  const auth={useDeviceLanguage(){},setPersistence:()=>Promise.resolve(),onAuthStateChanged(cb){listener=cb;queueMicrotask(()=>cb(null))},createUserWithEmailAndPassword(email,password){demoAuthCalls.push({email,length:password.length});listener({uid:'defense-demo',email,displayName:''});return Promise.resolve()},signOut:()=>Promise.resolve()};
  const makeAuth=()=>auth;makeAuth.Auth={Persistence:{LOCAL:'local',SESSION:'session',NONE:'none'}};
  const makeDatabase=()=>({ref:()=>ref});makeDatabase.ServerValue={TIMESTAMP:0};
  window.firebase={apps:[{}],auth:makeAuth,database:makeDatabase};window.firebaseConfig={};
 });
 await p.addScriptTag({content:source});await p.evaluate(()=>AlmanionAccount.openLogin());await p.waitForTimeout(100);
 const markup=()=>p.locator('#accountOverlay').evaluate(n=>n.innerHTML);
 const login=await markup();await p.locator('#accToggle').click();const register=await markup();
 await p.locator('#accEmail').fill('student@example.com');await p.locator('#accPass').fill('DemoOnly42');await p.locator('#accPassConfirm').fill('NotSame42');await p.locator('#accSubmit').click();
 assert.equal(await p.locator('#accError').textContent(),'Пароли не совпадают. Проверьте оба поля.');assert.equal(await p.evaluate(()=>demoAuthCalls.length),0);
 await p.locator('#accPassConfirm').fill('DemoOnly42');await p.locator('#accSubmit').click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>demoAuthCalls.length),1);
 assert(await p.locator('#accountOverlay').evaluate(n=>n.classList.contains('hidden')),'Registration closes form');await p.evaluate(()=>AlmanionAccount.openAccount());const signedIn=await markup();
 await p.screenshot({path:path.join(out,'evidence-v2/account-native.png')});
 fs.writeFileSync(path.join(__dirname,'account-example.json'),JSON.stringify({revision:'e727813d614d6b4ff3fc63f2683ffa1ab1ceacb3',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),login,register,signedIn,email:'student@example.com',verified:{realRenderer:true,passwordConfirmation:true,successfulRegistrationClosesForm:true,noServerWrites:true}},null,2));
 fs.copyFileSync(path.join(root,'account.js'),path.join(out,'source/reference/account.js'));
 console.log('Captured native account UI; password match and registration transition verified against real account.js with an in-memory backend.');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
