"""UI9 regression: real Chromium DOM/touch input with explicit in-memory save fixture.
No Safari/physical device/persistent-storage certification. Requires Playwright + Chromium.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, time, shutil, math, os
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'Orbital Courier.html').read_text()
SHOTS=ROOT/'docs/screenshots-v9';SHOTS.mkdir(exist_ok=True)
FIX="""()=>{window.__saveMap=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__saveMap.get(k)||null,setItem:(k,v)=>__saveMap.set(k,v),removeItem:k=>__saveMap.delete(k)}})}"""
RICH=json.loads((ROOT/'docs/completed-v8-profile.json').read_text())
checks=[];errors=[];network=[];sizes=[];flights=[];start=time.monotonic()
FAST=os.environ.get('UI9_FAST')=='1'
def record(msg):
 checks.append(msg);print('PASS',msg,flush=True)
 (ROOT/'docs/browser-results-v9.json').write_text(json.dumps(dict(status='running',checks=checks,errors=errors),ensure_ascii=False,indent=2))
def ae(a,b):assert abs(a-b)<1e-7,(a,b)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 def load(w=1366,h=768,rich=True,touch=False,storage=True):
  c=browser.new_context(viewport={'width':w,'height':h},is_mobile=touch,has_touch=touch,accept_downloads=True)
  p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:network.append(r.url) if r.url.startswith(('http:','https:')) else None)
  if storage:
   p.evaluate(FIX)
   if rich:p.evaluate('v=>__saveMap.set("orbital-courier-save-v8",JSON.stringify(v))',RICH)
  p.set_content(HTML,wait_until='load');p.wait_for_function('!!Orbital.UI9');p.wait_for_timeout(100)
  p.evaluate('Orbital.App.profile.settings.reducedMotion=true;Orbital.App.profile.settings.fineAim=false;Orbital.App.profile.settings.highContrast=false;Orbital.App.timeScale=1;')
  return c,p
 def play(p,idx=68):
  p.evaluate('(idx)=>{Orbital.App.closeModal();Orbital.UI9.closeSheet(false);Orbital.App.loadLevel(idx);Orbital.App.timeScale=1}',idx);p.wait_for_timeout(140)
 def aim(p):return p.evaluate('({angle:Orbital.App.angle,speed:Orbital.App.speed})')
 def closemodal(p):
  if p.locator('#modal').is_visible():p.locator('#modal .modal-close').click()
 def closesheet(p):p.locator('#flightDrawer .icon-button[data-action="ui:close-sheet"]').click()
 def clickable(p,sel):
  r=p.locator(sel).evaluate("""e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,t=document.elementFromPoint(x,y);return{rect:r.toJSON(),hit:!!t&&(t===e||e.contains(t)),disabled:!!e.disabled}}""")
  assert r['rect']['width']>0 and r['rect']['top']>=-1 and r['rect']['bottom']<=p.viewport_size['height']+1 and r['hit'],(sel,r,p.viewport_size)
  return r
 c,p=load();play(p)
 # Composition / state compatibility.
 assert p.evaluate('Orbital.LEVELS.length===80 && Orbital.SECTORS.length===20 && Orbital.Progress.achievements.length===93')
 assert p.evaluate('Orbital.App.profile.version')==8
 for key in ['credits','data','xp','upgrades','receipts','records','courses','selectedTrail','selectedSkin']:
  if key in RICH:assert p.evaluate('(k)=>Orbital.App.profile[k]',key)==RICH[key],key
 assert p.evaluate("()=>{let a=[...document.querySelectorAll('[id]')].map(e=>e.id);return a.length===new Set(a).size}")
 record('v8 save schema, balances, modules, receipts, records and permanent courses preserved; unique DOM IDs')
 # Comma, invalid and bounded inputs; no accidental launch from Enter.
 p.locator('#angleInput').fill('-22,5');p.locator('#angleInput').press('Enter');ae(aim(p)['angle'],-22.5);assert p.evaluate('Orbital.App.state===null')
 for text,target,expected in [('bad','angleInput',-22.5),('900','angleInput',180),('-900','angleInput',-180),('0','speedInput',60),('999999','speedInput',p.evaluate('Orbital.App.stats().maxSpeed'))]:
  p.locator('#'+target).fill(text);p.locator('#'+target).press('Enter');ae(p.evaluate('Orbital.App.'+('angle' if target=='angleInput' else 'speed')),expected)
 assert p.evaluate('Orbital.UI9.numberValue("Infinity")===null && Orbital.UI9.numberValue("1,2,3")===null')
 p.evaluate('Orbital.App.setAim(0,120)');p.locator('[data-action=angle-up]').click();ae(aim(p)['angle'],.5)
 p.locator('#gameCanvas').focus();p.keyboard.press('ArrowRight');ae(aim(p)['angle'],1)
 p.keyboard.press('Shift+ArrowRight');ae(aim(p)['angle'],1.1)
 p.keyboard.press('ArrowUp');ae(aim(p)['speed'],122)
 p.keyboard.press('Shift+ArrowUp');ae(aim(p)['speed'],123)
 record('Comma and signed inputs, invalid fallback, bounds, Enter safety and coarse/fine keyboard increments')
 # Hold, capture, cancellation, no double click.
 btn=p.locator('[data-action=angle-up]');bb=btn.bounding_box();p.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2);v=aim(p)['angle'];p.mouse.down();p.wait_for_timeout(650);p.mouse.up();delta=aim(p)['angle']-v;assert delta>=1.5,delta
 v=aim(p)['angle'];p.wait_for_timeout(350);ae(aim(p)['angle'],v)
 p.mouse.down();p.wait_for_timeout(440);p.mouse.move(100,100);v=aim(p)['angle'];p.wait_for_timeout(300);p.mouse.up();ae(aim(p)['angle'],v)
 record('Single taps do not double-increment; hold repeats and stops on release or leaving the button')
 # Pan / zoom / click / aim pointer.
 box=p.locator('#gameCanvas').bounding_box();x=box['x']+box['width']*.55;y=box['y']+box['height']*.4
 before=aim(p);p.mouse.click(x,y);assert aim(p)==before
 p.locator('#mapPan').click();p.locator('[data-action="ui:zoom-in"]').click(click_count=3,delay=50);cam=p.evaluate('({...Orbital.App.camera})');p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+60,y+25,steps=8);p.mouse.up();assert aim(p)==before;assert p.evaluate('Orbital.App.camera.cx')!=cam['cx']
 p.locator('[data-action="ui:zoom-reset"]').click();ae(p.evaluate('Orbital.App.camera.zoom'),1)
 p.locator('#mapAim').click();p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+80,y+20,steps=8);p.mouse.up();assert aim(p)!=before;assert p.evaluate('Orbital.App.state===null')
 before=aim(p);p.keyboard.down('Alt');p.mouse.move(x,y);p.mouse.down();p.mouse.move(x-30,y+20,steps=5);p.mouse.up();p.keyboard.up('Alt');assert aim(p)==before
 p.mouse.wheel(0,-100);p.wait_for_timeout(50);assert p.evaluate('Orbital.App.camera.zoom')>1
 record('Map click never changes course; explicit pan, aim, Alt-pan and wheel zoom preserve intended controls')
 # Route sheet / focus / 2 branches and unchanged geometry.
 p.locator('#flightPlan summary').click();assert p.locator('#flightDrawer').is_visible();geo=p.evaluate('JSON.stringify(Orbital.App.activeLevel)');p.locator('[data-action="v8:branch"][data-branch=B]').click();assert p.evaluate('Orbital.App.branchView')=='B';assert p.evaluate('JSON.stringify(Orbital.App.activeLevel)')==geo
 for _ in range(10):p.keyboard.press('Tab');assert p.evaluate('document.getElementById("flightDrawer").contains(document.activeElement)')
 p.keyboard.press('Escape');assert not p.locator('#flightDrawer').is_visible();assert p.locator('#flightPlan summary').evaluate('e=>e===document.activeElement')
 # No duplicate controls after repeated sheet moves.
 for _ in range(3):p.evaluate('Orbital.UI9.openSheet("memory")');closesheet(p);p.evaluate('Orbital.UI9.openSheet("route")');closesheet(p)
 assert p.locator('#courseSlots').count()==1
 record('Native route/courses sheet traps focus, Escape restores focus, branching is visual-only and controls are not duplicated')
 # Course slots / intentional replay values.
 p.evaluate('Orbital.App.setAim(-15.2,123)');p.locator('#navMore summary').click();p.locator('[data-action=store-course][data-slot="0"]').click();p.evaluate('Orbital.App.setAim(20,140)');p.locator('[data-action=recall-course][data-slot="0"]').click();assert aim(p)=={'angle':-15.2,'speed':123}
 # Full-size button remains fixed when details expand/scroll.
 clickable(p,'#launchButton');p.locator('#navMore summary').click()
 record('A/B values round-trip; primary action remains reachable outside expanded panel scroller')
 # Pausing / immediate retry / blur.
 play(p);p.evaluate('Orbital.App.setAim(Orbital.LEVELS[68].solution.angle,Orbital.LEVELS[68].solution.speed)');p.locator('#launchButton').click();p.wait_for_timeout(80);assert p.evaluate("Orbital.App.state.status==='flying'")
 p.locator('#flightPlan summary').click();t=p.evaluate('Orbital.App.state.t');p.wait_for_timeout(200);ae(p.evaluate('Orbital.App.state.t'),t);closesheet(p);p.wait_for_timeout(80);assert p.evaluate('Orbital.App.state.t')>t
 p.locator('#launchButton').click();assert p.locator('#modal').is_visible();t=p.evaluate('Orbital.App.state.t');p.wait_for_timeout(120);ae(p.evaluate('Orbital.App.state.t'),t);closemodal(p);p.wait_for_timeout(30);assert not p.evaluate('Orbital.App.paused')
 p.locator('.launch-secondary [data-action=retry]').click();assert not p.locator('#modal').is_visible();assert p.evaluate('Orbital.App.state===null');p.locator('#launchButton').click()
 p.evaluate('window.dispatchEvent(new Event("blur"))');assert p.locator('#modal').is_visible();assert p.evaluate('Orbital.App.paused');closemodal(p)
 p.locator('.launch-secondary [data-action=retry]').click();assert not p.locator('#modal').is_visible();assert p.evaluate('Orbital.App.state===null')
 record('Route sheet and pause freeze simulation; close resumes; restart is immediate; losing focus pauses')
 # User-facing settings and storage actions.
 p.evaluate('Orbital.V8.settings()');p.locator('[data-setting=highContrast]').check();assert p.evaluate('Orbital.App.profile.settings.highContrast');p.locator('[data-setting=highContrast]').uncheck()
 p.locator('[data-action="v8:settings-tab"][data-tab=save]').click()
 with p.expect_download() as dl:p.locator('[data-action=export]').click()
 data=json.loads(Path(dl.value.path()).read_text());assert data['version']==8;assert data['credits']==p.evaluate('Orbital.App.profile.credits')
 p.locator('[data-action="v8:reset-confirm"]').click();assert p.locator('#resetFinal').is_disabled();p.locator('#resetWord').fill('СБРОС');assert not p.locator('#resetFinal').is_disabled();closemodal(p)
 p.evaluate('Orbital.App.actions["ui:map-menu"]()');p.locator('[data-action="ui:fullscreen"]').click();p.wait_for_timeout(100);assert p.evaluate("Orbital.App.screen==='play'")
 record('Settings switches/tabs, JSON export schema and reset guard work; fullscreen denial does not break play')
 # Bundled production game sequential play regression, known courses not human playtesting.
 def fire(idx,mode='normal',branch=None):
  p.evaluate("""({idx,mode,branch})=>{const a=Orbital.App;a.closeModal();Orbital.UI9.closeSheet(false);a.profile.difficulty=mode;a.profile.settings.reducedMotion=true;a.loadLevel(idx);const l=Orbital.LEVELS[idx],s=branch?l.solutions.find(x=>x.branch===branch):mode==='pro'?l.proSolution:l.solution;a.setAim(s.angle,s.speed);a.timeScale=110;a.actions.launch();}""",dict(idx=idx,mode=mode,branch=branch))
  p.wait_for_function("Orbital.App.state&&Orbital.App.state.status!=='flying'",timeout=15000)
  result=p.evaluate('({status:Orbital.App.state.status,reason:Orbital.App.state.reason,branch:Orbital.App.state.branchId})');assert result['status']=='won',dict(idx=idx,**result);assert p.locator('#flightReview').is_visible();flights.append(dict(id=idx+1,mode=mode,branch=branch,status=result['status']))
 if not FAST:
  for i in range(80):
   fire(i)
   if i in [20,21,22,23,*range(68,76)]:fire(i,branch='B')
  record('All 80 levels and B routes of all 12 branching maps complete in production frame loop (92 flights)')
  for i in [20,21,22,23,*range(68,80)]:
   fire(i,'pro')
   if i<76:fire(i,'pro','B')
  record('All 16 most-recent/revised maps, including both branches, finish in PRO (28 flights)')
 fire(68);fire(68);assert p.evaluate('Orbital.App.lastResult.totalCredits')==0
 balance=p.evaluate('Orbital.App.profile.credits');p.locator('#reviewRange').evaluate("e=>{e.value='1';e.dispatchEvent(new Event('input',{bubbles:true}))}");assert p.evaluate('Orbital.App.displayState().t')<=1.01
 p.locator('[data-action="v8:compare"]').click();assert p.evaluate('Orbital.Review.active.compare');assert p.evaluate('Orbital.App.profile.credits')==balance
 record('Finished-flight replay seeks and compares without awarding money; repeat earned route remains unpaid')
 # Screenshot typical scene, not a claim of human achievement.
 play(p);p.screenshot(path=str(SHOTS/'desktop-1366x768.png'));c.close()
 # Responsive geometry and click targets in three phases.
 VIEWPORTS=[(320,568),(360,640),(390,844),(430,932),(568,320),(667,375),(768,1024),(820,1180),(844,390),(1024,600),(1024,768),(1366,768),(1920,1080)]
 for w,h in VIEWPORTS:
  print('VIEWPORT',w,h,flush=True)
  c,p=load(w,h,touch=w<1000);play(p)
  z=p.evaluate("""()=>{const rs=Object.fromEntries(['gameCanvas','flightPlan','angleInput','speedInput','launchButton','mobileLaunch'].map(k=>[k,document.getElementById(k).getBoundingClientRect().toJSON()]));return{viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],rects:rs}}""")
  assert z['scroll'][0]<=w+1 and z['scroll'][1]<=h+1,z
  for k in ['gameCanvas','flightPlan','angleInput','speedInput']:assert z['rects'][k]['width']>0 and z['rects'][k]['bottom']<=h+1 and z['rects'][k]['top']>=0,(k,z)
  launch='#mobileLaunch' if p.locator('#mobileLaunch').is_visible() else '#launchButton';clickable(p,launch)
  clickable(p,'#angleInput');clickable(p,'#speedInput');clickable(p,'#flightPlan summary')
  p.locator('#flightPlan summary').click();assert p.locator('#flightDrawer').is_visible();clickable(p,'#flightDrawer .icon-button[data-action="ui:close-sheet"]');closesheet(p)
  p.evaluate('Orbital.App.setAim(Orbital.LEVELS[68].solution.angle,Orbital.LEVELS[68].solution.speed)');p.locator(launch).click();p.wait_for_timeout(80);clickable(p,launch)
  p.evaluate('Orbital.App.timeScale=110');p.wait_for_function("Orbital.App.state.status==='won'",timeout=15000);clickable(p,launch)
  rr=p.locator('#flightReview').bounding_box();assert rr and rr['y']+rr['height']<=h+1,(w,h,rr)
  z['phases']='aiming, flying, result';sizes.append(z)
  play(p)
  if w in [320,390,844,768,568,1366]:p.screenshot(path=str(SHOTS/f'play-{w}x{h}.png'))
  c.close()
 record('13 phone/tablet/desktop sizes: map, next step, inputs and launch fit; click targets checked in preparation, flight and replay')
 # Genuine touch dispatch in CDP; mobile input and keyboard-height simulation.
 c,p=load(390,844,touch=True);play(p);assert p.evaluate('document.body.dataset.mapMode')=='aim'
 p.locator('.mobile-options').tap();assert p.locator('#flightDrawer').is_visible();p.locator('#sheetFine').tap();assert p.evaluate('Orbital.App.profile.settings.fineAim');closesheet(p)
 v=aim(p)['angle'];p.locator('[data-action=angle-up]').tap();ae(aim(p)['angle'],v+.1)
 p.locator('#angleInput').fill('-18,7');p.locator('#mobileLaunch').tap();assert p.evaluate('Orbital.App.state===null');ae(aim(p)['angle'],-18.7)
 p.locator('#angleInput').focus();p.set_viewport_size({'width':390,'height':510});p.wait_for_timeout(150);assert p.evaluate('document.body.classList.contains("keyboard-editing")');clickable(p,'#angleInput');clickable(p,'#mobileLaunch')
 p.locator('#mobileLaunch').tap();assert p.evaluate('Orbital.App.state===null');p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(150)
 record('Mobile exact mode, decimal comma and first-tap commit prevent launch while editing; reduced viewport keyboard simulation keeps controls reachable')
 p.locator('#mapAim').tap();box=p.locator('#gameCanvas').bounding_box();x=box['x']+box['width']*.45;y=box['y']+box['height']*.4;cdp=c.new_cdp_session(p)
 def touch(typ,points):
  cdp.send('Input.dispatchTouchEvent',{'type':typ,'touchPoints':[{'x':a,'y':b,'id':i} for i,a,b in points]});p.wait_for_timeout(45)
 before=aim(p);touch('touchStart',[(0,x,y)]);touch('touchMove',[(0,x+25,y+12)]);assert aim(p)!=before
 touch('touchStart',[(0,x+25,y+12),(1,x+70,y+30)]);assert aim(p)==before
 touch('touchMove',[(0,x-20,y-10),(1,x+100,y+60)]);assert p.evaluate('Orbital.App.camera.zoom')>1.2
 touch('touchEnd',[(1,x+100,y+60)]);touch('touchMove',[(0,x-50,y+15)]);assert aim(p)==before;touch('touchEnd',[]);assert p.evaluate('Orbital.App.state===null')
 p.locator('#mapPan').tap();touch('touchStart',[(0,x,y)]);touch('touchMove',[(0,x+20,y+25)]);touch('touchEnd',[]);assert aim(p)==before
 record('CDP multitouch: pinch restores prior aim, changes zoom, and remaining finger cannot accidentally alter the course or launch')
 # Regular pages, menu scroll, settings and mobile rich states.
 for page in ['campaign','hangar','awards','home']:
  p.evaluate('(page)=>Orbital.App.go(page,true)',page);p.wait_for_timeout(180);assert p.evaluate('document.documentElement.scrollWidth')<=390,page
  if page=='campaign':
   p.locator('#contractSearch').fill('76');assert p.locator('.mission-card').count()==1;p.locator('#contractSearch').fill('');p.screenshot(path=str(SHOTS/'contracts-mobile.png'))
  if page=='awards':assert p.locator('.achievement-card').count()==93
 p.evaluate('Orbital.V8.settings()');p.wait_for_timeout(150);p.screenshot(path=str(SHOTS/'settings-mobile.png'))
 for tab in ['display','control','save']:
  selector=f'[data-action="v8:settings-tab"][data-tab={tab}]'
  if p.locator(selector).count():p.locator(selector).click()
  p.locator('#modal').evaluate('e=>{e.scrollTop=e.scrollHeight}');clickable(p,'#modal .modal-close')
 closemodal(p);record('Mobile catalogue/hangar/achievements/home have no horizontal overflow; long settings keep Close reachable')
 c.close()
 # Failure to persist: honest badge + functional gameplay. No in-memory stub means denied origin.
 c,p=load(390,844,rich=False,touch=True,storage=False);play(p,0);assert not p.evaluate('Orbital.App.storageOK');assert p.locator('#saveBadge').is_visible();clickable(p,'#mobileLaunch');p.locator('#saveBadge').tap();assert p.locator('#modal').is_visible();closemodal(p)
 c.close();record('Denied browser storage is signalled without covering map/actions; save-settings entry remains available')
 assert not errors,errors;assert not network,network;browser.close()
 result=dict(status='passed',scenarios=len(checks),checks=checks,errors=errors,networkRequests=network,sizes=sizes,flights=flights,runtimeSeconds=round(time.monotonic()-start,2),limitations=['Bundled HTML loaded with set_content; origin navigation blocked by managed Chromium policy','Memory-only localStorage fixture, not long-term browser storage','Emulated desktop and touch viewports; no physical devices or Safari','Software keyboard approximated by viewport reduction, not native phone keyboard','Known solution courses for regression, not independent human playtesting','Fullscreen allowed path cannot be tested under browser policy'])
 (ROOT/'docs/browser-results-v9.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print('ALL UI9 CHECKS PASSED',len(checks),flush=True)
