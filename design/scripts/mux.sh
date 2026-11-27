#!/usr/bin/env bash
# Professional VO + music-bed mix -> final reel (AAC 192k, video stream copied).
# Two-pass EBU R128 loudnorm to Instagram's -14 LUFS target, true-peak limited to -1.0 dBTP.
set -euo pipefail
cd "$(dirname "$0")/.."

FF=${FFMPEG:-ffmpeg}
TMP=$(mktemp -d)
FADE=${FADE:-1.4}
# voice is slowed with the picture so VO and visuals stay locked (1/1.08 = .96)
VO_DELAY_MS=${VO_DELAY_MS:-680}
VO_START_S=$(awk -v d="$VO_DELAY_MS" 'BEGIN{printf "%.2f", d/1000}')
VO_TEMPO=${VO_TEMPO:-0.96}
trap 'rm -rf "$TMP"' EXIT

mix_one () { # $1=id $2=duration $3=vo $4=bed
  local id="$1" dur="$2" vo="$3" bed="$4"
  local FADE_ST; FADE_ST=$(awk -v d="$dur" -v f="$FADE" 'BEGIN{printf "%.2f", d-f}')
  local out="reels/${id}-reel.mp4"
  # Always mix from a pristine (silent) video. A freshly rendered reel has no
  # audio stream, so if $out is silent it IS the new picture: refresh the backup
  # from it. Only fall back to the old backup when $out already carries audio
  # (i.e. we are re-running the mix without a re-render) so audio never stacks.
  mkdir -p reels/_clean
  local src="reels/_clean/${id}-reel.mp4"
  local silent=0
  if ! "$FF" -hide_banner -i "$out" 2>&1 | grep -q "Audio:"; then silent=1; fi
  if [ "$silent" = "1" ] || [ ! -f "$src" ]; then
    echo "   silent video -> using it as the picture source"
    cp "$out" "$src"
  fi
  echo "== $id ($dur s)"

  # Pass A: VO (delayed 0.6s for breath) + sidechain-ducked bed -> compressed pre-master
  "$FF" -y -hide_banner -loglevel error \
    -i "$src" -i "$vo" -i "$bed" \
    -filter_complex "\
[1:a]aformat=sample_rates=48000:channel_layouts=mono,volume=1.0,atempo=${VO_TEMPO},adelay=${VO_DELAY_MS},\
apad=whole_dur=${dur},asplit=2[vod][vos];\
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

  # Pass C: dynamic loudnorm to -14 LUFS / -1 dBTP, encode AAC, copy video.
  # NOTE: no -shortest here - the muxed file must match the video length exactly,
  # and the audio is already exactly ${dur}s from pass A.
  "$FF" -y -hide_banner -loglevel error \
    -i "$src" -i "$TMP/${id}-pre.wav" \
    -filter_complex "[1:a]loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.891:level=false,aresample=48000[a]" \
    -map 0:v:0 -map "[a]" \
    -c:v copy \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -t ${dur} \
    -movflags +faststart \
    "$TMP/${id}-final.mp4"

  mv "$TMP/${id}-final.mp4" "$out"
  echo "   -> $out"
}

mix_one 01-technology-partner 15.12 reels/vo1.mp3 reels/bed1.wav
mix_one 02-community-appreciation 12.96 reels/vo2.mp3 reels/bed2.wav
echo "mix complete"
