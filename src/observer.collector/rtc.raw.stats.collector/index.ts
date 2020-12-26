// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class RawStatsCollector {
    public static async getRawStats (senderOrReceiver: RTCRtpSender[] | RTCRtpReceiver[] | undefined): Promise<any> {
        if (!senderOrReceiver) {
            return []
        }
        const statsList = []
        for (const currentStats of senderOrReceiver) {
            // eslint-disable-next-line no-await-in-loop
            const stats = await currentStats.getStats()
            for (const value of stats.values()) {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (value) {
                    statsList.push(value)
                }
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return statsList
    }

    public static getReceiver (pc?: RTCPeerConnection): RTCRtpReceiver[] | undefined {
        return pc?.getReceivers()
    }

    public static getSender (pc?: RTCPeerConnection): RTCRtpSender[] | undefined {
        return pc?.getSenders()
    }
}

export {
    RawStatsCollector
}
