import { logger } from '../observer.logger'

export interface WorkerPayload {
  what: string
  data: any
}

export interface WorkerCallback {
  onMessage(msg: any): void
  onError(err: any): void
}

class ObserverWorkerBridge {
    private _worker!: Worker

    constructor(private readonly loadURL: string, private readonly workerCallback?: WorkerCallback) {
      this.loadWorker = this.loadWorker.bind(this)
      this.onError = this.onError.bind(this)
      this.onMessage = this.onMessage.bind(this)
      this.loadWorker()
    }

    private loadWorker(): void {
      const contentURL = `importScripts( ${this.loadURL} );`;
      const workerURL = URL.createObjectURL( new Blob( [ contentURL ], { type: "text/javascript" } ) );
      this._worker = new Worker(workerURL);
      this._worker.onerror = this.onError
      this._worker.onmessage = this.onMessage
    }

    public sendMessage(data: WorkerPayload): void {
      this._worker.postMessage(data)
    }

    public onError(err: any): void {
      logger.error(err)
      this.workerCallback?.onError?.(err)
    }

    public onMessage(msg: any): void {
      logger.warn(msg)
      this.workerCallback?.onMessage?.(msg)
    }


}

export {ObserverWorkerBridge}
