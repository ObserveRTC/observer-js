// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class ParserUtil {
    public static parseWsServerUrl (
        serverURL: string,
        serviceUUID: string,
        mediaUnitId: string,
        statsVersion: string
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

        // eslint-disable-next-line no-param-reassign
        serverURL = `${serverURL.replace(
            // eslint-disable-next-line require-unicode-regexp
            /\/$/,
            ''
        )}`
        // eslint-disable-next-line no-param-reassign
        serviceUUID = `${serviceUUID.replace(
            // eslint-disable-next-line require-unicode-regexp
            /^\//,
            ''
        )}`
        // eslint-disable-next-line no-param-reassign
        mediaUnitId = `${mediaUnitId.replace(
            // eslint-disable-next-line require-unicode-regexp
            /^\//,
            ''
        )}`
        // eslint-disable-next-line no-param-reassign
        statsVersion = `${statsVersion.replace(
            // eslint-disable-next-line require-unicode-regexp
            /^\//,
            ''
        )}`
        return `${serverURL}/${serviceUUID}/${mediaUnitId}/${statsVersion}/json`
    }
}

export {
    ParserUtil
}
