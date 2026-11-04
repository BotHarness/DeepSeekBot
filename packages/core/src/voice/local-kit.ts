import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const LOCAL_VOICE_PORT = 8790;
export const LOCAL_VOICE_BASE_URL = `http://127.0.0.1:${LOCAL_VOICE_PORT}/v1`;
export const LOCAL_VOICE_SCRIPT_NAME = 'botharness_voice.py';
export const LOCAL_VOICE_PACKAGES = '"sherpa-onnx>=1.13.8,<2" numpy';

export class LocalVoiceKitError extends Error {
  constructor(
    readonly code: 'invalid-input' | 'write-failed',
    message: string,
  ) {
    super(message);
    this.name = 'LocalVoiceKitError';
  }
}

export interface LocalVoiceKit {
  dir: string;
  script: string;
  baseUrl: string;
  models: { asr: string; tts: string };
  steps: { macos: string[]; windows: string[] };
}

export function writeLocalVoiceKit(dir: string): LocalVoiceKit {
  if (typeof dir !== 'string' || !isAbsolute(dir) || /[\u0000-\u001f]/u.test(dir))
    throw new LocalVoiceKitError('invalid-input', 'Give an absolute folder with --dir.');
  const script = join(dir, LOCAL_VOICE_SCRIPT_NAME);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(script, LOCAL_VOICE_SCRIPT, { encoding: 'utf8' });
    if (process.platform !== 'win32') chmodSync(script, 0o755);
  } catch {
    throw new LocalVoiceKitError('write-failed', `Cannot write ${script}.`);
  }
  return {
    dir,
    script,
    baseUrl: LOCAL_VOICE_BASE_URL,
    models: {
      asr: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09',
      tts: 'kokoro-multi-lang-v1_1',
    },
    steps: {
      macos: [
        `cd ${JSON.stringify(dir)}`,
        'python3 -m venv .venv',
        `.venv/bin/python -m pip install ${LOCAL_VOICE_PACKAGES}`,
        `.venv/bin/python ${LOCAL_VOICE_SCRIPT_NAME} download`,
        `.venv/bin/python ${LOCAL_VOICE_SCRIPT_NAME} start`,
        `.venv/bin/python ${LOCAL_VOICE_SCRIPT_NAME} selftest`,
      ],
      windows: [
        `cd ${JSON.stringify(dir)}`,
        'py -3 -m venv .venv',
        `.venv\\Scripts\\python -m pip install ${LOCAL_VOICE_PACKAGES}`,
        `.venv\\Scripts\\python ${LOCAL_VOICE_SCRIPT_NAME} download`,
        `.venv\\Scripts\\python ${LOCAL_VOICE_SCRIPT_NAME} start`,
        `.venv\\Scripts\\python ${LOCAL_VOICE_SCRIPT_NAME} selftest`,
      ],
    },
  };
}

export const LOCAL_VOICE_SCRIPT = String.raw`#!/usr/bin/env python3
"""BotHarness local speech service.

A small OpenAI-compatible speech server for one computer. It runs SenseVoice
(speech to text) and Kokoro (text to speech) on the CPU through sherpa-onnx,
and serves:

  GET  /health
  GET  /v1/models
  POST /v1/audio/speech          {"input", "voice", "speed"} -> audio/wav
  POST /v1/audio/transcriptions  multipart "file" (+ "language") -> {"text"}

The Host never starts or keeps this service alive. Commands:

  python botharness_voice.py download [--asr] [--tts]
  python botharness_voice.py start      # background; writes service.pid
  python botharness_voice.py status
  python botharness_voice.py stop
  python botharness_voice.py serve      # foreground; Ctrl+C stops it
  python botharness_voice.py selftest   # speak a phrase, then transcribe it

Needs Python 3.9+ and 'pip install "sherpa-onnx>=1.13.8,<2" numpy'.
(sherpa-onnx 2 drops the espeak fallback, so Kokoro skips English words it
does not know.)
Everything lives in the folder of this file unless --home says otherwise.
"""

from __future__ import annotations

import argparse
import email.parser
import email.policy
import io
import json
import os
import shutil
import signal
import subprocess
import sys
import tarfile
import threading
import time
import urllib.error
import urllib.request
import uuid
import wave
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1"
DEFAULT_PORT = 8790
RELEASES = "https://github.com/k2-fsa/sherpa-onnx/releases/download"
ASR_MODEL = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09"
TTS_MODEL = "kokoro-multi-lang-v1_1"
MODELS = {
    "asr": (ASR_MODEL, f"{RELEASES}/asr-models/{ASR_MODEL}.tar.bz2"),
    "tts": (TTS_MODEL, f"{RELEASES}/tts-models/{TTS_MODEL}.tar.bz2"),
}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_INPUT_CHARS = 4000
ASR_LANGUAGES = {"auto", "zh", "en", "ja", "ko", "yue"}

# Kokoro v1.1-zh speaker ids, in the order of voices.bin.
KOKORO_VOICES = (
    "af_maple af_sol bf_vale zf_001 zf_002 zf_003 zf_004 zf_005 zf_006 zf_007 "
    "zf_008 zf_017 zf_018 zf_019 zf_021 zf_022 zf_023 zf_024 zf_026 zf_027 "
    "zf_028 zf_032 zf_036 zf_038 zf_039 zf_040 zf_042 zf_043 zf_044 zf_046 "
    "zf_047 zf_048 zf_049 zf_051 zf_059 zf_060 zf_067 zf_070 zf_071 zf_072 "
    "zf_073 zf_074 zf_075 zf_076 zf_077 zf_078 zf_079 zf_083 zf_084 zf_085 "
    "zf_086 zf_087 zf_088 zf_090 zf_092 zf_093 zf_094 zf_099 zm_009 zm_010 "
    "zm_011 zm_012 zm_013 zm_014 zm_015 zm_016 zm_020 zm_025 zm_029 zm_030 "
    "zm_031 zm_033 zm_034 zm_035 zm_037 zm_041 zm_045 zm_050 zm_052 zm_053 "
    "zm_054 zm_055 zm_056 zm_057 zm_058 zm_061 zm_062 zm_063 zm_064 zm_065 "
    "zm_066 zm_068 zm_069 zm_080 zm_081 zm_082 zm_089 zm_091 zm_095 zm_096 "
    "zm_097 zm_098 zm_100"
).split()
DEFAULT_VOICE = "zf_001"


def log(message: str) -> None:
    print(time.strftime("%H:%M:%S"), message, flush=True)


def fail(code: str, message: str):
    print(json.dumps({"ok": False, "code": code, "message": message}, ensure_ascii=False))
    sys.exit(1)


# --------------------------------------------------------------------------
# Models


def download(home: Path, which: list[str]) -> dict:
    models = home / "models"
    models.mkdir(parents=True, exist_ok=True)
    report = {}
    for kind in which:
        name, url = MODELS[kind]
        target = models / name
        if (target / "tokens.txt").exists():
            report[kind] = {"model": name, "cached": True, "bytes": folder_bytes(target)}
            continue
        archive = models / f"{name}.tar.bz2.part"
        started = time.monotonic()
        have = archive.stat().st_size if archive.exists() else 0
        log(f"downloading {url}" + (f" from {have >> 20} MB" if have else ""))
        request = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                resumed = have > 0 and response.status == 206
                done = have if resumed else 0
                total = done + int(response.headers.get("Content-Length") or 0)
                last = 0.0
                with open(archive, "ab" if resumed else "wb") as out:
                    while True:
                        chunk = response.read(1 << 20)
                        if not chunk:
                            break
                        out.write(chunk)
                        done += len(chunk)
                        if time.monotonic() - last > 5:
                            last = time.monotonic()
                            share = f" {done * 100 // total}%" if total else ""
                            log(f"  {name}: {done >> 20} MB{share}")
        except urllib.error.HTTPError as error:
            if error.code != 416 or not have:
                fail("download-failed", f"Cannot download {name}: {error}; run download again")
            done = have
        except (urllib.error.URLError, OSError) as error:
            fail("download-failed", f"Cannot download {name}: {error}; run download again to resume")
        downloaded = time.monotonic() - started
        log(f"unpacking {name}")
        try:
            with tarfile.open(archive, "r:bz2") as tar:
                safe_extract(tar, models)
        except (tarfile.TarError, EOFError, OSError) as error:
            archive.unlink(missing_ok=True)
            fail("download-failed", f"The {name} archive is damaged ({error}); run download again")
        archive.unlink(missing_ok=True)
        report[kind] = {
            "model": name,
            "cached": False,
            "archiveBytes": done,
            "bytes": folder_bytes(target),
            "downloadSeconds": round(downloaded, 1),
            "totalSeconds": round(time.monotonic() - started, 1),
        }
    return report


def safe_extract(tar: tarfile.TarFile, into: Path) -> None:
    root = into.resolve()
    for member in tar.getmembers():
        path = (into / member.name).resolve()
        if root not in path.parents and path != root:
            fail("bad-archive", f"Archive entry escapes the folder: {member.name}")
        if member.issym() or member.islnk():
            fail("bad-archive", f"Archive entry is a link: {member.name}")
    tar.extractall(into)


def folder_bytes(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def threads(value: int) -> int:
    return value if value > 0 else max(1, min(4, (os.cpu_count() or 2) // 2))


class Engines:
    def __init__(self, home: Path, num_threads: int):
        try:  # imported here so 'download' works before pip install
            import sherpa_onnx
        except ImportError:
            fail("missing-package", 'Run: python -m pip install "sherpa-onnx>=1.13.8,<2" numpy')
        if not getattr(sherpa_onnx, "__version__", "1").startswith("1."):
            fail("wrong-package", 'Kokoro needs sherpa-onnx 1.x: pip install "sherpa-onnx>=1.13.8,<2"')

        self.sherpa = sherpa_onnx
        self.asr = None
        self.tts = None
        self.asr_lock = threading.Lock()
        self.tts_lock = threading.Lock()
        models = home / "models"
        asr_dir = models / ASR_MODEL
        tts_dir = models / TTS_MODEL
        if (asr_dir / "tokens.txt").exists():
            started = time.monotonic()
            self.asr_dir = asr_dir
            self.asr_threads = num_threads
            self.asr = {
                language: None for language in ASR_LANGUAGES
            }  # one recognizer per language hint, built on first use
            self.asr["auto"] = self._recognizer("auto")
            log(f"SenseVoice ready in {time.monotonic() - started:.1f}s")
        if (tts_dir / "tokens.txt").exists():
            started = time.monotonic()
            lexicons = ",".join(
                str(tts_dir / name)
                for name in ("lexicon-us-en.txt", "lexicon-zh.txt")
                if (tts_dir / name).exists()
            )
            fsts = ",".join(
                str(tts_dir / name)
                for name in ("date-zh.fst", "phone-zh.fst", "number-zh.fst")
                if (tts_dir / name).exists()
            )
            kokoro = sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=str(tts_dir / "model.onnx"),
                voices=str(tts_dir / "voices.bin"),
                tokens=str(tts_dir / "tokens.txt"),
                lexicon=lexicons,
                data_dir=str(tts_dir / "espeak-ng-data"),
                dict_dir=str(tts_dir / "dict") if (tts_dir / "dict").exists() else "",
            )
            config = sherpa_onnx.OfflineTtsConfig(
                model=sherpa_onnx.OfflineTtsModelConfig(kokoro=kokoro, num_threads=num_threads),
                rule_fsts=fsts,
                max_num_sentences=1,
            )
            if not config.validate():
                fail("bad-model", f"Kokoro files in {tts_dir} are incomplete; run download again.")
            self.tts = sherpa_onnx.OfflineTts(config)
            log(f"Kokoro ready in {time.monotonic() - started:.1f}s")
        if self.asr is None and self.tts is None:
            fail("no-models", "No models found. Run 'python botharness_voice.py download' first.")

    def _recognizer(self, language: str):
        return self.sherpa.OfflineRecognizer.from_sense_voice(
            model=str(self.asr_dir / "model.int8.onnx"),
            tokens=str(self.asr_dir / "tokens.txt"),
            num_threads=self.asr_threads,
            language="" if language == "auto" else language,
            use_itn=True,
        )

    def transcribe(self, samples, sample_rate: int, language: str) -> str:
        with self.asr_lock:
            if self.asr[language] is None:
                self.asr[language] = self._recognizer(language)
            recognizer = self.asr[language]
            stream = recognizer.create_stream()
            stream.accept_waveform(sample_rate, samples)
            recognizer.decode_stream(stream)
            return stream.result.text.strip()

    def synthesize(self, text: str, voice: str, speed: float):
        sid = speaker_id(voice)
        with self.tts_lock:
            audio = self.tts.generate(text, sid=sid, speed=speed)
        return audio.samples, audio.sample_rate


def speaker_id(voice: str) -> int:
    voice = (voice or DEFAULT_VOICE).strip()
    if voice.isdigit() and int(voice) < len(KOKORO_VOICES):
        return int(voice)
    if voice in KOKORO_VOICES:
        return KOKORO_VOICES.index(voice)
    raise ApiError(
        HTTPStatus.BAD_REQUEST,
        "invalid-voice",
        f"Unknown voice {voice!r}. Use one of {', '.join(KOKORO_VOICES[:6])} ... "
        "(see GET /v1/models) or a number 0-102.",
    )


# --------------------------------------------------------------------------
# Audio


def wav_bytes(samples, sample_rate: int) -> bytes:
    import numpy as np

    pcm = (np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0) * 32767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        out.writeframes(pcm.tobytes())
    return buffer.getvalue()


def decode_audio(data: bytes):
    import numpy as np

    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        try:
            with wave.open(io.BytesIO(data), "rb") as source:
                width = source.getsampwidth()
                channels = source.getnchannels()
                rate = source.getframerate()
                frames = source.readframes(source.getnframes())
        except (wave.Error, EOFError) as error:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-audio", f"Bad WAV file: {error}")
        if width == 2:
            samples = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768
        elif width == 4:
            samples = np.frombuffer(frames, dtype="<i4").astype(np.float32) / 2147483648
        elif width == 1:
            samples = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128) / 128
        else:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-audio", "Unsupported WAV sample size.")
        if channels > 1:
            samples = samples.reshape(-1, channels).mean(axis=1)
        return samples, rate
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise ApiError(
            HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            "unsupported-audio",
            "Only WAV audio is accepted; install ffmpeg to accept mp3, m4a, ogg or webm.",
        )
    result = subprocess.run(
        [ffmpeg, "-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
        input=data,
        capture_output=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-audio", "ffmpeg cannot decode the audio.")
    return np.frombuffer(result.stdout, dtype="<i2").astype(np.float32) / 32768, 16000


def multipart(content_type: str, body: bytes) -> dict:
    message = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
        f"Content-Type: {content_type}\r\n\r\n".encode("latin-1") + body
    )
    if not message.is_multipart():
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-input", "Send multipart/form-data.")
    fields = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name:
            fields[name] = part.get_payload(decode=True) or b""
    return fields


# --------------------------------------------------------------------------
# HTTP


class ApiError(Exception):
    def __init__(self, status: HTTPStatus, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class Handler(BaseHTTPRequestHandler):
    server_version = f"BotHarnessVoice/{VERSION}"
    engines: Engines
    api_key: str | None

    def log_message(self, format, *args):  # noqa: A002
        pass

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, value: dict) -> None:
        self._send(status, json.dumps(value, ensure_ascii=False).encode(), "application/json")

    def _error(self, error: ApiError) -> None:
        self._json(
            error.status,
            {"error": {"message": error.message, "type": error.code, "code": error.code}},
        )

    def _authorize(self) -> None:
        if self.api_key and self.headers.get("Authorization") != f"Bearer {self.api_key}":
            raise ApiError(HTTPStatus.UNAUTHORIZED, "unauthorized", "Wrong or missing API key.")

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-input", "The request has no body.")
        if length > MAX_UPLOAD_BYTES:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "too-large", "Upload is over 25 MB.")
        return self.rfile.read(length)

    def do_GET(self):  # noqa: N802
        try:
            path = self.path.split("?")[0].rstrip("/")
            if path in ("/health", "/v1/health"):
                return self._json(200, health(self.engines))
            self._authorize()
            if path == "/v1/models":
                models = []
                if self.engines.asr is not None:
                    models.append({"id": "sensevoice", "object": "model", "owned_by": "local"})
                if self.engines.tts is not None:
                    models.append(
                        {"id": "kokoro", "object": "model", "owned_by": "local", "voices": KOKORO_VOICES}
                    )
                return self._json(200, {"object": "list", "data": models})
            raise ApiError(HTTPStatus.NOT_FOUND, "not-found", f"No route {path}.")
        except ApiError as error:
            self._error(error)

    def do_POST(self):  # noqa: N802
        started = time.monotonic()
        try:
            self._authorize()
            path = self.path.split("?")[0].rstrip("/")
            if path in ("/v1/audio/speech", "/audio/speech"):
                return self._speech(started)
            if path in ("/v1/audio/transcriptions", "/audio/transcriptions"):
                return self._transcription(started)
            raise ApiError(HTTPStatus.NOT_FOUND, "not-found", f"No route {path}.")
        except ApiError as error:
            self._error(error)
        except Exception as error:  # keep the server alive and say why
            log(f"error {type(error).__name__}: {error}")
            self._error(ApiError(HTTPStatus.INTERNAL_SERVER_ERROR, "server-error", str(error)[:200]))

    def _speech(self, started: float) -> None:
        if self.engines.tts is None:
            raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "tts-not-installed", "Kokoro is not downloaded.")
        try:
            request = json.loads(self._body())
        except json.JSONDecodeError:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-input", "Send a JSON body.")
        text = str(request.get("input") or "").strip()
        if not text or len(text) > MAX_INPUT_CHARS:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-input", f"input must be 1-{MAX_INPUT_CHARS} characters.")
        try:
            speed = float(request.get("speed") or 1.0)
        except (TypeError, ValueError):
            speed = 1.0
        samples, rate = self.engines.synthesize(text, str(request.get("voice") or ""), min(max(speed, 0.5), 2.0))
        audio = wav_bytes(samples, rate)
        seconds = len(samples) / rate if rate else 0
        log(f"speech {len(text)} chars -> {seconds:.1f}s audio in {time.monotonic() - started:.2f}s")
        self._send(200, audio, "audio/wav")

    def _transcription(self, started: float) -> None:
        if self.engines.asr is None:
            raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "asr-not-installed", "SenseVoice is not downloaded.")
        fields = multipart(self.headers.get("Content-Type") or "", self._body())
        data = fields.get("file")
        if not data:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid-input", "Attach the audio as the 'file' field.")
        language = (fields.get("language") or b"auto").decode().strip().lower() or "auto"
        if language not in ASR_LANGUAGES:
            language = "auto"
        samples, rate = decode_audio(data)
        text = self.engines.transcribe(samples, rate, language)
        seconds = len(samples) / rate if rate else 0
        log(f"transcription {seconds:.1f}s audio in {time.monotonic() - started:.2f}s")
        response_format = (fields.get("response_format") or b"json").decode().strip()
        if response_format == "text":
            return self._send(200, text.encode(), "text/plain; charset=utf-8")
        result = {"text": text}
        if response_format == "verbose_json":
            result.update({"language": language, "duration": round(seconds, 2)})
        self._json(200, result)


def health(engines: Engines) -> dict:
    return {
        "ok": True,
        "service": "botharness-voice",
        "version": VERSION,
        "pid": os.getpid(),
        "asr": ASR_MODEL if engines.asr is not None else None,
        "tts": TTS_MODEL if engines.tts is not None else None,
    }


# --------------------------------------------------------------------------
# Commands


def serve(args) -> None:
    home = Path(args.home)
    api_key = os.environ.get("BOTHARNESS_VOICE_KEY") or None
    if args.host not in ("127.0.0.1", "localhost", "::1") and not api_key:
        fail("key-required", "Set BOTHARNESS_VOICE_KEY before listening beyond this computer.")
    engines = Engines(home, threads(args.threads))
    Handler.engines = engines
    Handler.api_key = api_key
    try:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as error:
        fail("port-busy", f"Cannot listen on {args.host}:{args.port}: {error}")
    pid_file = home / "service.pid"
    pid_file.write_text(json.dumps({"pid": os.getpid(), "port": args.port, "host": args.host}))

    def stop(*_):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, stop)
    log(f"listening on http://{args.host}:{args.port}/v1 (Ctrl+C stops)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        try:
            if json.loads(pid_file.read_text()).get("pid") == os.getpid():
                pid_file.unlink()
        except (OSError, ValueError):
            pass
        log("stopped")


def base_url(args) -> str:
    return f"http://127.0.0.1:{args.port}"


def probe(args, timeout: float = 2.0) -> dict | None:
    try:
        with urllib.request.urlopen(f"{base_url(args)}/health", timeout=timeout) as response:
            state = json.loads(response.read())
    except (urllib.error.URLError, OSError, ValueError):
        return None
    if isinstance(state, dict) and state.get("service") == "botharness-voice":
        return state
    return None


def start(args) -> dict:
    home = Path(args.home)
    running = probe(args)
    if running is not None:
        return {"ok": True, "running": True, "already": True, "baseUrl": f"{base_url(args)}/v1", **running}
    log_path = home / "service.log"
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--home",
        str(home),
        "--port",
        str(args.port),
        "serve",
        "--threads",
        str(args.threads),
    ]
    options = {"stdin": subprocess.DEVNULL, "cwd": str(home)}
    if os.name == "nt":
        options["creationflags"] = 0x00000008 | 0x00000200 | 0x08000000  # detached, new group, no window
    else:
        options["start_new_session"] = True
    with open(log_path, "ab") as out:
        child = subprocess.Popen(command, stdout=out, stderr=subprocess.STDOUT, **options)
    deadline = time.monotonic() + args.wait
    while time.monotonic() < deadline:
        state = probe(args, 1.0)
        if state is not None:
            return {"ok": True, "running": True, "baseUrl": f"{base_url(args)}/v1", "log": str(log_path), **state}
        if child.poll() is not None:
            break
        time.sleep(0.5)
    tail = log_path.read_text(errors="replace")[-600:] if log_path.exists() else ""
    fail("start-failed", f"The service did not come up. Last log lines:\n{tail}")


def status(args) -> dict:
    state = probe(args)
    if state is None:
        return {"ok": True, "running": False, "baseUrl": f"{base_url(args)}/v1"}
    return {"ok": True, "running": True, "baseUrl": f"{base_url(args)}/v1", **state}


def stop_service(args) -> dict:
    home = Path(args.home)
    state = probe(args)
    pid = state.get("pid") if state else None
    if pid is None:
        try:
            pid = json.loads((home / "service.pid").read_text()).get("pid")
        except (OSError, ValueError):
            pid = None
    if pid is None or state is None:
        (home / "service.pid").unlink(missing_ok=True)
        return {"ok": True, "running": False, "stopped": False}
    os.kill(int(pid), signal.SIGTERM)
    for _ in range(20):
        if probe(args, 0.5) is None:
            return {"ok": True, "running": False, "stopped": True, "pid": pid}
        time.sleep(0.25)
    fail("stop-failed", f"Process {pid} is still answering.")


def selftest(args) -> dict:
    url = base_url(args)
    if probe(args) is None:
        fail("not-running", f"Nothing answers on {url}. Run 'start' first.")
    text = args.text
    started = time.monotonic()
    request = urllib.request.Request(
        f"{url}/v1/audio/speech",
        data=json.dumps({"model": "kokoro", "input": text, "voice": args.voice}).encode(),
        headers={"Content-Type": "application/json", **auth_header()},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        audio = response.read()
    speech_seconds = time.monotonic() - started
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nsensevoice\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\n"
        "Content-Type: audio/wav\r\n\r\n"
    ).encode() + audio + f"\r\n--{boundary}--\r\n".encode()
    started = time.monotonic()
    request = urllib.request.Request(
        f"{url}/v1/audio/transcriptions",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", **auth_header()},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        heard = json.loads(response.read())["text"]
    with wave.open(io.BytesIO(audio)) as source:
        duration = source.getnframes() / source.getframerate()
    return {
        "ok": True,
        "said": text,
        "heard": heard,
        "audioSeconds": round(duration, 2),
        "speechSeconds": round(speech_seconds, 2),
        "transcriptionSeconds": round(time.monotonic() - started, 2),
    }


def auth_header() -> dict:
    key = os.environ.get("BOTHARNESS_VOICE_KEY")
    return {"Authorization": f"Bearer {key}"} if key else {}


def main() -> None:
    parser = argparse.ArgumentParser(description="BotHarness local speech service")
    parser.add_argument("--home", default=str(Path(__file__).resolve().parent))
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    commands = parser.add_subparsers(dest="command", required=True)
    get = commands.add_parser("download", help="download the models (about 530 MB)")
    get.add_argument("--asr", action="store_true", help="only SenseVoice")
    get.add_argument("--tts", action="store_true", help="only Kokoro")
    for name in ("serve", "start"):
        command = commands.add_parser(name)
        if name == "serve":
            command.add_argument("--host", default="127.0.0.1")
        command.add_argument("--threads", type=int, default=0)
        command.add_argument("--wait", type=float, default=120)
    commands.add_parser("status")
    commands.add_parser("stop")
    test = commands.add_parser("selftest")
    test.add_argument("--text", default="你好，我是你的 Bot。Nice to meet you.")
    test.add_argument("--voice", default=DEFAULT_VOICE)
    args = parser.parse_args()
    for flag in ("home",):
        setattr(args, flag, str(Path(getattr(args, flag)).expanduser().resolve()))
    Path(args.home).mkdir(parents=True, exist_ok=True)
    if args.command == "download":
        which = [kind for kind, wanted in (("asr", args.asr), ("tts", args.tts)) if wanted] or ["asr", "tts"]
        result = {"ok": True, "home": args.home, **download(Path(args.home), which)}
    elif args.command == "serve":
        return serve(args)
    elif args.command == "start":
        result = start(args)
    elif args.command == "status":
        result = status(args)
    elif args.command == "stop":
        result = stop_service(args)
    else:
        result = selftest(args)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
`;
