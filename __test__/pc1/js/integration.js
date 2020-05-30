class Integrator {
    constructor(websocketServer = '') {
        this.statsParser = new WebextraApp.StatsParser()
        this.statsSender = new WebextraApp.StatsSender(websocketServer)
        this.init()
    }
    init() {
        this.wobserver = new WebextraApp.init()
    }

    startCollection() {
        this.wobserver.attachPlugin(this.statsParser)
        this.wobserver.attachPlugin(this.statsSender)
        this.wobserver.addPC(pc1)
        this.wobserver.addPC(pc2)
        this.wobserver.startWorker()
    }

    stopCollection() {
        this.wobserver.dispose()
    }
}

let integrator = new Integrator('hello world');

