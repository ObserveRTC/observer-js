import { IWobserverPlugin } from '../wobserver.plugins/iwobserver.plugin'
import { IWobserver } from './interface/iwobserver'
import PCManager from './pc.manager'

class Wobserver implements IWobserver {
    private readonly pcManager: PCManager = new PCManager()

    public addPC(pc: RTCPeerConnection): void {
        this.pcManager.add(pc)
    }

    public addPlugin(plugin: IWobserverPlugin): void {
        // pass
    }

}

export default Wobserver
