'use strict';
const {test,expect}=require('@playwright/test');
test.use({launchOptions:{args:['--enable-unsafe-swiftshader']}});
test('catalogue and home link both editions; switching preserves the operation',async({page})=>{
 await page.goto('/games/');await expect(page).toHaveTitle('Игры · Almanion');
 await page.getByRole('link',{name:'Canvas · классическая'}).click();await page.waitForFunction(()=>window.SignalGame);
 expect(await page.evaluate(()=>SignalGame.renderer().active)).toBe('canvas');await page.locator('#start').click();
 const saved=await page.evaluate(()=>{const s=SignalGame.snapshot();localStorage.setItem('signal-frontier-v1',JSON.stringify({save:s,settings:{volume:0,reduced:true}}));return s;});
 await page.goto('/games/signal-frontier/?renderer=canvas');await page.getByRole('link',{name:'Babylon · 3D'}).click();
 await page.waitForFunction(()=>window.SignalGame);expect(await page.evaluate(()=>SignalGame.renderer().active)).toBe('babylon');
 await expect(page.locator('a[data-renderer="babylon"]')).toHaveAttribute('aria-current','page');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('signal-frontier-v1')).save)).toEqual(saved);
 await expect(page.locator('#continue')).toBeVisible();await expect(page.locator('body')).not.toContainText(/Альманион/i);
});
