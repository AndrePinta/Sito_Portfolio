const { chromium } = require('playwright');
const assert = require('node:assert/strict');

async function checkHeroLayout(page, label) {
  const layout = await page.evaluate(() => {
    const compact = innerWidth <= 1200 || innerHeight <= 800;
    const rect = selector => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
    };
    const textOverflow = [];
    for (const selector of ['.footer-bio', '.footer-email', '.footer-copy', '.footer-right > span', '#caption-subtitle', '#caption-credit', '.hero-contact > p', '.contact-email']) {
      const element = document.querySelector(selector);
      const bounds = !compact && selector.startsWith('#caption-')
        ? { left: document.querySelector('.site-header').getBoundingClientRect().left,
          right: document.querySelector('.site-header').getBoundingClientRect().right }
        : element.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || getComputedStyle(node.parentElement).visibility === 'hidden') continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some(line => line.left < bounds.left - 1 || line.right > bounds.right + 1)) {
          textOverflow.push(selector);
        }
      }
    }
    const lines = [...document.querySelectorAll('.caption-line')]
      .filter(line => getComputedStyle(line).display !== 'none');
    return {
      compact,
      caption: rect('.caption'),
      captionContentBottom: lines.at(-1).getBoundingClientRect().bottom,
      track: rect('.project-track'),
      bio: rect('.footer-bio'),
      email: rect('.footer-email'),
      credit: rect('.footer-right > span'),
      copy: rect('.footer-copy'),
      header: rect('.site-header'),
      services: rect('.hero-contact > p'),
      contactEmail: rect('.contact-email'),
      contact: rect('.hero-contact'),
      contactVisible: document.querySelector('.hero-contact').classList.contains('is-visible'),
      serviceScale: parseFloat(getComputedStyle(document.querySelector('.hero-contact > p')).fontSize)
        / parseFloat(getComputedStyle(document.querySelector('.hero-contact')).fontSize),
      collision: document.querySelector('.hero-contact').classList.contains('has-service-collision'),
      scrollY,
      height: innerHeight,
      width: innerWidth,
      textOverflow
    };
  });
  assert.ok(layout.caption.top + layout.scrollY >= layout.header.bottom + 23, `${label}: header clearance`);
  assert.ok(Math.abs(layout.copy.right - layout.header.right) < .1, `${label}: copyright stays at right edge`);
  assert.ok(layout.bio.right < layout.email.left, `${label}: bio/email clearance`);
  assert.ok(layout.services.left >= layout.contactEmail.right, `${label}: services/email clearance`);
  assert.ok(Math.abs(layout.serviceScale - (layout.collision ? .85 : 1)) < .001, `${label}: services scale`);
  assert.deepEqual(layout.textOverflow, [], `${label}: text must stay inside its column`);
  if (layout.compact) {
    assert.ok(Math.abs(layout.track.top - layout.caption.bottom - 72) < .1, `${label}: caption gap`);
    assert.ok(Math.abs(layout.bio.top - layout.track.bottom - 72) < .1, `${label}: bio gap`);
    assert.ok(Math.abs(layout.email.top - layout.bio.top) < .1, `${label}: email/bio alignment`);
    assert.ok(Math.abs(layout.email.right - layout.copy.right) < .1, `${label}: email/copyright right alignment`);
    assert.ok(Math.abs(layout.credit.right - layout.copy.right) < .1, `${label}: type credit/copyright right alignment`);
    assert.ok(layout.email.bottom + 7 <= layout.credit.top, `${label}: email/type credit clearance`);
    assert.ok(layout.credit.bottom + 7 <= layout.copy.top, `${label}: type credit/copyright clearance`);
    assert.ok(Math.abs((layout.credit.top - layout.email.bottom) - (layout.copy.top - layout.credit.bottom)) < .1,
      `${label}: equal vertical gaps in right column`);
  } else {
    assert.ok(Math.abs(layout.caption.top - layout.height * .4) < .1, `${label}: original fullscreen caption position`);
    assert.ok(Math.abs((layout.track.top - layout.captionContentBottom) - (layout.bio.top - layout.track.bottom)) < .1,
      `${label}: original fullscreen project centering`);
    const emailRatio = layout.width / layout.height < 16 / 9 ? .44 : .5;
    const expectedEmailLeft = layout.header.left + (layout.header.right - layout.header.left) * emailRatio;
    assert.ok(Math.abs(layout.email.left - expectedEmailLeft) < .1, `${label}: original fullscreen email position`);
    assert.ok(Math.abs(layout.email.bottom - layout.copy.bottom) < .1, `${label}: original fullscreen footer baseline`);
  }
  if (layout.contactVisible) {
    assert.ok(layout.contact.bottom + 23 <= layout.caption.top, `${label}: contact/caption clearance`);
  }
}

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

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4173/');
  await page.evaluate(() => document.fonts.ready);
  const logo = page.locator('.header-resource img');
  await logo.evaluate(image => image.decode());
  assert.match(await logo.getAttribute('src'), /^https:\/\/mediaz\.andreapintauro\.com\/media\/Risorsa%205\.svg$/);

  for (const [width, height] of [[1512, 982], [1512, 801], [1512, 800], [1512, 600], [1201, 801], [1200, 801], [1201, 700], [1200, 700], [1024, 600], [1023, 600], [900, 768], [900, 500], [781, 600], [1740, 360], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    await checkHeroLayout(page, `${width}x${height}`);
  }

  const slugs = await page.locator('.project-card').evaluateAll(cards => cards.map(card => card.dataset.slug));
  for (const language of ['en', 'it']) {
    await page.locator(`[data-language="${language}"]`).click();
    for (const [width, height] of [[781, 400], [1024, 600], [1512, 360]]) {
      await page.setViewportSize({ width, height });
      for (const slug of slugs) {
        await page.locator(`.project-card[data-slug="${slug}"]`).dispatchEvent('pointerenter');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await checkHeroLayout(page, `${language}/${slug}/${width}x${height}`);
      }
    }
  }
  await page.locator('[data-language="en"]').click();

  for (const [width, height] of [[1512, 982], [900, 500], [1740, 360]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#contact-toggle').click();
    await page.waitForTimeout(100);
    await checkHeroLayout(page, `contact/${width}x${height}`);
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  for (const [width, height] of [[1024, 420], [900, 600], [1512, 982]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.project-card[data-slug="humh"]').dispatchEvent('pointerenter');
    await page.waitForTimeout(600);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await checkHeroLayout(page, `animated/scrolled/${width}x${height}`);
  }
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.setViewportSize({ width: 900, height: 768 });
  await page.locator('[data-language="it"]').click();
  await page.waitForTimeout(100);
  const translatedClearance = await page.evaluate(() =>
    document.querySelector('.hero-contact > p').getBoundingClientRect().left
      - document.querySelector('.contact-email').getBoundingClientRect().right
  );
  assert.ok(translatedClearance >= 0, 'Italian services/email clearance');
  await page.locator('[data-language="en"]').click();

  await page.locator('#browse-toggle').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.site-footer').evaluate(el => getComputedStyle(el).position), 'fixed');
  assert.equal(await page.locator('.caption').evaluate(el => getComputedStyle(el).position), 'fixed');
  await page.goto('http://127.0.0.1:4173/projects/dish-list');
  assert.equal(await page.locator('.site-footer').evaluate(el => getComputedStyle(el).position), 'fixed');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173/');
  const mobile = await page.evaluate(() => {
    const header = document.querySelector('.mobile-bio-header').getBoundingClientRect();
    const heading = document.querySelector('.mobile-footer-heading').getBoundingClientRect();
    const email = document.querySelector('.footer-email');
    const bio = document.querySelector('.footer-bio').getBoundingClientRect();
    const copy = document.querySelector('.footer-copy').getBoundingClientRect();
    return {
      headingBottom: heading.bottom,
      headerTop: header.top,
      headerBottom: header.bottom,
      emailTop: email.getBoundingClientRect().top,
      emailBottom: email.getBoundingClientRect().bottom,
      bioTop: bio.top,
      emailSize: parseFloat(getComputedStyle(email).fontSize),
      copyCenter: (copy.left + copy.right) / 2,
      mobileLogo: document.querySelector('.site-name-logo').getAttribute('src'),
      bioLogo: document.querySelector('.mobile-bio-header').getAttribute('src')
    };
  });
  assert.ok(mobile.headingBottom < mobile.emailTop && mobile.emailBottom < mobile.headerTop
    && mobile.headerBottom < mobile.bioTop, 'Mobile heading/email/header/bio order');
  assert.ok(Math.abs(mobile.emailSize - (390 - 32) / 28.84 * 1.1) < .01, 'Mobile email +10%');
  assert.ok(Math.abs(mobile.copyCenter - 195) < 1, 'Mobile copyright remains centered');
  assert.equal(mobile.mobileLogo, '/assets/media/Risorsa%203.svg');
  assert.equal(mobile.bioLogo, '/assets/media/Risorsa%204.svg');

  const fallback = await context.newPage();
  await fallback.route('https://mediaz.andreapintauro.com/media/Risorsa%205.svg', route => route.abort());
  await fallback.goto('http://127.0.0.1:4173/');
  await fallback.waitForFunction(() => {
    const image = document.querySelector('.header-resource img');
    return image.complete && image.naturalWidth > 0 && image.src.includes('/assets/media/Risorsa%205.svg');
  });
  await fallback.close();
  console.log('Responsive layout, logo fallback and mobile email checks passed.');

  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
