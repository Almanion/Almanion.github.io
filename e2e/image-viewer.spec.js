'use strict';

const {test,expect}=require('@playwright/test');

async function openRegnault(page,touch=false) {
    await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='127.0.0.1')return route.continue();
        const katex=url.pathname.match(/\/katex@[^/]+\/dist\/(.+)/);
        if(katex)return route.fulfill({response:await page.request.get('/vendor/katex/'+katex[1])});
        return route.abort();
    });
    await page.goto('/physics-10.html#izmerenie-teploemkosti-gaza');
    if(await page.locator('#sidebar.open').count())await page.locator('#closeSidebar').click();
    const image=page.locator('[data-note-block="thermo-regnault-picture"] img');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    if(touch)await image.tap();else await image.click();
    const full=page.locator('#lightboxOverlay.open .lightbox-img');
    await expect(full).toBeVisible();
    await expect(full).toHaveAttribute('src',/thermo-regnault\.svg/);
    return full;
}

async function scale(image) {
    return image.evaluate(img=>new DOMMatrixReadOnly(getComputedStyle(img).transform).a);
}

test('mouse double click enlarges and restores a note diagram',async ({page})=>{
    const image=await openRegnault(page);
    await image.dblclick();
    await expect.poll(()=>scale(image)).toBeGreaterThan(2);
    await image.dblclick();
    await expect.poll(()=>scale(image)).toBeCloseTo(1,2);
    await page.keyboard.press('Escape');
    await expect(page.locator('#lightboxOverlay')).not.toHaveClass(/open/);
});

test.describe('touch diagram viewer',()=>{
    test.use({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
    test('double tap keeps the diagram enlarged despite the generated mouse event',async ({page})=>{
        const image=await openRegnault(page,true);
        await image.tap();await image.tap();
        await expect.poll(()=>scale(image)).toBeGreaterThan(2);
        await image.tap();await image.tap();
        await expect.poll(()=>scale(image)).toBeCloseTo(1,2);
        await page.getByRole('button',{name:'Закрыть',exact:true}).tap();
        await expect(page.locator('#lightboxOverlay')).not.toHaveClass(/open/);
    });
});
