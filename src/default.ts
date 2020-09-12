import ObserverManager from './observer.manager'
import StatsParser from './observer.plugins/public/stats.parser.plugin'
import StatsSender from './observer.plugins/public/websocket.sender.plugin'

export default { init: ObserverManager, StatsParser , StatsSender}
