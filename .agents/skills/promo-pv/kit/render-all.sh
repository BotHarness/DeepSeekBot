#!/bin/bash
# full render: [PORT=8777] ./kit/render-all.sh <workers> <final.mp4> [bgm.wav]
# splits the timeline across workers, concatenates, mixes BGM + SFX cues, muxes, and writes a small copy.
set -e
cd "$(dirname "$0")/.."
W=${1:-3}; OUT=${2:-out/pv.mp4}; BGM=${3:-assets/bgm.wav}; PORT=${PORT:-8777}; URL=http://127.0.0.1:$PORT/index.html
curl -sf -o /dev/null $URL || { nohup python3 -m http.server $PORT >/dev/null 2>&1 & sleep 2; }
TOTAL=$(node -e "const s=require('fs').readFileSync('beats.js','utf8');console.log(/END\s*=\s*([\d.]+)/.exec(s)[1])")
mkdir -p out/seg && rm -f out/seg/*
: > out/seg/list.txt
for i in $(seq 0 $((W - 1))); do
  A=$(node -e "console.log(($TOTAL*$i/$W).toFixed(3))"); B=$(node -e "console.log(($TOTAL*($i+1)/$W).toFixed(3))")
  node kit/render.cjs $A $B out/seg/seg$i.mp4 out/seg/ev$i.json $URL > out/seg/log$i.txt 2>&1 &
  echo "file seg$i.mp4" >> out/seg/list.txt
done
wait
grep -h PAGEERR out/seg/log*.txt && exit 1 || true
ffmpeg -v error -y -f concat -i out/seg/list.txt -c copy out/seg/video.mp4
python3 kit/mix.py --bgm "$BGM" --events 'out/seg/ev*.json' --total "$TOTAL" --out out/seg/mix.wav
ffmpeg -v error -y -i out/seg/video.mp4 -i out/seg/mix.wav -c:v copy -c:a aac -b:a 256k -shortest "$OUT"
ffmpeg -v error -y -i "$OUT" -c:v libx264 -crf 26 -preset medium -c:a copy "${OUT%.mp4}-small.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
