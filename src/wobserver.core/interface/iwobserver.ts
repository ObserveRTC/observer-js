import { IWobserverPlugin } from '../../wobserver.plugins/iwobserver.plugin'

export interface IWobserver{
    addPC(pc: RTCPeerConnection): void
    addPlugin(plugin: IWobserverPlugin): void
}
