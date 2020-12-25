import { logger } from '../../observer.logger'
import { ObserverWorkerBridge, WorkerCallback } from '../../observer.worker'
import { ObserverPC, UserConfig } from '../observer.peer'
import { RTCCollector } from '../rtc.collector'

class Observer implements WorkerCallback {
  private _rtcList: ObserverPC[] = []
  private _collector = new RTCCollector(this)
  // @ts-ignore
  private _observerWorkerBridge = new ObserverWorkerBridge(__workerUrl__, this)

  constructor() {
    this.addPC = this.addPC.bind(this)
    this.removePC = this.removePC.bind(this)
    this.collectState = this.collectState.bind(this)
    // @ts-ignore
    console.warn('$ObserverRTC version[collector]', __buildVersion__, 'from build date', __buildDate__)
  }

  onMessage(_msg: any): void {
    throw new Error('Method not implemented.')
  }

  onError(_err: any): void {
    throw new Error('Method not implemented.')
  }

  public addPC(pc: RTCPeerConnection, callId?: string, userId?: string): void {
    const userConfig = {
      callId,
      pc,
      userId,
    } as UserConfig
    logger.warn('adding pc', userConfig)
    this._rtcList.push(new ObserverPC(userConfig))
  }

  public removePC(pc: ObserverPC): void {
    this._rtcList = this._rtcList.filter((value) => value.id !== pc.id)
  }

  public async collectState(): Promise<any> {
    return this._collector.collect()
  }

  get rtcList(): ObserverPC[] {
    return this._rtcList
  }

  public dispose(): void {
    this._rtcList = []
  }
}

export { Observer }
