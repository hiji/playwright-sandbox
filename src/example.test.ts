import { chromium, Page, ChromiumBrowser, CDPSession } from "playwright";
import { VideoRecorder } from "./VideoRecorder";
import Debug from "debug";

let browser: ChromiumBrowser;
let page: Page;
const recorder = new VideoRecorder();
const debug = Debug('test');

// enable('*')にすると膨大な量が出力されて止まらなくなった
// 他のモジュール内部でもdebugモジュールを使っていて、それに反応している？
Debug.enable('test');

describe("example", () => {

  beforeAll(async () => {

    browser = await chromium.launch({headless: false, slowMo: 20});
    // browser = await chromium.launch({headless: true});
    page = await browser.newPage();

    await recorder.start(page, 'example.mp4');
  });

  afterAll(async () => {
    await recorder.stopAll();

    await page.close();
    await browser.close();
  });

  test('Google search', async () => {
    console.log('Google search start.');
    debug('Google search start.');

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

  test('Multi windows', async () => {
    console.log('Multi windows start.');
    debug('Multi windows start.');

    const anotherPage = await browser.newPage();

    await recorder.start(anotherPage, 'example2.mp4');

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
