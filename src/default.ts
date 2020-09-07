import ObserverManager from './observer.manager'
import StatsParser from './observer.plugins/stats.parser.plugin'
import StatsSender from './observer.plugins/websocket.sender.plugin'

export default { init: ObserverManager, StatsParser , StatsSender}
