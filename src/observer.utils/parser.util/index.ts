class ParserUtil {
    public static parseWsServerUrl(serverURL: string,
                                   serviceUUID: string,
                                   mediaUnitId: string,
                                   statsVersion: string,
    ): string {
        if (!serverURL) {
            throw Error('server url is undefined')
        }
        if (!serviceUUID) {
            throw Error('service UUID is undefined')
        }
        if (!mediaUnitId) {
            throw Error('media unit id is undefined')
        }
        if (!statsVersion) {
            throw Error('stats version is undefined')
        }

        serverURL = `${serverURL.replace(/\/$/, '')}`
        serviceUUID = `${serviceUUID.replace(/^\//, '')}`
        mediaUnitId = `${mediaUnitId.replace(/^\//, '')}`
        statsVersion = `${statsVersion.replace(/^\//, '')}`
        return `${serverURL}/${serviceUUID}/${mediaUnitId}/${statsVersion}/json`
    }
}

export default ParserUtil
