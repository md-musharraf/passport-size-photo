# Precision ID — Passport Photo Studio

A desktop (Electron) and web app for making passport, visa and ID photos and
print-ready sheets. All AI runs **on the device** — photos never leave the
computer.

## What it does

1. **Photo** — drop/paste a picture, or take one with the camera. Several photos
   at once make a group sheet.
2. **Size** — pick the document (US, India, UK/EU, Schengen, Germany, Canada,
   Australia, Japan, Singapore, China, OCI/PAN, stamp size…).
3. **Edit** — the face is found and fitted to that document's rules
   automatically; a live checklist shows what passes and how to fix the rest.
   Background removal, backdrop colour, light/colour, outfits and an exam name
   strip are available here.
4. **Print** — choose A4 or 4×6 paper and copies, then export a PDF that
   prints at the exact physical size.

## AI models

| Task | Model | Runs on |
| --- | --- | --- |
| Face landmarks, head pose, eyes open, expression | Google **MediaPipe Face Landmarker** (478 3D landmarks + iris + 52 blendshapes) via `@mediapipe/tasks-vision` | GPU (WebGL) with automatic CPU fallback |
| Background removal | IS-Net via `@imgly/background-removal` | **WebGPU** when available (fp16 model), otherwise multi-threaded CPU (8-bit model) |

The backend is chosen once per session from a hardware probe
(`lib/device.ts`). If a GPU path crashes on a machine, that is remembered and
the CPU path is used from then on.

Auto-alignment (`lib/faceAlign.ts`) scales the crown-to-chin height into the
middle of the document's head band, puts the eye line in its band, centres the
face and levels the eyes. When a cut-out exists, its alpha mask gives the true
top of the head. The same maths drives the live checklist (`lib/compliance.ts`)
and is unit-tested against the PDF/PNG renderer so the preview and the print
always agree.

## Getting started

```bash
npm install
npm run download-face-models   # MediaPipe runtime + face model into public/models (≈27 MB)
npm run download-bg-models     # background-removal models into public/models (≈340 MB)
npm run dev                    # http://localhost:3000
```

Without the downloads the web app still works — models are fetched from the
official CDNs on first use. Desktop builds bundle them so the app is fully
offline.

### Desktop app

```bash
npm run electron:dev     # dev server + Electron window
npm run electron:build   # downloads models, builds, packages installers into dist-electron/
```

### Checks

```bash
npm test        # licence crypto, sheet layout and face-alignment unit tests
npm run lint
npm run build
```

## Devices

- Responsive layout: side-by-side editor on desktops, stacked editor with a
  bottom action bar on tablets and phones.
- Mouse, touch and pen: drag to move the photo, wheel or pinch to zoom.
- Imported photos are turned upright (EXIF) and capped at 2400 px, which keeps
  full print quality while making every step faster on low-end PCs.
- Light and dark themes (follows the system until you choose).
- Fast first load: only the start screen's code loads up front. The editor is
  fetched in the background while the start screen is idle, and the PDF
  library, batch tools and refine tool load when first needed.
- The AI models start loading once a photo is added (face model first, then
  background removal). On data-saver, 2G or very low-memory devices the
  background model is not pre-loaded and downloads on first use instead.
- The print-sheet preview draws a downscaled copy of the photo in each tile, so
  sheets with dozens of copies stay smooth on phones.

## Project layout

```
app/            Next.js app shell (page.tsx = workflow, layout.tsx = theme/viewport)
components/     Editor, uploader, background remover, print/batch tools, licensing
lib/            Pure logic: presets, alignment, compliance, face analysis, device probe
electron/       Electron main/preload (licensing, local file protocol)
scripts/        Model downloaders, icon tools, tests
```

> This project uses a recent Next.js release — see `AGENTS.md` before changing
> framework-level code.
