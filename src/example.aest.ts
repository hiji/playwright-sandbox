import { chromium, Page, ChromiumBrowser, CDPSession } from "playwright";
import * as ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
// import * as fs from "fs";

let browser: ChromiumBrowser;
let page: Page;
let cdpSession: CDPSession;

const fps = 20;
let ffmpegPromise: Promise<void>;
// let num = 0;

type FrameData = {
  timestamp: number;
  data: Buffer;
}

// FFmpegのところもクラスにした方がいいとは思うが、とりあえず動くレベルにする
// フレーム用リスナーが時系列と異なって実行されることがあるので、時系列に直すための中間ストリームを用意する
class FrameBufferStream extends PassThrough {

  private buffer: Array<FrameData> = [];

  // フレームを溜め込むサイズが大きいと画像データの保持量が増えてしまう
  // 実際に発生した範囲では、10程度の前後関係で対応できそうな感じだったのでそれにする
  private size = 10;

  private preTimestamp = Number.MAX_VALUE;

  private lastTimestamp;

  private comparator = (a, b) => {
    if (a.timestamp > b.timestamp) return 1;
    if (a.timestamp < b.timestamp) return -1;
    return 0;
  };

  public pushFrame(frame: FrameData) {
    this.buffer.push(frame);
    if (this.buffer.length === this.size) {
      this.flush();
    }
  }

  public flush() {
    this.buffer.sort(this.comparator);

    for (const frame of this.buffer) {
      this.lastTimestamp = frame.timestamp;

      // 実行環境でフレームのタイミングが変わるため、枚数に合わせてFPSも動的に変えないといけなくなる
      // FPSを動的に判断するのは難しいため、フレーム間隔と指定FPSに応じて画像の枚数を調整して安定させる
      // 順序が逆になった場合にマイナスになったりもするで、最低1枚にしておく
      const diff = this.lastTimestamp - this.preTimestamp;
      const fillCount = Math.max(Math.round(diff * fps), 1);
      for (let i = 0; i < fillCount; i++) {
        super.write(frame.data);
      }
      this.preTimestamp = this.lastTimestamp
    }
    this.buffer.length = 0;
  }
}

const frameStream = new FrameBufferStream();

describe("example", () => {

  beforeAll(async () => {
    // browser = await chromium.launch({headless: false, slowMo: 30});
    browser = await chromium.launch({headless: true});
    page = await browser.newPage();

    ffmpegPromise = new Promise((resolve, reject) => {
      // priorityは下げずに0(default)のままにしてみるが、CPUを使いすぎるようなら調整する
      ffmpeg({ source: frameStream })
        .videoCodec('libx264')
        .inputFormat('image2pipe')
        .inputFPS(fps)
        .outputOptions([
          '-preset ultrafast',
          '-pix_fmt yuv420p' // MacのQuickTime用
        ])
        .on('error', e => {
          console.error('ffmpeg error.', e);
          reject();
        })
        .on('end', () => {
          resolve();
        })
        .save('example.mp4');
    });

    const context = await browser.newContext();
    cdpSession = await context.newCDPSession(page);

    // 1フレーム毎に通知するようにスクリーンキャストを開始
    await cdpSession.send('Page.startScreencast', {
      everyNthFrame: 1,
    });

    cdpSession.addListener('Page.screencastFrame', async (payload) => {
      // エラーのフレームでないか確認する
      await cdpSession.send('Page.screencastFrameAck', {
        sessionId: payload.sessionId,
      });

      // screencastの画像データはBase64でエンコードされているため、デコードして書き出し
      frameStream.pushFrame({
        timestamp: payload.metadata.timestamp,
        data: Buffer.from(payload.data, 'base64')
      });

      // pngで残す場合
      // fs.writeFileSync(`./frame${String(num).padStart(5, '0')}.png`, data);
      // num++;
    });
  });

  afterAll(async () => {
    await cdpSession.send('Page.stopScreencast');
    // スクリーンキャストの最後のフレームを処理し終わってからストリーム停止しなければ、
    // リスナーでの書き込みが停止後にされてしまうことがあり、エラーになることがある。
    // 最後のフレームであるかの判定が難しいため、停止してから1秒待つことで対応しておく
    // （動作確認した範囲では1秒でエラーは出なくなった）
    await new Promise(resolve => setTimeout(() => resolve(), 1000));

    frameStream.flush();
    frameStream.end();
    await ffmpegPromise;

    await cdpSession.detach()
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
