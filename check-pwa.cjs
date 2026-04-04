const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    await page.goto('https://markez-maneger-pro.vercel.app/', { waitUntil: 'networkidle0' });
    
    const manifestUrl = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]');
      return link ? link.href : null;
    });
    console.log('Manifest URL:', manifestUrl);
    
    if (manifestUrl) {
      const manifestResponse = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return await res.text();
      }, manifestUrl);
      console.log('Manifest Content:', manifestResponse);
    }
    
    await browser.close();
  } catch (e) {
    console.error(e);
  }
})();
