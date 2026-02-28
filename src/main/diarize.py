#!/usr/bin/env python3
"""
Pyannote speaker diarization sidecar.

Long-running process: reads newline-delimited JSON from stdin, writes JSON to stdout.
Commands:
  {"cmd": "ping"}                              → {"ok": true, "pong": true}
  {"cmd": "init", "hf_token": "hf_..."}       → {"ok": true}
  {"cmd": "diarize", "wav_path": "/tmp/x.wav"} → {"ok": true, "segments": [...]}
"""

import json
import sys
import traceback

pipeline = None


def respond(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def handle_ping(_req):
    return {"ok": True, "pong": True}


def handle_init(req):
    global pipeline
    hf_token = req.get("hf_token")
    if not hf_token:
        return {"ok": False, "error": "hf_token is required"}

    try:
        from pyannote.audio import Pipeline

        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )
        return {"ok": True}
    except Exception as e:
        pipeline = None
        return {"ok": False, "error": str(e)}


def handle_diarize(req):
    global pipeline
    if pipeline is None:
        return {"ok": False, "error": "Pipeline not initialized — call init first"}

    wav_path = req.get("wav_path")
    if not wav_path:
        return {"ok": False, "error": "wav_path is required"}

    try:
        diarization = pipeline(wav_path)
        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append(
                {
                    "start": round(turn.start, 3),
                    "end": round(turn.end, 3),
                    "speaker": speaker,
                }
            )
        return {"ok": True, "segments": segments}
    except Exception as e:
        return {"ok": False, "error": str(e)}


HANDLERS = {
    "ping": handle_ping,
    "init": handle_init,
    "diarize": handle_diarize,
}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            respond({"ok": False, "error": f"Invalid JSON: {e}"})
            continue

        cmd = req.get("cmd")
        handler = HANDLERS.get(cmd)
        if not handler:
            respond({"ok": False, "error": f"Unknown command: {cmd}"})
            continue

        try:
            result = handler(req)
            respond(result)
        except Exception:
            respond({"ok": False, "error": traceback.format_exc()})


if __name__ == "__main__":
    main()
