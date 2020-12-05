class Integrator {
    constructor(websocketServer = '') {
        this.statsParser = new ObserverRTC.StatsParser()
        this.statsSender = new ObserverRTC.StatsSender(websocketServer)
        this.init()
    }
    init(poolingInterval = 1000) {
        this.wobserver = new ObserverRTC.Builder(poolingInterval)
            .attachPlugin(this.statsParser)
            .attachPlugin(this.statsSender)
            .build()
    }

    startCollection() {
        this.wobserver.addPC(pc1)
        this.wobserver.addPC(pc2)
    }

    stopCollection() {
        this.wobserver.disposePC()
    }
}

//const wsServerURL = 'wss://webrtc-bserver.org/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/v20200114/json'
const wsServerURL = 'wss://webrtc-observer.org/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/v20200114/json'
window.integrator = new Integrator(wsServerURL);
