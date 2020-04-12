import { IWobserver } from './interface/iwobserver'
import { IWobserverPlugin } from '../wobserver.plugins/iwobserver.plugin'

class Wobserver implements IWobserver{
    public addPC(pc: RTCPeerConnection): void {
        // pass
    }

    public addPlugin(plugin: IWobserverPlugin): void {
        // pass
    }

}

export default Wobserver
