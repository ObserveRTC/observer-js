import { v4 as uuidv4 } from 'uuid'
import IntervalWorker from '../interval.worker/index'
import { IWobserverPeerConnectionDto } from './interface'

class PCManager {
    private readonly intervalWorker: IntervalWorker = new IntervalWorker()
    private readonly pcList!: IWobserverPeerConnectionDto[]

    public add(pc: RTCPeerConnection) {
        const curPC = {
            id: uuidv4(),
            pc
        } as IWobserverPeerConnectionDto
        this.pcList.push(curPC)

    }

    private observer() {
        console.warn('I am a observer', new Date())
    }
}

export default PCManager
