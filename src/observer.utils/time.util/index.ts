// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class TimeUtil {
    public static getCurrent (): number {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unnecessary-condition
        if (!window.performance) {
            return Date.now()
        }
        return window.performance.now() + performance.timing.navigationStart
    }

    public static getTimeZoneOffsetInMinute (): number {
        const timezoneOffset: number = new Date().getTimezoneOffset()
        return timezoneOffset
    }
}

export {
    TimeUtil
}
