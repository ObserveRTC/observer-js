import {
    TimeUtil
} from '../../observer.utils/time.util'

class RTCState {
    public currentState = 'new'
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    public lastUpdate = 0
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    private readonly expiredLimit = 10 * 1000

    constructor () {
        this.updateState = this.updateState.bind(this)
        this.isExpired = this.isExpired.bind(this)
    }
    public updateState (currentState: string): void {
        if (this.currentState !== currentState) {
            this.currentState = currentState
            this.lastUpdate = TimeUtil.getCurrent()
        }
    }

    public isExpired (): boolean {
        if (![
            'closed',
            'failed'
        ].includes(this.currentState)) {
            return false
        }
        // Connection state is either in closed, or failed state now
        const now = TimeUtil.getCurrent()
        return now - this.lastUpdate > this.expiredLimit
    }
}

export {
    RTCState
}
