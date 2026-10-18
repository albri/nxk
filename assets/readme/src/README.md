# README figures and launch video

The figures in [assets/readme](..) are drawn from [figures.mjs](figures.mjs) by
[render.mjs](render.mjs), in light and dark. The launch video,
[assets/nxk-launch.mp4](../../nxk-launch.mp4), and its poster are drawn from the
same file by [video.mjs](video.mjs). To change a word or a number, edit
figures.mjs and run:

```bash
node assets/readme/src/render.mjs
```

```bash
node assets/readme/src/video.mjs
```

Both need [playwright-core](https://www.npmjs.com/package/playwright-core) with a
Chromium. render.mjs needs `cwebp` for the WebP files, and video.mjs needs
`ffmpeg`. The top of each script lists the environment variables that point at
them, and at local copies of the fonts (Schibsted Grotesk and Fragment Mono) if
you don't want them from Google Fonts. To check a moment of the video without
rendering all of it, `node assets/readme/src/video.mjs --at 3,21,40` writes
stills at those seconds.

When the PersonaGen 4.0 benchmark run is recorded, fill in the
`nxk on PersonaGen 4.0` run in `benchmark` and remove its `pending: true`, then
run both scripts. The figure and the video fill in the 4.0 row in place of the
dashed one.

The top of the README plays the video from a GitHub upload, not from this
folder. After rendering a new video, upload it to GitHub and replace the link.
