import { ipcMain, type BrowserWindow } from 'electron'
import { Client as IrcClient } from 'irc-framework'
import { IPC, type IrcConnectionOptions, type IrcMessage } from '../shared/types'

let client: IrcClient | null = null
let mainWindow: BrowserWindow | null = null
let currentChannel: string | null = null

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  mainWindow?.webContents.send(channel, ...args)
}

function emitMessage(msg: Omit<IrcMessage, 'id' | 'timestamp'>) {
  const full: IrcMessage = { id: makeId(), timestamp: Date.now(), ...msg }
  sendToRenderer(IPC.IRC_ON_MESSAGE, full)
}

export function setupIrc(win: BrowserWindow) {
  mainWindow = win

  ipcMain.handle(IPC.IRC_CONNECT, async (_event, opts: IrcConnectionOptions) => {
    if (client) {
      client.quit('Reconnecting...')
      client = null
    }

    client = new IrcClient()

    client.connect({
      host: opts.host,
      port: opts.port,
      nick: opts.nick,
      tls: opts.tls,
    })

    sendToRenderer(IPC.IRC_ON_STATUS, 'connecting')

    client.on('registered', () => {
      sendToRenderer(IPC.IRC_ON_STATUS, 'connected')
      emitMessage({
        nick: '*',
        channel: '',
        text: `Connected to ${opts.host} as ${opts.nick}`,
        type: 'system',
      })
    })

    client.on('close', () => {
      sendToRenderer(IPC.IRC_ON_STATUS, 'disconnected')
      emitMessage({ nick: '*', channel: '', text: 'Disconnected', type: 'system' })
    })

    client.on('socket close', () => {
      sendToRenderer(IPC.IRC_ON_STATUS, 'disconnected')
    })

    client.on('message', (event: { nick: string; target: string; message: string; type: string }) => {
      emitMessage({
        nick: event.nick,
        channel: event.target,
        text: event.message,
        type: event.type === 'action' ? 'action' : 'message',
      })
    })

    client.on('notice', (event: { nick: string; target: string; message: string }) => {
      emitMessage({
        nick: event.nick || '*',
        channel: event.target,
        text: event.message,
        type: 'notice',
      })
    })

    client.on('join', (event: { nick: string; channel: string }) => {
      emitMessage({
        nick: event.nick,
        channel: event.channel,
        text: `${event.nick} has joined ${event.channel}`,
        type: 'join',
      })
      // Refresh user list after join
      refreshUsers(event.channel)
    })

    client.on('part', (event: { nick: string; channel: string; message?: string }) => {
      emitMessage({
        nick: event.nick,
        channel: event.channel,
        text: `${event.nick} has left ${event.channel}${event.message ? ` (${event.message})` : ''}`,
        type: 'part',
      })
      refreshUsers(event.channel)
    })

    client.on('quit', (event: { nick: string; message?: string }) => {
      emitMessage({
        nick: event.nick,
        channel: currentChannel || '',
        text: `${event.nick} has quit${event.message ? ` (${event.message})` : ''}`,
        type: 'quit',
      })
      if (currentChannel) refreshUsers(currentChannel)
    })

    client.on('topic', (event: { channel: string; topic: string }) => {
      sendToRenderer(IPC.IRC_ON_TOPIC, event.topic)
    })

    client.on('error', (event: { error: string; reason?: string }) => {
      sendToRenderer(IPC.IRC_ON_STATUS, 'error')
      emitMessage({
        nick: '*',
        channel: '',
        text: `Error: ${event.reason || event.error}`,
        type: 'system',
      })
    })
  })

  ipcMain.handle(IPC.IRC_DISCONNECT, async () => {
    if (client) {
      client.quit('Goodbye')
      client = null
      currentChannel = null
    }
  })

  ipcMain.handle(IPC.IRC_JOIN, async (_event, channel: string) => {
    if (!client) throw new Error('Not connected')
    client.join(channel)
    currentChannel = channel
  })

  ipcMain.handle(IPC.IRC_PART, async (_event, channel: string) => {
    if (!client) throw new Error('Not connected')
    client.part(channel)
    if (currentChannel === channel) currentChannel = null
  })

  ipcMain.handle(IPC.IRC_SEND, async (_event, channel: string, text: string) => {
    if (!client) throw new Error('Not connected')
    client.say(channel, text)
    emitMessage({
      nick: client.user.nick,
      channel,
      text,
      type: 'message',
    })
  })
}

function refreshUsers(channel: string) {
  if (!client) return
  const ch = client.channel(channel)
  // irc-framework uses 'users' event after WHO
  ch.updateUsers(() => {
    const users = Array.from(ch.users).map((u: any) => ({
      nick: u.nick as string,
      modes: (u.modes || []) as string[],
    }))
    sendToRenderer(IPC.IRC_ON_USERS, users)
  })
}
