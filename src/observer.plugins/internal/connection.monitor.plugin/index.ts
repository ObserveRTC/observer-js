import logger from '../../../observer.logger'
import ObserverPC from '../../../observer.pc'
import PCState from '../../../observer.pc/pc.state'
import TimeUtil from '../../../observer.utils/time.util'
import { ObserverPlugin } from '../../base.plugin'

// an internal plugin that monitor the pc connection and stop collecting stats if they are closed
class ConnectionMonitor extends ObserverPlugin {
    private readonly expiredLimit = 10 * 1000 // 10 second
    public isExpired(pcState: PCState): boolean {
        if (!(pcState?.currentState in ['closed', 'failed'])) {
            return false
        }
        // connection state is either in closed, or failed state now
        const now = TimeUtil.getCurrent()
        return now - pcState?.lastUpdate > this.expiredLimit
    }

    async execute(observerPC: ObserverPC): Promise<any> {
        const currentState = observerPC?.getPeerConnection()?.connectionState
        observerPC?.pcState?.updateState(currentState)
        if (this.isExpired(observerPC?.pcState)) {
            logger.warn('peer connection closed. disposing stats collection related resouces', observerPC?.id)
            observerPC?.dispose()
        }
    }
}
export default ConnectionMonitor
