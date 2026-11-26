#!/usr/bin/env bash
# Professional VO + music-bed mix -> final reel (AAC 192k, video stream copied).
# Two-pass EBU R128 loudnorm to Instagram's -14 LUFS target, true-peak limited to -1.0 dBTP.
set -euo pipefail
cd "$(dirname "$0")/.."

FF=${FFMPEG:-ffmpeg}
TMP=$(mktemp -d)
FADE=${FADE:-1.4}
trap 'rm -rf "$TMP"' EXIT

mix_one () { # $1=id $2=duration $3=vo $4=bed
  local id="$1" dur="$2" vo="$3" bed="$4"
  local FADE_ST; FADE_ST=$(awk -v d="$dur" -v f="$FADE" 'BEGIN{printf "%.2f", d-f}')
  local src="reels/${id}-reel.mp4"
  echo "== $id ($dur s)"

  # Pass A: VO (delayed 0.6s for breath) + sidechain-ducked bed -> compressed pre-master
  "$FF" -y -hide_banner -loglevel error \
    -i "$src" -i "$vo" -i "$bed" \
    -filter_complex "\
[1:a]aformat=sample_rates=48000:channel_layouts=mono,volume=1.0,adelay=600,\
apad=pad_dur=6,atrim=0:${dur},asplit=2[vod][vos];\
[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.30,highpass=f=55,\
apad=pad_dur=6,atrim=0:${dur}[bed];\
[bed][vos]sidechaincompress=threshold=0.035:ratio=8:attack=12:release=320:makeup=1[duck];\
[vod][duck]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,\
acompressor=threshold=-24dB:ratio=2.2:attack=8:release=180:makeup=6,\
highpass=f=70,lowpass=f=15500,afade=t=in:st=0:d=0.5,afade=t=out:st=${FADE_ST}:d=${FADE},\
alimiter=limit=0.95:level=false,apad=whole_dur=${dur},atrim=0:${dur},asetpts=N/SR/TB[a]" \
    -map "[a]" -c:a pcm_s16le "$TMP/${id}-pre.wav"

  # Pass B: measure loudness
  local stats
  stats=$("$FF" -hide_banner -nostats -i "$TMP/${id}-pre.wav" \
    -af loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
  local mi mt ml mth
  mi=$(printf '%s' "$stats" | sed -n 's/.*"input_i" : "\([^"]*\)".*/\1/p')
  mt=$(printf '%s' "$stats" | sed -n 's/.*"input_tp" : "\([^"]*\)".*/\1/p')
  ml=$(printf '%s' "$stats" | sed -n 's/.*"input_lra" : "\([^"]*\)".*/\1/p')
  mth=$(printf '%s' "$stats" | sed -n 's/.*"input_thresh" : "\([^"]*\)".*/\1/p')
  echo "   measured: I=${mi} LUFS TP=${mt} dBTP LRA=${ml}"
  if [ -z "$mi" ] || [ "$mi" = "-inf" ]; then echo "   !! measurement failed"; exit 1; fi

  # Pass C: dynamic loudnorm to -14 LUFS / -1 dBTP (crest factor is too high for
  # linear gain), then encode AAC and copy the video stream untouched
  "$FF" -y -hide_banner -loglevel error \
    -i "$src" -i "$TMP/${id}-pre.wav" \
    -map 0:v:0 -map 1:a:0 \
    -c:v copy \
    -af "loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.891:level=false,aresample=48000" \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -shortest -movflags +faststart \
    "$TMP/${id}.mp4"

  mv "$TMP/${id}.mp4" "$src"
  echo "   -> $src"
}

mix_one 01-technology-partner 14.0 reels/vo1.mp3 reels/bed1.wav
mix_one 02-community-appreciation 12.0 reels/vo2.mp3 reels/bed2.wav
echo "mix complete"
