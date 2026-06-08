# Dua Library

A Vite + React app for keeping dua, surah, Quran, and other devotional image/PDF files in the browser.

## How Storage Works

This app has no backend. Uploaded files are stored locally in the visitor's browser using IndexedDB.

That means:

- Files stay on the same device and browser.
- Clearing browser data can remove the library.
- Deploying to Vercel works as a static frontend app.
- No file is uploaded to a server.

## Backup And Restore

Use **Export backup** before clearing Chrome history/site data. The app downloads one `.zip` file that contains:

- `manifest.json` with titles, categories, favorites, and file metadata
- A `files/` folder with the original PDFs and images

Use **Import backup** to restore it later. Importing does not delete current files. It keeps what is already in the library and adds only files that are not already saved.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy On Vercel

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
