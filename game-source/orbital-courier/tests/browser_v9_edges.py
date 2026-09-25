"""Additional UI roundtrips and user-action edge cases. Same Chromium memory-storage limits."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,shutil,time
R=Path(__file__).resolve().parents[1];H=(R/'Orbital Courier.html').read_text();rich=json.loads((R/'docs/completed-v8-profile.json').read_text());checks=[];errors=[]
fix="()=>{window.__saveMap=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__saveMap.get(k)||null,setItem:(k,v)=>__saveMap.set(k,v),removeItem:k=>__saveMap.delete(k)}})}"
def passed(s):checks.append(s);print('PASS',s,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1366,'height':768},accept_downloads=True);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.evaluate(fix);p.set_content(H);p.wait_for_function('!!Orbital.UI9')
 p.locator('#continueButton').click();p.wait_for_function("Orbital.App.screen==='play'&&!Orbital.App.transitioning");assert p.evaluate('Orbital.App.currentId')==0;assert p.evaluate('Orbital.App.state===null')
 p.locator('#objectivesList').click();assert 'До станции' in p.locator('#modal').inner_text() or 'Доставка' in p.locator('#modal').inner_text();p.locator('#modal .modal-close').click()
 p.evaluate('Orbital.App.profile.settings.reducedMotion=true;Orbital.App.setAim(Orbital.LEVELS[0].solution.angle,Orbital.LEVELS[0].solution.speed);Orbital.App.timeScale=110;Orbital.App.actions.launch()');p.wait_for_function("Orbital.App.state?.status==='won'");p.locator('#flightReview [data-action=next]').click();p.wait_for_function('!Orbital.App.transitioning && Orbital.App.currentId===1');assert p.evaluate('Orbital.App.state===null')
 passed('Fresh profile: first contract opens, medals open, completed first delivery unlocks animated next-level action')
 # Test true animation and double request lock, then reduced motion.
 p.evaluate('(r)=>{Orbital.App.profile=Orbital.Progress.sanitize(r);Orbital.App.profile.settings.reducedMotion=false;Orbital.App.loadLevel(68)}',rich);p.locator('[data-action=following-level]').first.click();p.evaluate('Orbital.App.actions["following-level"]()');p.wait_for_function('!Orbital.App.transitioning');assert p.evaluate('Orbital.App.currentId')==69;assert p.evaluate('Orbital.App.state===null');assert not p.locator('#routeTransition').is_visible()
 p.evaluate('Orbital.App.profile.settings.reducedMotion=true');p.locator('[data-action=previous-level]').first.click();p.wait_for_function('!Orbital.App.transitioning');assert p.evaluate('Orbital.App.currentId')==68
 passed('Normal and reduced-motion level transitions do not run physics or skip levels on repeated request')
 # Import confirms, cancel doesn't change profile, then imports exact balances.
 p.evaluate('Orbital.V8.settings("save")');before=p.evaluate('JSON.stringify(Orbital.App.profile)');payload={'name':'profile.json','mimeType':'application/json','buffer':json.dumps(rich).encode()};p.locator('#importFile').set_input_files(payload);p.wait_for_selector('#confirmImport');p.locator('#modal .modal-close').click();assert p.evaluate('JSON.stringify(Orbital.App.profile)')==before
 p.locator('#importFile').set_input_files(payload);p.wait_for_selector('#confirmImport');p.locator('#confirmImport').click();assert p.evaluate("Orbital.App.screen==='home'");assert p.evaluate('Orbital.App.profile.credits')==rich['credits'];assert p.evaluate('Orbital.App.profile.receipts')==rich['receipts']
 before=p.evaluate('JSON.stringify(Orbital.App.profile)');p.locator('#importFile').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':b'{bad'});p.wait_for_timeout(80);assert p.evaluate('JSON.stringify(Orbital.App.profile)')==before
 passed('JSON import cancellation, confirmation and malformed-file rejection preserve intended balances/receipts')
 # Shop interactions, not just pure economics.
 p.evaluate("Orbital.App.go('hangar',true)");balance=p.evaluate('Orbital.App.profile.credits');q=p.evaluate("Orbital.Progress.quote(Orbital.App.profile,'docking')");assert q['canBuy']
 p.locator('[data-action=upgrade][data-key=docking]').click();assert p.evaluate('Orbital.App.profile.credits')==balance;p.locator('#modal .modal-close').click();assert p.evaluate('Orbital.App.profile.credits')==balance
 p.locator('[data-action=upgrade][data-key=docking]').click();p.locator('[data-action=confirm-upgrade]').click();assert p.evaluate('Orbital.App.profile.credits')==balance-q['cost']
 p.locator('[data-action=respec-info]').click();p.locator('[data-action=respec-confirm]').click();assert p.evaluate('Orbital.App.profile.credits')==balance
 p.locator('#trailTab').click();xp=p.evaluate('Orbital.App.profile.xp');p.locator('[data-action=trail][data-key=cartographer]').click();assert p.evaluate('Orbital.App.profile.xp')==xp
 passed('Shop cancellation/confirmation/receipt refund and cosmetic selection work through visible controls')
 # Pointer cancellation does not leave repeating action active.
 p.evaluate('Orbital.App.loadLevel(68);Orbital.App.profile.settings.fineAim=false;Orbital.App.syncControls()');button=p.locator('[data-action=angle-up]');bb=button.bounding_box();p.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2);p.mouse.down();p.wait_for_timeout(450);p.dispatch_event('[data-action=angle-up]','pointercancel',{'pointerId':1,'pointerType':'mouse'});a=p.evaluate('Orbital.App.angle');p.wait_for_timeout(350);assert p.evaluate('Orbital.App.angle')==a;p.mouse.up()
 passed('Pointer cancellation terminates held adjustment without a stuck increment loop')
 c.close()
 # Tiny screen replay controls need actual hit targets too.
 c=b.new_context(viewport={'width':320,'height':568},is_mobile=True,has_touch=True);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.evaluate(fix);p.evaluate('r=>__saveMap.set("orbital-courier-save-v8",JSON.stringify(r))',rich);p.set_content(H);p.wait_for_function('!!Orbital.UI9');p.evaluate('Orbital.App.profile.settings.reducedMotion=true;Orbital.App.loadLevel(68);Orbital.App.setAim(Orbital.LEVELS[68].solution.angle,Orbital.LEVELS[68].solution.speed);Orbital.App.timeScale=110;Orbital.App.actions.launch()');p.wait_for_function("Orbital.App.state?.status==='won'")
 p.locator('[data-action="v8:report"]').tap();assert p.locator('#modal').is_visible();p.locator('#modal .modal-close').tap();p.locator('#reviewRange').evaluate("e=>{e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}))}");assert p.evaluate('Orbital.App.displayState().t')<=2.01;p.screenshot(path=str(R/'docs/screenshots-v9/result-320x568.png'));p.locator('#flightReview [data-action=next]').tap();p.wait_for_function('!Orbital.App.transitioning && Orbital.App.currentId===69')
 # Repeat rotate without stale software keyboard flag.
 p.set_viewport_size({'width':568,'height':320});p.wait_for_timeout(130);p.locator('#angleInput').focus();p.wait_for_timeout(80);assert not p.evaluate('document.body.classList.contains("keyboard-editing")');p.locator('#angleInput').press('Enter');p.set_viewport_size({'width':320,'height':568});p.wait_for_timeout(130);assert p.locator('#mobileLaunch').is_visible()
 passed('320px replay report/seek/next controls work; portrait-to-landscape rotation preserves input state')
 c.close()
 c=b.new_context(viewport={'width':430,'height':932},is_mobile=True,has_touch=True,device_scale_factor=3);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.evaluate(fix);p.set_content(H);p.wait_for_function('!!Orbital.UI9');p.evaluate('Orbital.App.loadLevel(0)');p.wait_for_timeout(120)
 assert p.evaluate('devicePixelRatio')==3;assert p.evaluate('document.documentElement.scrollWidth')==430
 a=p.evaluate('Orbital.App.angle');p.locator('[data-action="ui:zoom-in"]').tap();assert p.evaluate('Orbital.App.camera.zoom')>1;assert p.evaluate('Orbital.App.angle')==a;p.locator('[data-action="ui:zoom-reset"]').tap();assert p.evaluate('Orbital.App.camera.zoom')==1
 passed('High-density touch viewport (DPR 3): CSS geometry and camera controls remain consistent')
 assert not errors,errors;b.close()
(R/'docs/browser-edge-results-v9.json').write_text(json.dumps(dict(status='passed',scenarios=len(checks),checks=checks,errors=errors,limitations=['Memory storage fixture','Emulated Chromium only']),ensure_ascii=False,indent=2));print('ALL EDGE CHECKS PASSED',len(checks))
