import { v4 as uuidv4 } from 'uuid'
import { IWobPeerConnection } from '../dto/wob.peer.connection'
class PCManager {
    private readonly pcList!: IWobPeerConnection[]

    public add(pc: RTCPeerConnection) {
        const curPC = {
            id: uuidv4(),
            pc
        } as IWobPeerConnection
        this.pcList.push(curPC)
    }
}

export default PCManager
