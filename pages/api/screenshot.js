const puppeteer = require('puppeteer-core');

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function getBrowser() {
  // Vercel / Lambda 環境
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

  // ローカル開発: システム Chrome (pipe: true で WebSocket 問題を回避)
  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    pipe: true,
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
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

    await page.setUserAgent(IPHONE_UA);

    // ライトモード強制
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
    ]);

    // バナー・ポップアップ系を先にCSSで非表示設定
    await page.evaluateOnNewDocument(() => {
      const style = document.createElement('style');
      style.textContent = `
        div[role="dialog"], div[role="alertdialog"] { display: none !important; }
      `;
      document.addEventListener('DOMContentLoaded', () => {
        document.head?.appendChild(style);
      });
    });

    // domcontentloaded で遷移（networkidle2 は Instagram で詰まる）
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

    // コンテンツ描画待ち
    await new Promise((r) => setTimeout(r, 5000));

    // モーダル・バナーを DOM から削除
    await page.evaluate(() => {
      // ダイアログ系
      document.querySelectorAll('div[role="dialog"], div[role="alertdialog"]').forEach((el) => el.remove());

      // 「アプリを開く」テキストを含む要素を親ごと削除
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent.trim();
        if (text.includes('アプリを開く') || text.includes('Open App') || text.includes('アプリで開く')) {
          let el = walker.currentNode.parentElement;
          for (let i = 0; i < 3; i++) {
            if (el && el.tagName !== 'BODY') el = el.parentElement;
          }
          if (el && el.tagName !== 'BODY') targets.push(el);
        }
      }
      targets.forEach((el) => el.remove());

      // 右上の × ボタンを座標から特定して削除
      const xBtn = document.elementFromPoint(window.innerWidth - 30, 25);
      if (xBtn && !['BODY', 'HTML', 'MAIN'].includes(xBtn.tagName)) {
        let el = xBtn;
        for (let i = 0; i < 4; i++) {
          if (el.parentElement && !['BODY', 'HTML', 'MAIN'].includes(el.parentElement.tagName)) {
            el = el.parentElement;
          }
        }
        el.remove();
      }
    }).catch(() => {});

    // ESC でモーダルを閉じる
    await page.keyboard.press('Escape').catch(() => {});
    await new Promise((r) => setTimeout(r, 500));

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
    if (browser) await browser.close().catch(() => {});
  }
}

export const config = {
  api: { responseLimit: '15mb' },
};
