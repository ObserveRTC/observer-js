import { Observer } from "../observer";
import { ObserverPC, PCDetails } from "../observer.peer";

interface ObserverStats {
  stats: any;
  details: PCDetails;
}

class RTCCollector {
  constructor(private readonly observer: Observer) {
    this.collect = this.collect.bind(this);
  }

  public async collect(): Promise<ObserverStats[]> {
    const statsList = await Promise.all(
      this.observer.rtcList.map(async observerPc => this.collectStats(observerPc))
    );
    return statsList;
  }

  private async collectStats(observerPc: ObserverPC): Promise<ObserverStats> {
    const stats = await observerPc.getStats();
    const pcDetails = observerPc.pcDetails;
    return {
      details: pcDetails,
      stats,
    } as ObserverStats;
  }
}

export { RTCCollector };
