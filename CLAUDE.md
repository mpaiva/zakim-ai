# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Zakim AI is an Electron desktop app for W3C-style meeting scribing. It combines:
- **Live audio capture** via macOS Core Audio Taps (`audiotee` native module)
- **Speech-to-text** via Whisper running in a Web Worker (`@huggingface/transformers`)
- **Speaker diarization** via a Python sidecar process (`pyannote.audio`)
- **AI summarization** via the Anthropic SDK (Claude)
- **IRC integration** via `irc-framework` for posting scribe notes to IRC channels

## Commands

```bash
npm run dev        # Start Electron + Vite dev server with HMR
npm run build      # Build all three processes (main, preload, renderer)
npm run typecheck  # Type-check without emitting (tsc --noEmit)
npm run dist       # Build + package with electron-builder
```

No test framework is configured yet.

## Architecture

The app uses Electron's three-process model:

### Main process (`src/main/`)
- `index.ts` — app lifecycle, creates `BrowserWindow`, wires up all subsystems
- `irc.ts` — IRC client (`irc-framework`); handles connect/join/send/receive via IPC
- `audiocapture.ts` — Core Audio Tap capture via `audiotee`; accumulates 16-bit PCM, flushes to renderer as `Float32Array` on a timer
- `claude.ts` — Anthropic SDK integration; handles three IPC routes: `SCRIBE_PROCESS` (text→Claude), `SCRIBE_PROCESS_AUDIO` (audio+whisper→diarize→Claude), `SCRIBE_PROCESS_SPEAKERS` (pre-attributed segments→Claude). Maintains a rolling 2000-char context window. API key and HF token are encrypted in-memory with `safeStorage`.
- `sidecar.ts` — spawns `diarize.py` as a child process; communicates over newline-delimited JSON on stdin/stdout; 60s request timeout
- `wavutil.ts` — writes temp WAV files for diarization; aligns Whisper word timestamps with diarization segments

### Preload (`src/preload/index.ts`)
Single file that exposes `window.api` via `contextBridge`. The API surface has four namespaces: `irc`, `scribe`, `audio`, `settings`. IPC channel names are centralized in `src/shared/types.ts` as the `IPC` const object.

### Renderer (`src/renderer/`)
React 19 + Zustand 5 + Tailwind 4. Three Zustand stores:
- `ircStore` — connection status, messages, users, channel, topic, nick
- `audioStore` — capture status, Whisper model/status/progress, transcription results (with per-segment speaker assignment), sticky-speaker mode
- `scribeStore` — scribe messages (pending→approved→sent/discarded), mode (review/auto), speaker queue, processing flag

The `useAutoScribe` hook (mounted at `App` root) handles auto-mode logic: self-assigns as scriber via IRC, monitors q+/q- messages to manage the speaker queue, and auto-approves/sends pending scribe messages with staggered 500ms delays.

Whisper runs in `src/renderer/workers/whisper.worker.ts` — a dedicated Web Worker that loads the model once and handles `load`/`transcribe` messages.

### Shared types (`src/shared/types.ts`)
All TypeScript interfaces and the `IPC` channel name constants live here. Both main and renderer import from this file.

## Key data flow

1. `audiotee` → main process → IPC `AUDIO_SYSTEM_DATA` → renderer `audioStore`
2. Renderer batches audio samples → posts to `whisper.worker` → gets `WhisperTimestampedResult`
3. Renderer calls `window.api.scribe.processAudio(audio, whisperResult)` → main process diarizes (if sidecar alive) → calls Claude → returns `ScribeMessage[]`
4. User approves/edits scribe messages → `window.api.irc.send()` → IRC channel

## Diarization sidecar

The Python sidecar (`src/main/diarize.py`) must exist for speaker diarization to work. In dev it is loaded from `src/main/diarize.py`; in production from `resources/diarize.py`. The sidecar requires `pyannote.audio` and a Hugging Face token. If the sidecar is unavailable, Claude falls back to single-speaker mode automatically.

## IPC pattern

All renderer→main calls use `ipcRenderer.invoke` (request/response). All main→renderer pushes use `webContents.send`. Preload listeners return unsubscribe functions for use in `useEffect` cleanup.

## Scribe modes

- **review** — scribe messages appear in the sidebar; user manually approves/edits/discards before they are sent to IRC
- **auto** — messages are auto-approved and sent after `autoSendDelay` seconds; the bot also responds to IRC `q+`/`q-` commands to manage a speaker queue
