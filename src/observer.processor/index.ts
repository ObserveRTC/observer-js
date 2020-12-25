import { logger } from '../observer.logger'

// @ts-ignore
console.warn('$ObserverRTC version[processor]', __buildVersion__, 'from build date', __buildDate__)

const helloWorld = (name: string) => console.warn('hello world', name)
onmessage = (event: MessageEvent ) => {
  logger.warn('gotcha', event)
  helloWorld('pallab')
}

export {helloWorld}
