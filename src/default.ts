import Wobserver from './wobserver.core'
import StatsParser from './wobserver.plugins/stats.parser'
import StatsSender from './wobserver.plugins/stats.sender'

export default { init: Wobserver, StatsParser , StatsSender}
