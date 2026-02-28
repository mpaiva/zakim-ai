import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { WhisperWordChunk } from '../shared/types'
import type { DiarizeSegment } from './sidecar'

export interface SpeakerLine {
  speaker: string
  text: string
}

/**
 * Write a Float32Array of audio samples as a 16-bit PCM WAV to a temp file.
 * Returns the temp file path.
 */
export async function writeWav(audio: Float32Array, sampleRate: number): Promise<string> {
  const numSamples = audio.length
  const bytesPerSample = 2
  const dataSize = numSamples * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // chunk size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28) // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample

  // data chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  // Convert float32 [-1,1] → int16
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]))
    const val = s < 0 ? s * 0x8000 : s * 0x7fff
    buffer.writeInt16LE(Math.round(val), 44 + i * 2)
  }

  const path = join(tmpdir(), `zakim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`)
  await writeFile(path, buffer)
  return path
}

/**
 * Assign each Whisper word chunk to a speaker by midpoint overlap,
 * then group consecutive same-speaker words into lines.
 */
export function alignSpeakers(
  whisperChunks: WhisperWordChunk[],
  diarizeSegments: DiarizeSegment[],
): SpeakerLine[] {
  if (whisperChunks.length === 0) return []
  if (diarizeSegments.length === 0) {
    // No diarization data — return all text as UNKNOWN
    return [{ speaker: 'UNKNOWN', text: whisperChunks.map((c) => c.text).join(' ').trim() }]
  }

  const assigned: { speaker: string; text: string }[] = []

  for (const chunk of whisperChunks) {
    const [start, end] = chunk.timestamp
    const mid = (start + end) / 2

    let speaker = 'UNKNOWN'
    for (const seg of diarizeSegments) {
      if (seg.start <= mid && mid <= seg.end) {
        speaker = seg.speaker
        break
      }
    }

    assigned.push({ speaker, text: chunk.text })
  }

  // Group consecutive same-speaker words
  const lines: SpeakerLine[] = []
  for (const word of assigned) {
    const last = lines[lines.length - 1]
    if (last && last.speaker === word.speaker) {
      last.text += ' ' + word.text.trim()
    } else {
      lines.push({ speaker: word.speaker, text: word.text.trim() })
    }
  }

  // Clean up whitespace
  for (const line of lines) {
    line.text = line.text.replace(/\s+/g, ' ').trim()
  }

  return lines
}

/** Best-effort cleanup of a temp WAV file. */
export async function cleanupWav(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    // ignore
  }
}
