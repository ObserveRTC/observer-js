import WobserverPC from '../../wobserver.core/pc.manager/wobserver.pc'
import { WobserverPlugin } from '../index'

class StatsSender extends WobserverPlugin{
    async execute(pc: WobserverPC): Promise<any> {
        const stats = pc.getStatsQueue().pool()
        console.warn('->', stats)
        return Promise.resolve(undefined)
    }
}

export default StatsSender
