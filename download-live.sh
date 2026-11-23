#!/usr/bin/env bash
#
# download-live.sh — record a live stream (YouTube / Twitch) with yt-dlp.
#
# Environment setup that was performed:
#   * yt-dlp 2026.10.26             pip install yt-dlp
#   * ffmpeg + ffprobe             required for merging live-stream video/audio
#   * certifi, brotli, websockets, requests, curl_cffi, mutagen, pycryptodomex
#   * yt-dlp-ejs + node runtime    full YouTube support (--js-runtimes node)
#
# Usage:
#   ./download-live.sh <URL> [OUTPUT_DIR]
#
# Example (the command shown in the reference image):
#   ./download-live.sh "https://www.twitch.tv/<channel>/live"
#
set -euo pipefail

URL="${1:-}"
OUT="${2:-.}"

if [[ -z "$URL" ]]; then
    echo "Usage: $0 <URL> [OUTPUT_DIR]" >&2
    exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
    echo "error: yt-dlp is not installed" >&2
    exit 1
fi

mkdir -p "$OUT"

# --live-from-start records the broadcast from its beginning.
exec yt-dlp \
    --live-from-start \
    --merge-output-format mp4 \
    -o "$OUT/%(uploader)s - %(title)s [%(id)s].%(ext)s" \
    "$URL"
