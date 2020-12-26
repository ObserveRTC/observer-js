class CronInterval {
    private _runId: any = undefined

    private _runnable?: any

    private _intervalDurationInMs = 1000

    constructor () {
        this.runInternal = this.runInternal.bind(this)
    }

    private runInternal () {
        this._runnable?.()
        this._runId = setTimeout(
            this.runInternal,
            this._intervalDurationInMs
        )
    }


    start (runnable?: any, intervalDurationInMs = 1000): void {
        if (!(runnable && typeof runnable === 'function')) {
            throw new Error('expecting a function type as \'runnable\' param.')
        }
        this._runnable = runnable
        this._intervalDurationInMs = intervalDurationInMs
        this.runInternal()
    }

    stop (): void {
        if (this._runId) {
            clearTimeout(this._runId)
            this._runId = undefined
        }
    }
}

export {
    CronInterval
}
