class StatsParser {

    public static async getRawStats(senderOrReceiver: RTCRtpSender[] | RTCRtpReceiver[] | undefined): Promise<any> {
        if (!senderOrReceiver)return []
        const statsList = []
        for (const currentStats of senderOrReceiver) {
            const stats: any = await currentStats.getStats()
            for (const value of stats?.values()) {
                if (value)
                    statsList.push(value)
            }
        }
        return statsList
    }

    public static getReceiver(pc?: RTCPeerConnection): RTCRtpReceiver[] | undefined {
        return pc?.getReceivers()
    }

    public static getSender(pc?: RTCPeerConnection): RTCRtpSender[] | undefined {
        return pc?.getSenders()
    }

}

export { StatsParser }
