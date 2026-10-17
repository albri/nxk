# README figures

The figures in [assets/readme](..) are drawn from [figures.mjs](figures.mjs) by
[render.mjs](render.mjs), in light and dark. To change a word or a number, edit
figures.mjs and run:

```bash
node assets/readme/src/render.mjs
```

It needs [playwright-core](https://www.npmjs.com/package/playwright-core) with a
Chromium, and `cwebp` for the WebP files. The top of render.mjs lists the
environment variables that point at them, and at local copies of the fonts
(Schibsted Grotesk and Fragment Mono) if you don't want them from Google Fonts.

When the PersonaGen 4.0 benchmark run is recorded, fill in the
`nxk on PersonaGen 4.0` run in `benchmark` and remove its `pending: true`.
