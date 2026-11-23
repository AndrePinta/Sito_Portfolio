const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { sessionStorage.removeItem('portfolio-crane-dismissed'); });
  await page.reload({ waitUntil: 'networkidle' });

  // Check desktop bio
  const desktopBio = await page.locator('.footer-bio-name').evaluate(el => ({
    display: getComputedStyle(el).display,
    text: el.textContent,
    visible: el.getBoundingClientRect().width > 0
  }));

  // Try scrolling down on hero - should NOT trigger list view
  const beforeScroll = await page.locator('.stage').getAttribute('data-view');
  await page.mouse.move(750, 500);
  await page.mouse.wheel(0, 50);
  await page.waitForTimeout(500);
  const afterScroll = await page.locator('.stage').getAttribute('data-view');

  // Now click browse list
  await page.mouse.wheel(0, 1200);
  await page.waitForFunction(() => !document.querySelector('#crane-header'));
  await page.locator('#browse-toggle').click();
  await page.waitForTimeout(500);
  const afterClick = await page.locator('.stage').getAttribute('data-view');

  console.log(JSON.stringify({ desktopBio, beforeScroll, afterScroll, afterClick }, null, 2));

  await browser.close();
})();
