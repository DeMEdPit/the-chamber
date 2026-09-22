// SPDX-License-Identifier: MIT
// Find Playwright and a Chromium without hardcoding one machine's layout.
export async function browser() {
  let pw = null;
  const specs = ['playwright', process.env.PLAYWRIGHT_MODULE, '/opt/node22/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const spec of specs) {
    try { const m = await import(spec); pw = m.default ?? m; if (pw.chromium) break; } catch (e) { pw = null; }
  }
  if (!pw || !pw.chromium) {
    throw new Error('playwright not found: npm install --no-save playwright@1.56.1 && npx playwright install --with-deps chromium');
  }
  const opts = { args: ['--autoplay-policy=no-user-gesture-required'] };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  return pw.chromium.launch(opts);
}
