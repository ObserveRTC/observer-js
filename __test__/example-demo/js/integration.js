class Integrator {
    constructor(websocketServer = '') {
        this.statsParser = new ObserverRTC.StatsParser()
        this.statsSender = new ObserverRTC.StatsSender(websocketServer)
        this.init()
    }
    init() {
        this.wobserver = new ObserverRTC.Builder()
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

const wsServerURL = 'ws://localhost:8088/86ed98c6-b001-48bb-b31e-da638b979c72/testMediaUnitId/v20200114/json'
window.integrator = new Integrator(wsServerURL);
