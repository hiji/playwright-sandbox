import { chromium, Page, ChromiumBrowser, CDPSession } from "playwright";
import { VideoRecorder } from "./VideoRecorder";

let browser: ChromiumBrowser;
let page: Page;
const recorder = new VideoRecorder();

describe("example", () => {

  beforeAll(async () => {

    // browser = await chromium.launch({headless: false, slowMo: 20});
    browser = await chromium.launch({headless: true});
    page = await browser.newPage();

    await recorder.start(browser, page, 'example.mp4');
  });

  afterAll(async () => {
    await recorder.stop();

    await page.close();
    await browser.close();
  });

  test('Google search', async () => {
    await page.goto("http://www.google.co.jp");

    await page.type('css=input', 'wiki');
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle'}),
      page.keyboard.press('Enter')
    ]);

    await page.click('css=div[aria-label="消去"]');
    await page.type('css=input[title="検索"]', 'youtube');
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle'}),
      page.keyboard.press('Enter')
    ]);
  });

});
