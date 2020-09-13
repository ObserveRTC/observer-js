class ParserUtil {
    public static parseWsServerUrl(serverURL: string, serverUUID: string): string {
        if (!serverURL)return ''
        if (!serverUUID)return ''

        serverURL = `${serverURL.replace(/\/$/, '')}`
        serverUUID = `${serverUUID.replace(/^\//, '')}`
        return `${serverURL}/${serverUUID}`
    }
}

export default ParserUtil
