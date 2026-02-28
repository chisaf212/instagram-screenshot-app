const puppeteer = require('puppeteer-core');

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Instagram ログインモーダル・クッキーバナーを閉じるセレクタ
const CLOSE_SELECTORS = [
  'button[aria-label="閉じる"]',
  'button[aria-label="Close"]',
  'div[role="dialog"] button:last-of-type',
  '._a9-- button',
];

async function getBrowser() {
  if (process.env.NODE_ENV === 'production') {
    const chromium = require('@sparticuz/chromium');
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: null,
    });
  }

  // ローカル開発: システムのChromeを使用（pipe: true でWebSocket問題を回避）
  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    pipe: true,
    defaultViewport: null,
  });
}

export default async function handler(req, res) {
  const { url, name } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'url パラメータが必要です' });
  }

  const filename = (name ? name.replace(/[/\\?%*:|"<>]/g, '_') : 'screenshot') + '.png';

  let browser = null;

  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    // スマートフォン（iPhone 14）サイズ
    await page.setViewport({
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    await page.setUserAgent(IPHONE_UA);

    // ライトモード強制
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
    ]);

    // バナー・ポップアップ系UIをCSSで非表示
    await page.addStyleTag({
      content: `
        /* アプリを開くバナー・×ボタンを非表示 */
        div[class*="EmbeddedBanner"],
        div[id*="banner"],
        [aria-label="Close"], [aria-label="閉じる"],
        div[style*="position: fixed"][style*="z-index"],
        div[style*="position:fixed"] {
          display: none !important;
        }
      `,
    }).catch(() => {});

    // domcontentloaded で待機（networkidle2 だとInstagramで詰まる）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // コンテンツが描画されるまで待機
    await new Promise((r) => setTimeout(r, 5000));

    // JavaScriptでモーダルを強制的に閉じる
    const closed = await page.evaluate(() => {
      // × ボタン・閉じるボタンをテキスト・aria-labelで探す
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const closeBtn = allButtons.find((btn) => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const text = (btn.textContent || '').trim();
        return (
          label.includes('close') ||
          label.includes('閉じ') ||
          label.includes('dismiss') ||
          text === '×' || text === '✕' || text === 'X'
        );
      });
      if (closeBtn) { closeBtn.click(); return true; }

      // ダイアログ・モーダルの外側をクリック
      const overlay = document.querySelector('div[role="dialog"]');
      if (overlay) { overlay.parentElement?.click(); return true; }

      return false;
    });

    // ESCキーも試みる
    await page.keyboard.press('Escape').catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    // まだモーダル・バナーが残っていたら DOM から削除
    await page.evaluate(() => {
      // ダイアログ系
      document.querySelectorAll('div[role="dialog"], div[role="alertdialog"]').forEach((el) => el.remove());

      // 「アプリを開く」テキストを含む要素をさかのぼって削除
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent.trim();
        if (text.includes('アプリを開く') || text.includes('Open App') || text.includes('アプリで開く')) {
          let el = walker.currentNode.parentElement;
          // 1〜3段階上の祖先要素を取得（バナー全体を削除）
          for (let i = 0; i < 3; i++) {
            if (el && el.tagName !== 'BODY') el = el.parentElement;
          }
          if (el && el.tagName !== 'BODY') targets.push(el);
        }
      }
      targets.forEach((el) => el.remove());

      // 右上の × ボタン: 座標から要素を特定して親ごと削除
      const xBtn = document.elementFromPoint(window.innerWidth - 30, 25);
      if (xBtn && xBtn.tagName !== 'BODY' && xBtn.tagName !== 'HTML') {
        let el = xBtn;
        for (let i = 0; i < 4; i++) {
          if (el.parentElement && !['BODY','HTML','MAIN'].includes(el.parentElement.tagName)) {
            el = el.parentElement;
          }
        }
        el.remove();
      }
    }).catch(() => {});

    // スクリーンショット撮影
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
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export const config = {
  api: {
    responseLimit: '15mb',
  },
};
