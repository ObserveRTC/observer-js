import { v4 as uuidv4 } from 'uuid'
import ObserverPC from '../../observer.pc'

export abstract class ObserverPluginBase {
    public readonly id: string = uuidv4()
    public abstract async execute(pc: ObserverPC): Promise<any>
}
