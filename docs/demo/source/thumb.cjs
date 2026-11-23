const { chromium } = require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch({executablePath: process.env.CHROME || undefined});const p=await b.newPage({viewport:{width:1280,height:720}});
await p.goto('file://'+path.resolve('thumb.html'));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(200);
await p.screenshot({path:'../social-links-thumbnail.png'});await b.close()})();
