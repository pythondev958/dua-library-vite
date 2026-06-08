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

## Starter Files For The Public App

To ship an initial library with the app, put files in:

```text
public/starter/duas
public/starter/surahs
public/starter/quran
public/starter/morning
public/starter/evening
public/starter/other
```

Then run:

```bash
npm run starter:manifest
npm run build
```

Commit the files and the updated `public/starter/manifest.json`. After you push to GitHub, Vercel will include those starter files in the deployed app.

PDFs open through a dedicated **Open PDF** action for better Android Chrome support. Images appear in the default gallery view so users can scroll and read multiple duas without opening each one.

## Offline Reading

Starter files can be saved for offline use from inside the app with **Save offline**.

This downloads the bundled starter PDFs/images into the browser cache on that device. After it finishes, starter PDFs/images can be opened without internet on the same browser, as long as Chrome site data is not cleared.

User-uploaded files are already stored locally in IndexedDB and can be opened offline on the same device/browser.

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
