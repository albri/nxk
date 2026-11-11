# README figures and launch video

The figures in [assets/readme](..) are drawn from [figures.mjs](figures.mjs) by
[render.mjs](render.mjs), on Paper and on Night. The launch video,
[assets/nxk-launch.mp4](../../nxk-launch.mp4), and its poster are drawn from the
same file by [video.mjs](video.mjs), with a soundtrack that
[sound.mjs](sound.mjs) synthesises in code. Both use the PersonaGen Route parts
in [route.mjs](route.mjs): the colours, the type, the nxk wordmark and the two
drawings (the crowd as lines, and the crowd as squares). The words, numbers and
drawings match the nxk page on alexbristow.com. To change a word or a number,
edit figures.mjs and run:

```bash
node assets/readme/src/render.mjs
```

```bash
node assets/readme/src/video.mjs
```

Both need [playwright-core](https://www.npmjs.com/package/playwright-core) and a
Chromium, Chrome or Brave. render.mjs needs `cwebp` for the WebP files, and
video.mjs needs `ffmpeg`. The top of each script lists the environment variables
that point at them. The fonts (Genos, IBM Plex Sans and IBM Plex Mono) load from
Google Fonts unless `NXK_FONTS` points at a folder of local copies; route.mjs
lists the file names. To check a moment of the video without rendering all of
it, `node assets/readme/src/video.mjs --at 3,21,40` writes stills at those
seconds, and `--sound` writes only the soundtrack.

The soundtrack uses no recordings or samples. Each cut in the video adds a cue
(a soft mallet note, a bell or a breath of filtered noise) and each step or stop
moves a quiet chord pad along, all synthesised in sound.mjs and mixed with a
small reverb. The video says everything on screen, so it works muted.

When the PersonaGen 4.0 benchmark run is recorded, fill in the
`nxk on PersonaGen 4.0` run in `benchmark` and remove its `pending: true`, then
run both scripts. The figure and the video fill in the 4.0 row in place of the
dashed one.

The top of the README plays the video from a GitHub upload, not from this
folder. After rendering a new video, upload it to GitHub and replace the link.
