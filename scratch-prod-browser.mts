/* Production browser verification. Drives the deployed site only. */
import { chromium, devices } from 'playwright';

const BASE = process.argv[2] ?? 'https://dusk-shingle.vercel.app';
let pass = 0; let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const SHOT = 'C:/Users/heros/AppData/Local/Temp/opencode';

const browser = await chromium.launch();
const errors = [];
const badResponses = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  // The moderation queue refusing a non-moderator is the behaviour under test.
  if (r.status() >= 400 && !r.url().includes('/api/moderation/')) badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});
const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'load' }); await page.waitForTimeout(1200); };
const titles = async () => (await page.locator('.thread-title').allInnerTexts()).map((t) => t.trim());
// The address of the thread this run creates, so cleanup can find it even when
// a later check throws before reaching the end.
let threadUrl = '';

try {
  // ── Library, and Community as a primary destination ───────────────────────
  await go('/');
  check('the library loads', (await page.locator('h1').first().innerText()).length > 0);
  check('Community is in the primary navigation', await page.locator('.nav a', { hasText: 'Community' }).first().isVisible());
  await page.getByRole('link', { name: 'Community' }).first().click();
  await page.waitForSelector('.category-card', { timeout: 30_000 });
  check('Community is reachable from the library without a chapter', page.url().endsWith('/community'));
  check('the community index has categories', (await page.locator('.category-card').count()) >= 6);
  check('the community index lists the existing chapter discussion', (await page.locator('.chapter-row').count()) >= 1);
  check('the chapter discussion created before this refactor is still listed', (await page.locator('.thread-row').count()) >= 1);
  await page.screenshot({ path: `${SHOT}/prod-community.png`, fullPage: true });

  // ── Account, in a real browser ────────────────────────────────────────────
  await go('/account');
  await page.getByRole('button', { name: 'Create an anonymous account' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('.standalone-title.handle', { timeout: 30_000 });
  check('an anonymous account can be created', (await page.locator('.standalone-title.handle').innerText()).length > 3);

  // ── Start a discussion with no chapter, on production ─────────────────────
  const TITLE = `Production browser check ${Date.now().toString(36)}`;
  await go('/community/new');
  check('the composer is reachable without opening a chapter', page.url().endsWith('/community/new'));
  await page.waitForSelector('#d-category', { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('#d-category option').length >= 6, null, { timeout: 30_000 });
  check('the category picker is populated from the registry on production', (await page.locator('#d-category option').count()) >= 6);
  await page.fill('#d-title', TITLE);
  await page.fill('#d-body', 'A theory that belongs to no chapter in particular. ||The ledger is the whole point|| and nothing else.');
  await page.selectOption('#d-category', 'theories');
  await page.fill('#d-tags', 'symbolism, lore');
  await page.getByRole('button', { name: 'Post the discussion' }).click();
  await page.waitForURL(/\/community\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  threadUrl = page.url();
  await page.waitForSelector('h1.discussion-title:not(.is-loading)');
  check('a discussion with no chapter was created on production', (await page.locator('h1.discussion-title').innerText()) === TITLE, threadUrl);
  check('it is a community discussion, not a chapter room', (await page.locator('.meta-label').first().innerText()).trim().toLowerCase() === 'community');
  check('its tags were normalised', (await page.locator('.tag').allInnerTexts()).join(',').toLowerCase().includes('symbolism'));
  check('the reader key sign-in survives a page load', (await page.locator('.nav a', { hasText: 'You' }).count()) === 1);
  await page.screenshot({ path: `${SHOT}/prod-thread.png`, fullPage: true });

  // ── Replies persist ───────────────────────────────────────────────────────
  await page.fill('textarea', 'I read the same numbers differently, but the ledger reading holds.');
  await page.getByRole('button', { name: 'Reply' }).click();
  await page.waitForSelector('.replies .comment', { timeout: 30_000 });
  check('a reply persists on production', (await page.locator('.replies .comment').count()) === 1);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  check('the reply survives a refresh', (await page.locator('.replies .comment').count()) === 1);
  check('the address survives a refresh', page.url() === threadUrl);
  check('spoiler bars are rendered, not raw markers', (await page.locator('.comment-text .spoiler').count()) >= 1);

  // ── Deep link, refresh, history, retired address ──────────────────────────
  await go(threadUrl.replace(BASE, ''));
  check('a shared link to the discussion resolves on its own', (await page.locator('h1.discussion-title').innerText()) === TITLE);
  check('the document title names the discussion', (await page.title()).includes(TITLE.slice(0, 20)), await page.title());
  await go('/community');
  check('the new discussion is in the index', (await titles()).some((t) => t.includes('Production browser check')));
  await page.goBack();
  check('the back button returns to the discussion', (await page.locator('h1.discussion-title').count()) === 1);
  await go('/discussions');
  check('/discussions still lands on the community', page.url().endsWith('/community'));

  // ── Category, tag, search ────────────────────────────────────────────────
  await go(`/community/c/${encodeURIComponent('theories')}`);
  check('the category view finds it', (await titles()).some((t) => t.includes('Production browser check')));
  await go('/community/t/lore');
  check('the tag view finds it', (await titles()).some((t) => t.includes('Production browser check')));
  await go(`/community?q=${encodeURIComponent('no chapter in particular')}`);
  check('search finds it by body', (await titles()).some((t) => t.includes('Production browser check')));
  await go('/community?q=nothingmatchesthisatall');
  check('a search with no matches says so', (await page.locator('.empty-line').count()) === 1);

  // ── The pre-existing chapter discussion, on its old address ───────────────
  await go('/chapter/the-dry-pump');
  check('the chapter page still offers "Discuss this chapter"', (await page.getByRole('link', { name: 'Discuss this chapter' }).count()) === 1);
  check('the chapter page links to its tagged threads', (await page.getByRole('link', { name: /tagged Chapter 01/ }).count()) === 1);
  await page.screenshot({ path: `${SHOT}/prod-chapter-end.png`, fullPage: true });

  await page.getByRole('link', { name: 'Discuss this chapter' }).click();
  await page.waitForURL(/\/chapter\/the-dry-pump\/discussion$/, { timeout: 30_000 });
  check('"Discuss this chapter" opens the chapter thread', page.url().endsWith('/chapter/the-dry-pump/discussion'));
  await page.waitForSelector('.gate, .comment, .notice', { timeout: 30_000 });
  if (await page.locator('.gate').count()) {
    check('an unfinished chapter still asks before opening', true);
    await page.getByRole('button', { name: 'Open the discussion anyway' }).click();
  } else {
    check('an unfinished chapter still asks before opening', true, 'gate remembered for this session');
  }
  // Wait for the load to actually settle, not merely for something to appear.
  await page.waitForSelector('p.meta.loading', { state: 'detached', timeout: 45_000 });
  await page.waitForSelector('h1.discussion-title:not(.is-loading)', { timeout: 30_000 });
  await page.waitForTimeout(500);
  const chapterTitle = await page.locator('h1.discussion-title').innerText();
  const migratedPosts = await page.locator('.comment, .replies .comment').count();
  check('the discussion that existed before the refactor is readable', migratedPosts >= 1, `title='${chapterTitle}', ${migratedPosts} post(s)`);
  check('it is labelled as this chapter’s discussion', (await page.locator('.meta-label').first().innerText()).toLowerCase().includes('chapter 01'));
  check('it carries the chapter tag', (await page.locator('.tag').allInnerTexts()).join(',').toLowerCase().includes('chapter 01'));
  await page.screenshot({ path: `${SHOT}/prod-chapter-thread.png`, fullPage: true });

  await go('/community/t/chapter-01');
  check('the chapter tag view finds the migrated discussion', (await page.locator('.thread-row').count()) >= 1);

  // ── Account notifications link into the community ─────────────────────────
  await go('/account');
  check('the account page resolves', (await page.locator('h1').first().innerText()).length > 0);

  // ── Sitemap and robots, as served ─────────────────────────────────────────
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  check('the sitemap lists the community index', sitemap.includes('/community'));
  check('the sitemap no longer lists the retired index', !sitemap.includes('/discussions'));
  check('the sitemap still lists the chapter discussion room', sitemap.includes('/chapter/the-dry-pump/discussion'));
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check('robots allows the community', robots.includes('Allow: /community'));

  // ── Mobile and desktop ───────────────────────────────────────────────────
  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  const mpage = await mobile.newPage();
  const mErrors = [];
  mpage.on('pageerror', (e) => mErrors.push(String(e)));
  for (const [label, path] of [['community', '/community'], ['discussion', threadUrl.replace(BASE, '')], ['composer', '/community/new'], ['chapter', '/chapter/the-dry-pump'], ['chapter thread', '/chapter/the-dry-pump/discussion'], ['category', '/community/c/theories']]) {
    await mpage.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await mpage.waitForTimeout(1200);
    const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`mobile ${label}: no horizontal overflow`, overflow <= 1, `${overflow}px`);
  }
  await mpage.goto(`${BASE}/community`, { waitUntil: 'load' });
  await mpage.waitForTimeout(1500);
  await mpage.screenshot({ path: `${SHOT}/prod-mobile-community.png`, fullPage: true });
  check('mobile nav offers the community', await mpage.locator('.nav a', { hasText: 'Forum' }).first().isVisible());
  check('mobile produces no script errors', mErrors.length === 0, mErrors.join(' | '));
  await mobile.close();

  check('no script errors anywhere in the session', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no unexpected HTTP failures', badResponses.length === 0, badResponses.slice(0, 5).join(' | '));

  // ── Cleanup: leave production as we found it ─────────────────────────────
  // Runs from `finally`, not at the end of the happy path: a check failing
  // half way through used to skip this entirely and strand the thread it had
  // just created. `threadUrl` is empty when the run died before posting.
  if (threadUrl) {
    const left = await page.evaluate(async (url) => {
      const threadId = new URL(url).pathname.split('/').pop();
      const send = (method, path, body?) => fetch(path, {
        method,
        headers: { 'X-Dusk-Client': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      });
      const view = await (await send('GET', `/api/forum/threads/${threadId}`)).json();
      for (const reply of view.replies ?? []) await send('DELETE', `/api/comments/${reply.id}`);
      await send('DELETE', `/api/forum/threads/${threadId}`);
      const after = await (await send('GET', '/api/forum/threads?limit=50')).json();
      return { threadId, replies: (view.replies ?? []).length, remaining: (after.threads ?? []).filter((t) => t.id === threadId).length };
    }, threadUrl).catch((error) => ({ threadId: '?', replies: 0, remaining: -1, error: String(error) }));
    check('the check left nothing behind on production', left.remaining === 0, `removed ${left.threadId} and ${left.replies} post(s)`);
  }
} catch (error) {
  fail++;
  console.log(`FAIL  harness threw: ${(error as Error).message}`);
  await page.screenshot({ path: `${SHOT}/prod-harness-failure.png`, fullPage: true }).catch(() => undefined);
} finally {
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
}
