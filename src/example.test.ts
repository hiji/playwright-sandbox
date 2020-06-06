import { chromium, Page, ChromiumBrowser, CDPSession } from "playwright";

let browser: ChromiumBrowser;
let page: Page;

describe("example", () => {

  beforeAll(async () => {
    browser = await chromium.launch({headless: false, slowMo: 10});
    page = await browser.newPage();
  });

  afterAll(async () => {
    await page.close();
    await browser.close();
  });

  test('Google search', async () => {
    await page.goto("http://www.google.co.jp");

    await page.type('css=input', 'wiki');
    await Promise.all([
      page.waitForNavigation(),
      page.keyboard.press('Enter')
    ]);

    await page.click('css=div[aria-label="消去"]');
    await page.type('css=input[title="検索"]', 'youtube');
    await Promise.all([
      page.waitForNavigation(),
      page.keyboard.press('Enter')
    ]);
  });

});
