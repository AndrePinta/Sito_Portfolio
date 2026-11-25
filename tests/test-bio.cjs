const { chromium } = require('playwright');
const assert = require('node:assert/strict');

async function checkHeroLayout(page, label) {
  const layout = await page.evaluate(() => {
    const compact = document.body.classList.contains('is-compact-hero');
    const stacked = document.body.classList.contains('is-footer-stacked');
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
      stacked,
      caption: rect('.caption'),
      captionContentBottom: lines.at(-1).getBoundingClientRect().bottom,
      captionReservedBottom: rect('.caption').top + 3 * parseFloat(getComputedStyle(document.querySelector('.caption')).lineHeight),
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
  } else {
    assert.ok(Math.abs(layout.caption.top - layout.height * .4) < .1, `${label}: original fullscreen caption position`);
    assert.ok(Math.abs((layout.track.top - layout.captionReservedBottom) - (layout.bio.top - layout.track.bottom)) < .1,
      `${label}: fullscreen project centering below reserved caption space: ${JSON.stringify(layout)}`);
  }
  if (layout.stacked) {
    assert.ok(Math.abs(layout.email.top - layout.bio.top) < .1, `${label}: email/bio alignment`);
    assert.ok(Math.abs(layout.email.right - layout.copy.right) < .1, `${label}: email/copyright right alignment`);
    assert.ok(Math.abs(layout.credit.right - layout.copy.right) < .1, `${label}: type credit/copyright right alignment`);
    assert.ok(layout.email.bottom + 7 <= layout.credit.top, `${label}: email/type credit clearance`);
    assert.ok(layout.credit.bottom + 7 <= layout.copy.top, `${label}: type credit/copyright clearance`);
    assert.ok(Math.abs((layout.credit.top - layout.email.bottom) - (layout.copy.top - layout.credit.bottom)) < .1,
      `${label}: equal vertical gaps in right column`);
  } else {
    const emailRatio = layout.width / layout.height < 16 / 9 ? .44 : .5;
    const expectedEmailLeft = layout.header.left + (layout.header.right - layout.header.left) * emailRatio;
    assert.ok(Math.abs(layout.email.left - expectedEmailLeft) < .1, `${label}: original fullscreen email position`);
    assert.ok(Math.abs(layout.email.bottom - layout.copy.bottom) < .1, `${label}: original fullscreen footer baseline`);
    assert.ok(layout.email.right + 15 <= layout.credit.left, `${label}: horizontal footer clearance`);
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

  for (const [width, height] of [[1512, 982], [1512, 801], [1512, 800], [1512, 600], [1366, 768], [1201, 801], [1200, 801], [1201, 700], [1200, 700], [1100, 600], [1024, 600], [1023, 600], [900, 768], [900, 500], [781, 982], [781, 600], [1740, 360], [1920, 700], [1920, 1080], [2560, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    await checkHeroLayout(page, `${width}x${height}`);
  }
  for (const [width, height, stacked] of [[1200, 982, false], [1150, 982, true], [1512, 700, false]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('is-footer-stacked')), stacked,
      `${width}x${height}: stack footer only when horizontal space requires it`);
  }

  const slugs = await page.locator('.project-card').evaluateAll(cards => cards.map(card => card.dataset.slug));
  for (const [width, height] of [[781, 400], [900, 500], [1201, 801], [1512, 982], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const language of ['en', 'it']) {
      await page.locator(`[data-language="${language}"]`).click();
      let reference;
      for (const slug of slugs) {
        await page.locator(`.project-card[data-slug="${slug}"]`).dispatchEvent('pointerenter');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => {
          const caption = document.querySelector('.caption').getBoundingClientRect();
          const track = document.querySelector('.project-track').getBoundingClientRect();
          const lines = [...document.querySelectorAll('.caption-line')]
            .filter(line => getComputedStyle(line).display !== 'none');
          return { captionTop: caption.top, captionBottom: caption.bottom, trackTop: track.top,
            contentBottom: lines.at(-1).getBoundingClientRect().bottom };
        });
        if (!reference) reference = layout;
        assert.ok(Math.abs(layout.captionTop - reference.captionTop) < .1, `${language}/${slug}/${width}: stationary caption`);
        assert.ok(Math.abs(layout.trackTop - reference.trackTop) < .1, `${language}/${slug}/${width}: stationary artwork`);
        if (await page.locator('body').evaluate(body => body.classList.contains('is-compact-hero'))) {
          assert.ok(layout.contentBottom <= layout.captionBottom + .1, `${language}/${slug}/${width}: caption fits reserved space`);
        }
      }
    }
  }
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
  await page.setViewportSize({ width: 1512, height: 982 });
  const captionTop = await page.locator('.caption').evaluate(el => el.getBoundingClientRect().top);
  await page.locator('.project-card[data-slug="humh"]').dispatchEvent('pointerenter');
  await page.waitForTimeout(100);
  assert.ok(Math.abs(await page.locator('.caption').evaluate(el => el.getBoundingClientRect().top) - captionTop) < .1,
    'animated caption stays stationary while changing projects');
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
  for (const [width, height] of [[781, 600], [900, 768], [1200, 800], [1512, 982], [1920, 1080], [2560, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const progress of [0, .5, 1]) {
      await page.evaluate(progress => scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * progress, behavior: 'instant' }), progress);
      const positions = await page.evaluate(() => {
        const bounds = selector => document.querySelector(selector).getBoundingClientRect();
        const email = bounds('.footer-email');
        const bio = bounds('.footer-bio');
        const track = bounds('.project-track');
        const header = bounds('.site-header');
        return { emailLeft: email.left, emailRight: email.right, emailBottom: email.bottom,
          bioTop: bio.top, trackLeft: track.left, headerLeft: header.left };
      });
      assert.ok(Math.abs(positions.emailLeft - positions.headerLeft) < .1, `${width}: list email left aligned`);
      assert.ok(positions.emailRight + 16 <= positions.trackLeft, `${width}: list email clears scrolling artwork`);
      assert.ok(positions.emailBottom + 11 <= positions.bioTop, `${width}: list email clears bio`);
    }
  }
  await page.goto('http://127.0.0.1:4173/projects/dish-list');
  assert.equal(await page.locator('.site-footer').evaluate(el => getComputedStyle(el).position), 'fixed');

  for (const width of [900, 1512, 1920]) {
    await page.setViewportSize({ width, height: 982 });
    const measurements = [];
    for (const slug of ['humh', 'food-route']) {
      await page.goto(`http://127.0.0.1:4173/projects/${slug}`);
      await page.locator('.detail-gallery figure:last-child').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.detail-gallery figure:last-child').classList.contains('is-revealed'));
      await page.waitForTimeout(100);
      measurements.push(await page.locator('.detail-gallery figure:last-child').evaluate(figure => {
        const image = figure.querySelector('img').getBoundingClientRect();
        const previous = figure.previousElementSibling.getBoundingClientRect();
        return { width: image.width, height: image.height, gap: image.top - previous.bottom };
      }));
    }
    for (const dimension of ['width', 'height']) {
      assert.ok(Math.abs(measurements[0][dimension] * 2.25 - measurements[1][dimension]) < .1,
        `${width}: Food Route final artwork ${dimension} is 125% larger than Humh`);
    }
    assert.ok(Math.abs(measurements[0].gap - measurements[1].gap) < .1,
      `${width}: Food Route and Humh final artwork gap`);
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [900, 1512, 1920]) {
    await page.setViewportSize({ width, height: 982 });
    await page.goto('http://127.0.0.1:4173/projects/food-route');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('.detail-gallery figure:last-child').classList.contains('is-revealed'));
    await page.waitForTimeout(1100);
    const gap = await page.locator('.detail-gallery figure:last-child').evaluate(figure =>
      figure.querySelector('img').getBoundingClientRect().top
        - figure.previousElementSibling.querySelector('img').getBoundingClientRect().bottom
    );
    assert.ok(Math.abs(gap - 20) < 1, `${width}: Food Route visible gap after panorama: ${gap}px`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });

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
      headingSize: parseFloat(getComputedStyle(document.querySelector('.mobile-footer-heading')).fontSize),
      bioSize: parseFloat(getComputedStyle(document.querySelector('.footer-bio')).fontSize),
      copyCenter: (copy.left + copy.right) / 2,
      mobileLogo: document.querySelector('.site-name-logo').getAttribute('src'),
      bioLogo: document.querySelector('.mobile-bio-header').getAttribute('src')
    };
  });
  assert.ok(mobile.headingBottom < mobile.emailTop && mobile.emailBottom < mobile.headerTop
    && mobile.headerBottom < mobile.bioTop, 'Mobile heading/email/header/bio order');
  assert.equal(mobile.emailSize, mobile.bioSize, 'Mobile email matches bio size');
  assert.equal(mobile.headingSize, mobile.bioSize, 'Mobile heading matches bio size');
  assert.ok(Math.abs(mobile.copyCenter - 195) < 1, 'Mobile copyright remains centered');
  assert.equal(mobile.mobileLogo, '/assets/media/Risorsa%203.svg');
  assert.equal(mobile.bioLogo, '/assets/media/Risorsa%204.svg');

  for (const width of [320, 375, 640, 641, 780]) {
    await page.setViewportSize({ width, height: 844 });
    const sizes = await page.evaluate(() => {
      const email = document.querySelector('.footer-email');
      return {
        email: parseFloat(getComputedStyle(email).fontSize),
        heading: parseFloat(getComputedStyle(document.querySelector('.mobile-footer-heading')).fontSize),
        bio: parseFloat(getComputedStyle(document.querySelector('.footer-bio')).fontSize),
        overflow: email.scrollWidth > email.clientWidth
      };
    });
    assert.equal(sizes.heading, sizes.bio, `${width}: heading matches bio size`);
    assert.equal(sizes.email, sizes.bio, `${width}: email matches bio size`);
    assert.equal(sizes.overflow, false, `${width}: email fits`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.project-card[data-slug="dish-list"]').dispatchEvent('click');
  await page.waitForTimeout(100);
  const dishSpacing = await page.locator('.mobile-expanded-project .is-panoramic').evaluate(figure => ({
    before: figure.querySelector('img').getBoundingClientRect().top
      - figure.previousElementSibling.querySelector('img').getBoundingClientRect().bottom,
    after: figure.nextElementSibling.querySelector('img').getBoundingClientRect().top
      - figure.querySelector('img').getBoundingClientRect().bottom
  }));
  assert.ok(Math.abs(dishSpacing.before - 390 * .02) < .1, 'Dish List panorama has a small upper gap');
  assert.ok(Math.abs(dishSpacing.after) < .1, 'Dish List panorama retains the gap before the GIF');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const panorama = page.locator('.mobile-expanded-project .is-panoramic');
  await panorama.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  assert.ok(await panorama.evaluate(figure => figure.scrollLeft) > 0, 'Mobile panorama hints at horizontal scrolling');
  await page.waitForTimeout(1200);
  assert.equal(await panorama.evaluate(figure => figure.scrollLeft), 0, 'Mobile panorama returns to its starting position');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(150);
  await panorama.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  assert.ok(await panorama.evaluate(figure => figure.scrollLeft) > 0, 'Mobile panorama hints again on re-entry');
  await panorama.dispatchEvent('pointerdown');
  await panorama.evaluate(figure => { figure.scrollLeft = 55; });
  await page.waitForTimeout(1000);
  assert.equal(await panorama.evaluate(figure => figure.scrollLeft), 55, 'Touch interrupts the hint without overriding the user');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await panorama.evaluate(figure => { figure.scrollLeft = 0; });
  await page.waitForTimeout(150);
  await panorama.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  assert.equal(await panorama.evaluate(figure => figure.scrollLeft), 0, 'Reduced motion disables panorama hints');

  for (const slug of ['dish-list', 'entre-panes', 'serenissima', 'convocatoria-abierta', 'humh', 'food-route']) {
    await page.goto('http://127.0.0.1:4173/');
    await page.locator(`.project-card[data-slug="${slug}"]`).dispatchEvent('click');
    await page.waitForTimeout(100);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const panoramas = page.locator('.mobile-expanded-project .mobile-overlay-figure.is-panoramic');
    for (let index = 0; index < await panoramas.count(); index++) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(150);
      const figure = panoramas.nth(index);
      await figure.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      assert.ok(await figure.evaluate(element => element.scrollLeft) > 0,
        `${slug}/${index}: panorama hints at horizontal scrolling`);
      await page.waitForTimeout(1200);
      assert.equal(await figure.evaluate(element => element.scrollLeft), 0,
        `${slug}/${index}: panorama returns to its starting position`);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  await page.setViewportSize({ width: 700, height: 844 });
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('.project-card[data-slug="food-route"]').dispatchEvent('click');
  await page.waitForTimeout(100);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const tabletPanorama = page.locator('.mobile-expanded-project .is-panoramic').first();
  await tabletPanorama.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  assert.ok(await tabletPanorama.evaluate(figure => figure.scrollLeft) > 0, 'Mobile-width tablet panorama hints at scrolling');

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
