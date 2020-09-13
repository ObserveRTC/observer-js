import { ObserverPlugin } from '../../observer.plugins/base.plugin'
import Observer from '../index'

class ObserverBuilder {
    private readonly instance: Observer = new Observer()
    attachPlugin(plugin: ObserverPlugin): ObserverBuilder {
        this.instance.attachPlugin(plugin)
        return this
    }

    build(): Observer {
        return this.instance
    }
}
// not using currently
export default ObserverBuilder
