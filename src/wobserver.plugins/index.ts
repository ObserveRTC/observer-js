
export abstract class WobserverPlugin {
    public abstract async receiveStats(sample: any): Promise<any>
    public abstract async execute(pc: RTCPeerConnection): Promise<any>
}
