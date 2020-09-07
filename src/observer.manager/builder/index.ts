import { ObserverPlugin } from '../../observer.plugins/base.plugin'
import ObserverManager from '../index'

class ObserverManagerBuilder {
    private readonly instance: ObserverManager = new ObserverManager()
    public attachPlugin(plugin: ObserverPlugin): ObserverManager {
        this.instance.attachPlugin(plugin)
        return this.instance
    }

    public build(): ObserverManager {
        return this.instance
    }
}

export default ObserverManagerBuilder
