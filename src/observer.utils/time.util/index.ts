// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class TimeUtil {
    public static getCurrent (): number {
        return Date.now()
    }

    public static getTimeZoneOffsetInMinute (): number {
        const timezoneOffset: number = new Date().getTimezoneOffset()
        return timezoneOffset
    }
}

export {
    TimeUtil
}
