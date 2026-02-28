const puppeteer = require('puppeteer-core');

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function getBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = require('@sparticuz/chromium');
    return puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-setuid-sandbox',
        '--disable-features=VizDisplayCompositor',
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    });
  }

  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    pipe: true,
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
}

export default async function handler(req, res) {
  // POST のみ受け付ける
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { url, name, sessionid } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url が必要です' });
  }

  // sessionid: リクエストボディ → 環境変数の順で取得
  const sid = sessionid || process.env.INSTAGRAM_SESSION_ID || '';

  if (!sid) {
    return res.status(400).json({ error: 'sessionid が必要です。InstagramのCookieから取得してください。' });
  }

  const filename = (name ? name.replace(/[/\\?%*:|"<>]/g, '_') : 'screenshot') + '.png';

  let browser = null;

  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(IPHONE_UA);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    // Instagram の認証 Cookie をセット
    await page.setCookie(
      { name: 'sessionid', value: sid, domain: '.instagram.com', path: '/', httpOnly: true, secure: true },
      { name: 'ig_did', value: 'device-' + Math.random().toString(36).slice(2), domain: '.instagram.com', path: '/' },
      { name: 'csrftoken', value: 'dummy', domain: '.instagram.com', path: '/' }
    );

    // リクエストヘッダーを本物のiPhoneブラウザに近づける
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
    });

    await page.evaluateOnNewDocument(() => {
      const style = document.createElement('style');
      style.textContent = 'div[role="dialog"], div[role="alertdialog"] { display: none !important; }';
      document.addEventListener('DOMContentLoaded', () => document.head?.appendChild(style));
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await new Promise((r) => setTimeout(r, 5000));

    // ログインページにリダイレクトされていないか確認
    const finalUrl = page.url();
    if (finalUrl.includes('/accounts/login/')) {
      return res.status(401).json({ error: 'sessionid が無効か期限切れです。再取得してください。' });
    }

    // モーダル・バナー削除
    await page.evaluate(() => {
      document.querySelectorAll('div[role="dialog"], div[role="alertdialog"]').forEach((el) => el.remove());

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent.trim();
        if (text.includes('アプリを開く') || text.includes('Open App')) {
          let el = walker.currentNode.parentElement;
          for (let i = 0; i < 3; i++) {
            if (el && el.tagName !== 'BODY') el = el.parentElement;
          }
          if (el && el.tagName !== 'BODY') targets.push(el);
        }
      }
      targets.forEach((el) => el.remove());

      const xBtn = document.elementFromPoint(window.innerWidth - 30, 25);
      if (xBtn && !['BODY', 'HTML', 'MAIN'].includes(xBtn.tagName)) {
        let el = xBtn;
        for (let i = 0; i < 4; i++) {
          if (el.parentElement && !['BODY', 'HTML', 'MAIN'].includes(el.parentElement.tagName)) el = el.parentElement;
        }
        el.remove();
      }
    }).catch(() => {});

    await page.keyboard.press('Escape').catch(() => {});
    await new Promise((r) => setTimeout(r, 500));

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 390, height: 844 },
    });

    const base64 = Buffer.from(screenshot).toString('base64');
    return res.status(200).json({ image: base64, filename });

  } catch (error) {
    console.error('Screenshot error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export const config = {
  api: {
    responseLimit: '15mb',
    bodyParser: { sizeLimit: '1mb' },
  },
};
