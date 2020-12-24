import { logger } from '../../observer.logger'
import { ObserverPC, UserConfig } from '../observer.peer'
import { RTCCollector } from '../rtc.collector'

class Observer {
  private _rtcList: ObserverPC[] = []
  private _collector = new RTCCollector(this)

  constructor() {
    this.addPC = this.addPC.bind(this)
    this.removePC = this.removePC.bind(this)
    this.collectState = this.collectState.bind(this)
    // @ts-ignore
    console.warn('$ObserverRTC version', LIBRARY_VERSION)
  }

  public addPC(pc: RTCPeerConnection, callId?: string, userId?: string) {
    const userConfig = {
      callId,
      pc,
      userId,
    } as UserConfig
    logger.warn('adding pc', userConfig)
    this._rtcList.push(new ObserverPC(userConfig))
  }

  public removePC(pc: ObserverPC) {
    this._rtcList = this._rtcList.filter((value) => value.id !== pc.id)
  }

  public async collectState(): Promise<any> {
    return this._collector.collect()
  }

  get rtcList(): ObserverPC[] {
    return this._rtcList
  }

  public dispose() {
    this._rtcList = []
  }
}

export { Observer }
