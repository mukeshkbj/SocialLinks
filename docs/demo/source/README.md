# Demo video source

Everything needed to rebuild `../social-links-demo.mp4` (1920×1080, 30 fps, 1:17) and its thumbnail.

| File | What it does |
|---|---|
| `make-video.sh` | Runs the whole pipeline below |
| `capture.cjs` | Loads `dist/chromium` in Chrome with fictional demo data and screenshots the real popup into `shots/` |
| `measure.cjs` | Prints where popup controls sit, so the cursor in `stage.html` lands on them |
| `stage.html` | The animated 1920×1080 stage: demo browser, pages, right-click menus, cursor, captions. `render(scene, t)` draws any moment |
| `render.cjs` | `node render.cjs video` encodes each scene to `scenes/`; `node render.cjs stills "2:4.3,5:6.9"` saves check frames to `tmp/` |
| `audio.py` | Synthesises the music bed and click sounds, timed to the scenes |
| `thumb.html`, `thumb.cjs` | The 1280×720 YouTube thumbnail |

To change a caption or timing, edit the scene in `stage.html`, check a few frames with `render.cjs stills`, re-render only that scene (`node render.cjs video 3`), then rerun the last three ffmpeg steps in `make-video.sh`. If a scene's length changes, update `DUR` and the click times in `audio.py`.

Notes:
- The browser window and web pages are illustrations. Browsers don't let you capture their own right-click menus, so the menus are drawn using the extension's real menu titles. The popup screens are real captures.
- All names and sites (Alex Morgan, Northwind Robotics, morgan.dev) are fictional.
