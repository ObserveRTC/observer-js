import { v4 as uuidv4 } from 'uuid'
import WobserverPC from '../wobserver.core/pc.manager/wobserver.pc'

export abstract class WobserverPlugin {
    public readonly id: string = uuidv4()
    public abstract async execute(pc: WobserverPC): Promise<any>
}
