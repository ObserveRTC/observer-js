
export interface Runnable {
    execute: () => void;
}

class CronInterval {
    private _runId?: number
    private _runnable?: Runnable
    private _intervalDurationInMs?: number

    constructor () {
        this.runInternal = this.runInternal.bind(this)
    }

    start (runnable: Runnable, intervalDurationInMs: number): void {
        this._runnable = runnable
        this._intervalDurationInMs = intervalDurationInMs
        this.runInternal()
    }

    stop (): void {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (this._runId) {
            clearTimeout(this._runId)
            // eslint-disable-next-line no-undefined
            this._runId = undefined
        }
    }
    private runInternal (): void {
        this._runnable?.execute()
        this._runId = setTimeout(
            this.runInternal.bind(this),
            this._intervalDurationInMs
        )
    }
}

export {
    CronInterval
}
