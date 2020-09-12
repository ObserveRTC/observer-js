import TimeUtil from '../../observer.utils/time.util'

class PCState {
    public lastUpdate: number = 0
    public currentState : string = 'new'

    public updateState(currentState: string) {
        if (this.currentState !== currentState ) {
            this.currentState = currentState
            this.lastUpdate = TimeUtil.getCurrent()
        }
    }
}

export default PCState
