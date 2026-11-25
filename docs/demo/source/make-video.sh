#!/usr/bin/env bash
# Rebuilds docs/demo/social-links-demo.mp4 from scratch.
# Needs: Node 18+, Playwright (npm i -D playwright), Chrome or Chromium, ffmpeg, python3 + numpy.
# Set CHROME=/path/to/chrome if Playwright's bundled Chromium can't load extensions.
set -euo pipefail
cd "$(dirname "$0")"
(cd ../../.. && node build.mjs)          # make sure dist/chromium is current
node capture.cjs                          # real popup screens → shots/
node render.cjs video                     # one encoded file per scene → scenes/, list → concat.txt
python3 audio.py                          # music bed + click sounds → audio.wav
ffmpeg -y -loglevel error -f concat -safe 0 -i concat.txt -c copy video_only.mp4
ffmpeg -y -loglevel error -i audio.wav -af loudnorm=I=-20:TP=-2:LRA=7 -ar 48000 audio_norm.wav
ffmpeg -y -loglevel error -i video_only.mp4 -i audio_norm.wav -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 192k -shortest -movflags +faststart ../social-links-demo.part.mp4
mv ../social-links-demo.part.mp4 ../social-links-demo.mp4
node thumb.cjs                            # → ../social-links-thumbnail.png
echo "done: docs/demo/social-links-demo.mp4"
