class CronInterval {
  private _requestAnimationFrame: any = undefined
  private _cancelAnimationFrame: any = undefined
  private _running = false
  private _runId: any = undefined
  private _lastUpdate: number = 0
  private _runnable: any = undefined
  private _intervalDurationInMs: number = 1000
  constructor() {
    this.interops()
    this.runInternal = this.runInternal.bind(this)
  }

  private getTimeInMs(): number {
    if (window.performance && typeof window.performance.now === 'function') {
      return window.performance.now()
    }
    return Date.now()
  }

  private interops() {
    // eslint-disable-next-line no-undef
    const refRequestAnimationFrame =
      window.requestAnimationFrame ||
      // @ts-ignore
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      // @ts-ignore
      window.msRequestAnimationFrame
    const refCancelAnimationFrame =
      window.cancelAnimationFrame ||
      // @ts-ignore
      window.mozCancelAnimationFrame ||
      window.cancelAnimationFrame ||
      window.cancelAnimationFrame

    if (
      refRequestAnimationFrame &&
      refCancelAnimationFrame &&
      typeof refRequestAnimationFrame === 'function' &&
      typeof refCancelAnimationFrame === 'function'
    ) {
      this._requestAnimationFrame = refRequestAnimationFrame.bind(window)
      this._cancelAnimationFrame = refCancelAnimationFrame.bind(window)
    }
  }

  private runInternal() {
    const now = this.getTimeInMs()
    if (now - this._lastUpdate >= this._intervalDurationInMs) {
      this._runnable()
      this._lastUpdate = now
    }
    if (!this._running) {
      return
    }
    if (this._runId) this._cancelAnimationFrame(this._runId)
    this._runId = this._requestAnimationFrame(this.runInternal)
  }

  get isRunning(): boolean {
    return this._running
  }

  start(runnable?: any, intervalDurationInMs: number = 1000, runImmediate: boolean = true) {
    if (!(runnable && typeof runnable === 'function')) {
      throw new Error(`expecting a function type as 'runnable' param.`)
    }
    if (this._running) {
      throw new Error(`already running. call stop to return`)
    }
    this._runnable = runnable
    this._intervalDurationInMs = intervalDurationInMs

    this._lastUpdate = runImmediate ? 0 : this.getTimeInMs()
    this._running = true
    this.runInternal()
  }

  stop() {
    if (this._runId) {
      this._runId = undefined
      this._running = false
      this._cancelAnimationFrame(this._runId)
    }
  }
}

export { CronInterval }
