import { ObserverPlugin } from '../../observer.plugins/base.plugin'
import ObserverManager from '../index'

class ObserverManagerBuilder {
    private readonly instance: ObserverManager = new ObserverManager()
    attachPlugin(plugin: ObserverPlugin): ObserverManager {
        this.instance.attachPlugin(plugin)
        return this.instance
    }

    build(): ObserverManager {
        return this.instance
    }
}
// not using currently
export default ObserverManagerBuilder
