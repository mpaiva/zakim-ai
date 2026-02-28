import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { setupIrc } from './irc'
import { setupClaude } from './claude'
import { setupSidecar, killSidecar } from './sidecar'
import { setupAudioCapture, stopAudioCapture } from './audiocapture'

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Zakim AI',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  setupIrc(win)
  setupAudioCapture(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  setupSidecar()
  setupClaude()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  stopAudioCapture()
  killSidecar()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
