class TimeUtil {
    public static getCurrent(): number {
        if (!window || !window.performance || !window.performance.now) {
            return Date.now()
        }
        if (!window.performance.timing.navigationStart) {
            return Date.now()
        }
        return window.performance.now() + window.performance.timing.navigationStart
    }

    public static getTimeZoneOffsetInMinute(): number {
        const currentTime: number = (new Date()).getTimezoneOffset()
        return currentTime
    }
}

export default TimeUtil
