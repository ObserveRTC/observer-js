import ObserverBuilder from './observer.manager/builder'
import StatsParser from './observer.plugins/public/stats.parser.plugin'
import StatsSender from './observer.plugins/public/websocket.sender.plugin'

export default { Builder: ObserverBuilder, StatsParser , StatsSender}
