import { Page, ChromiumBrowser, CDPSession } from "playwright";
import * as ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
// import * as fs from "fs";

type ScreencastFrame = {
  timestamp: number;
  data: Buffer;
}

export class VideoRecorder {

  private recorders: Array<PageRecorder> = [];

  async start(browser: ChromiumBrowser, page: Page, savePath: string) {
    const recorder = new PageRecorder();
    await recorder.start(browser, page, savePath);
    this.recorders.push(recorder);
  }

  async stopAll() {
    for (const recorder of this.recorders) {
      await recorder.stop();
    }
  }
}

class PageRecorder {

  // 試した範囲では、Page.startScreencastの間隔はざっくりと最大800ミリ秒、最小で50ミリ秒程度だった
  // FPSに合わせて枚数増幅するので大きくてもよいが、ファイルサイズもあるので、最小に合わせて20にしておく
  private fps = 20;

  private ffmpegPromise: Promise<void>;
  private frameStream: FrameBufferStream;
  private cdpSession: CDPSession;
  // private num = 0;

  async start(browser: ChromiumBrowser, page: Page, savePath: string) {

    this.frameStream = new FrameBufferStream(this.fps);

    this.ffmpegPromise = new Promise((resolve, reject) => {
      // priorityは下げずに0(default)のままにしてみるが、CPUを使いすぎるようなら調整する
      ffmpeg({ source: this.frameStream })
        .videoCodec('libx264')
        .inputFormat('image2pipe')
        .inputFPS(this.fps)
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
        .save(savePath);
    });

    const context = await browser.newContext();
    this.cdpSession = await context.newCDPSession(page);

    // 1フレーム毎に通知するようにスクリーンキャストを開始
    // https://chromedevtools.github.io/devtools-protocol/tot/Page/
    await this.cdpSession.send('Page.startScreencast', {
      everyNthFrame: 1,
    });

    this.cdpSession.addListener('Page.screencastFrame', async (payload) => {
      // エラー確認のためフレームを受信していることを確認する
      await this.cdpSession.send('Page.screencastFrameAck', {
        sessionId: payload.sessionId,
      });

      // screencastの画像データはBase64でエンコードされているため、デコードして書き出し
      this.frameStream.pushFrame({
        timestamp: payload.metadata.timestamp,
        data: Buffer.from(payload.data, 'base64')
      });

      // pngで残す場合
      // fs.writeFileSync(`./frame${String(this.num).padStart(5, '0')}.png`, Buffer.from(payload.data, 'base64'));
      // this.num++;
    });
  }

  async stop() {
    const stoppedTime = Date.now() / 1000;

    await this.cdpSession.send('Page.stopScreencast');
    await this.cdpSession.detach();

    // スクリーンキャストの最後のフレームを処理し終わってからストリーム停止しなければ、
    // リスナーでの書き込みが停止後にされてしまうことがあり、エラーになることがある。
    // 最後のフレームであるかの判定が難しいため、停止してから1秒待つことで対応しておく
    // （動作確認した範囲では1秒でエラーは出なくなった）
    // await new Promise(resolve => setTimeout(() => resolve(), 1000));

    this.frameStream.stop(stoppedTime);

    await this.ffmpegPromise;
  }
}

// フレーム用リスナーが時系列と異なって実行されることがあるので、時系列に直すための中間ストリームを用意する
class FrameBufferStream extends PassThrough {

  private buffer: Array<ScreencastFrame> = [];

  private readonly fps;

  // フレームを溜め込むサイズが大きいと画像データの保持量が増えてしまう
  // 実際に発生した範囲では、10程度の前後関係で対応できそうな感じだったのでそれにする
  private readonly bufferSize = 10;

  private readonly comparator = (a, b) => {
    if (a.timestamp > b.timestamp) return 1;
    if (a.timestamp < b.timestamp) return -1;
    return 0;
  };


  constructor(fps: number) {
    super();
    // FPSはVideoRecorderでだけ使いたいけど、ここでやるのが簡単なのでとりあえず持ってくる
    this.fps = fps;
  }

  public pushFrame(frame: ScreencastFrame) {
    this.buffer.push(frame);
    if (this.buffer.length === this.bufferSize) {
      this.flush();
    }
  }

  public flush() {
    // フレームの時系列が前後している場合があるのでバッファ内の範囲で戻す
    this.buffer.sort(this.comparator);

    // バッファ内の最後のフレームは、次フレームとの間隔を取得できないので、処理せずに次回にまわす
    const range = this.buffer.length - 1;
    for (let i = 0; i < range; i++) {
      const frame = this.buffer[i];
      const nextFrame = this.buffer[i + 1];
      this.writeFrame(frame, nextFrame.timestamp - frame.timestamp);
    }
    this.buffer.splice(0, range);
  }

  public stop(stoppedTime: number) {
    this.flush();

    // 最後のフレームの間隔は停止時間から算出して書き出す
    const lastFrame = this.buffer[0];
    this.writeFrame(lastFrame, stoppedTime - lastFrame.timestamp);

    this.end();
  }

  private writeFrame(frame: ScreencastFrame, duration: number) {
    // 実行環境でフレームのタイミングが変わるため、枚数に合わせてFPSも動的に変えないといけなくなる
    // FPSを動的に判断するのは難しいため、フレーム間隔と指定FPSに応じて画像の枚数を調整して安定させる
    // 順序が逆になった場合にマイナスになったりもするで、最低1枚にしておく
    const fillCount = Math.max(Math.round(duration * this.fps), 1);
    for (let i = 0; i < fillCount; i++) {
      super.write(frame.data);
    }
  }
}
