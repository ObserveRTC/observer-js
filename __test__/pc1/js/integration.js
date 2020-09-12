class Integrator {
    constructor(websocketServer = '') {
        this.statsParser = new ObserverRTC.StatsParser()
        this.statsSender = new ObserverRTC.StatsSender(websocketServer)
        this.init()
    }
    init() {
        this.wobserver = new ObserverRTC.init()
        this.wobserver.attachPlugin(this.statsParser)
        this.wobserver.attachPlugin(this.statsSender)
    }

    startCollection() {
        this.wobserver.addPC(pc1)
        this.wobserver.addPC(pc2)
    }

    stopCollection() {
        this.wobserver.disposePC()
    }
}

const wsServerURL = 'wss://observer.rtc.help:7880/ws/86ed98c6-b001-48bb-b31e-da638b979c72'
let integrator = new Integrator(wsServerURL);

