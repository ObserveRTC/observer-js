import { v4 as uuidv4 } from 'uuid'

export abstract class WobserverPlugin {
    public readonly id: string = uuidv4()
    public abstract async receiveStats(sample: any): Promise<any>
    public abstract async execute(pc: RTCPeerConnection): Promise<any>
}
