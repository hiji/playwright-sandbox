import { chromium, Page, ChromiumBrowser, CDPSession } from "playwright";
import { VideoRecorder } from "./VideoRecorder";

let browser: ChromiumBrowser;
let page: Page;
const recorder = new VideoRecorder();

describe("example", () => {

  beforeAll(async () => {

    browser = await chromium.launch({headless: false, slowMo: 20});
    // browser = await chromium.launch({headless: true});
    page = await browser.newPage();

    await recorder.start(browser, page, 'example.mp4');
  });

  afterAll(async () => {
    await recorder.stopAll();

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

  test('multi windows', async () => {
    const anotherPage = await browser.newPage();

    await recorder.start(browser, anotherPage, 'example2.mp4');

    await page.goto("http://www.google.co.jp");
    await anotherPage.goto("http://www.google.co.jp");

    await page.type('css=input', 'wiki');
    await anotherPage.type('css=input', 'javascript');
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle'}),
      page.keyboard.press('Enter'),
      anotherPage.waitForNavigation({waitUntil: 'networkidle'}),
      anotherPage.keyboard.press('Enter'),
    ]);

    await page.click('css=div[aria-label="消去"]');
    await page.type('css=input[title="検索"]', 'youtube');
    await anotherPage.click('css=div[aria-label="消去"]');
    await anotherPage.type('css=input[title="検索"]', 'github');
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle'}),
      page.keyboard.press('Enter'),
      page.waitForNavigation({waitUntil: 'networkidle'}),
      anotherPage.keyboard.press('Enter')
    ]);

    await anotherPage.close;
  });

});
