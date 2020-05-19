
export interface IWobserverPlugin {
    receiveStats(sample: any): void
    execute(pc: RTCPeerConnection): Promise<any>
}
