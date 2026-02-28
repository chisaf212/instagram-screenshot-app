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
      defaultViewport: { width: 390, height: 844 },
    });
  }

  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    pipe: true,
    defaultViewport: { width: 390, height: 844 },
  });
}

export default async function handler(req, res) {
  const url = req.query.url || 'https://www.instagram.com/chiro_reito_recipe/';
  let browser = null;

  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(IPHONE_UA);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await new Promise((r) => setTimeout(r, 5000));

    // ページの状態を収集
    const info = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyLength: document.body?.innerHTML?.length || 0,
      bodyText: document.body?.innerText?.slice(0, 300) || '',
      hasMain: !!document.querySelector('main'),
      hasHeader: !!document.querySelector('header'),
      metaRobots: document.querySelector('meta[name="robots"]')?.content || 'none',
    }));

    // 小さいサムネイルを返す（診断用）
    const screenshot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 390, height: 200 } });
    const thumb = Buffer.from(screenshot).toString('base64');

    return res.status(200).json({ ...info, thumb });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export const config = { api: { responseLimit: '5mb' } };
