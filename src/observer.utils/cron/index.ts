
export interface Runnable {
    execute: () => void;
}

const intervalDuration = 1000

class CronInterval {
    private _runId?: NodeJS.Timeout
    private _runnable?: Runnable
    private _intervalDurationInMs = intervalDuration

    constructor () {
        this.runInternal = this.runInternal.bind(this)
    }

    start (runnable: Runnable, intervalDurationInMs = intervalDuration): void {
        this._runnable = runnable
        this._intervalDurationInMs = intervalDurationInMs
        this.runInternal()
    }

    stop (): void {
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
