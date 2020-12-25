import { logger } from '../observer.logger'

const helloWorld = (name: string) => console.warn('hello world', name)
onmessage = (event: MessageEvent ) => {
  logger.warn('gotcha', event)
  helloWorld('pallab')
}

export {helloWorld}
