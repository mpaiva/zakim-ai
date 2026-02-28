declare module 'irc-framework' {
  export class Client {
    connect(opts: {
      host: string
      port: number
      nick: string
      tls: boolean
    }): void
    quit(message?: string): void
    join(channel: string): void
    part(channel: string, message?: string): void
    say(target: string, message: string): void
    channel(name: string): Channel
    on(event: string, listener: (...args: any[]) => void): this
    user: { nick: string }
  }

  export interface Channel {
    users: any[]
    updateUsers(callback: () => void): void
  }

  const IrcFramework: {
    Client: new () => Client
  }

  export default IrcFramework
}
