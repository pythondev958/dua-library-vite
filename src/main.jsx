import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import {
  BookOpen,
  CalendarClock,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Filter,
  FolderArchive,
  Heart,
  ImagePlus,
  Import,
  LayoutGrid,
  Library,
  Pause,
  PanelRightOpen,
  Play,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { deleteDocument, getDocuments, saveDocument } from "./storage";
import "./styles.css";

const CATEGORIES = ["All", "Dua", "Surah", "Quran", "Morning", "Evening", "Other"];
const BACKUP_VERSION = 1;
const AUTOPLAY_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "10s", value: 10 },
  { label: "20s", value: 20 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
];

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function makeTitle(fileName) {
  return fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
}

async function loadStarterLibrary() {
  try {
    const response = await fetch("/starter/manifest.json", { cache: "no-cache" });
    if (!response.ok) return [];

    const manifest = await response.json();
    const starterItems = Array.isArray(manifest.documents) ? manifest.documents : [];
    const now = new Date().toISOString();

    return starterItems.map((item) => ({
      id: item.id || `starter-${item.path}`,
      title: item.title || makeTitle(item.fileName || "Starter file"),
      category: CATEGORIES.includes(item.category) && item.category !== "All" ? item.category : "Other",
      fileName: item.fileName || item.path?.split("/").pop() || "starter-file",
      size: item.size || 0,
      type: item.type || (item.path?.endsWith(".pdf") ? "application/pdf" : "image/png"),
      hash: item.hash || "",
      favorite: Boolean(item.favorite),
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      url: item.path,
      source: "starter",
    }));
  } catch {
    return [];
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function blobHash(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function App() {
  const [documents, setDocuments] = useState([]);
  const [starterDocuments, setStarterDocuments] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [viewMode, setViewMode] = useState("gallery");
  const [autoPlaySeconds, setAutoPlaySeconds] = useState(0);
  const [uploadCategory, setUploadCategory] = useState("Dua");
  const [isLoading, setIsLoading] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isCachingOffline, setIsCachingOffline] = useState(false);
  const readerTopRef = useRef(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    Promise.all([getDocuments(), loadStarterLibrary()])
      .then(([items, starterItems]) => {
        const sorted = items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setStarterDocuments(starterItems);
        setDocuments(sorted);
        setActiveId(sorted[0]?.id || starterItems[0]?.id || null);
      })
      .catch(() => setError("Could not open local browser storage."))
      .finally(() => setIsLoading(false));
  }, []);

  const allDocuments = useMemo(() => [...documents, ...starterDocuments], [documents, starterDocuments]);

  const filteredDocuments = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    return allDocuments.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesQuery = !cleanQuery || `${item.title} ${item.category} ${item.fileName}`.toLowerCase().includes(cleanQuery);
      return matchesCategory && matchesQuery;
    });
  }, [allDocuments, query, category]);

  const activeDocument = allDocuments.find((item) => item.id === activeId) || filteredDocuments[0] || null;
  const favoriteCount = allDocuments.filter((item) => item.favorite).length;
  const pdfCount = allDocuments.filter((item) => item.type === "application/pdf").length;

  useEffect(() => {
    if (viewMode !== "reader" || !autoPlaySeconds || filteredDocuments.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActiveId((currentId) => {
        const currentIndex = filteredDocuments.findIndex((item) => item.id === currentId);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % filteredDocuments.length;
        return filteredDocuments[nextIndex].id;
      });
    }, autoPlaySeconds * 1000);

    return () => window.clearInterval(timer);
  }, [autoPlaySeconds, filteredDocuments, viewMode]);

  useEffect(() => {
    if (viewMode !== "reader" || !activeId) return;
    readerTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeId, viewMode]);

  async function refreshDocument(nextDocument) {
    await saveDocument(nextDocument);
    setDocuments((current) =>
      current
        .map((item) => (item.id === nextDocument.id ? nextDocument : item))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  async function handleFiles(files) {
    setError("");
    setNotice("");
    const validFiles = Array.from(files).filter((file) => file.type.startsWith("image/") || file.type === "application/pdf");

    if (!validFiles.length) {
      setError("Please choose image or PDF files.");
      return;
    }

    const createdDocuments = await Promise.all(validFiles.map(async (file) => {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        title: makeTitle(file.name),
        category: uploadCategory,
        fileName: file.name,
        size: file.size,
        type: file.type,
        blob: file,
        hash: await blobHash(file),
        favorite: false,
        createdAt: now,
        updatedAt: now,
      };
    }));

    await Promise.all(createdDocuments.map(saveDocument));
    setDocuments((current) => [...createdDocuments, ...current].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setActiveId(createdDocuments[0].id);
    setNotice(`${createdDocuments.length} file${createdDocuments.length === 1 ? "" : "s"} added.`);
  }

  async function exportBackup() {
    setError("");
    setNotice("");

    if (!documents.length) {
      setError("Upload at least one file before exporting a backup.");
      return;
    }

    setIsBusy(true);
    try {
      const zip = new JSZip();
      const filesFolder = zip.folder("files");
      const manifestDocuments = await Promise.all(
        documents.map(async (item) => {
          const hash = item.hash || (await blobHash(item.blob));
          const extension = item.fileName.includes(".") ? item.fileName.split(".").pop() : "bin";
          const storedName = `${item.id}.${extension}`;

          filesFolder.file(storedName, item.blob);

          return {
            id: item.id,
            title: item.title,
            category: item.category,
            fileName: item.fileName,
            storedName,
            size: item.size,
            type: item.type,
            hash,
            favorite: item.favorite,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          };
        }),
      );

      zip.file(
        "manifest.json",
        JSON.stringify(
          {
            app: "dua-library",
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            documents: manifestDocuments,
          },
          null,
          2,
        ),
      );

      const backupBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      downloadBlob(backupBlob, `dua-library-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice("Backup exported. Keep it somewhere safe before clearing browser data.");
    } catch {
      setError("Could not create the backup file.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveStarterOffline() {
    setError("");
    setNotice("");

    const starterPaths = starterDocuments.map((item) => item.url).filter(Boolean);
    if (!starterPaths.length) {
      setError("No starter files are available to save offline.");
      return;
    }

    if (!("caches" in window)) {
      setError("This browser does not support offline caching.");
      return;
    }

    setIsCachingOffline(true);
    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw.js");
      }

      const cache = await caches.open("dua-library-starter-v1");
      await cache.addAll(["/starter/manifest.json", ...starterPaths]);
      setNotice(`${starterPaths.length} starter file${starterPaths.length === 1 ? "" : "s"} saved for offline reading on this device.`);
    } catch {
      setError("Could not save all starter files offline. Try again with a stable connection and enough phone storage.");
    } finally {
      setIsCachingOffline(false);
    }
  }

  async function importBackup(file) {
    if (!file) return;

    setError("");
    setNotice("");
    setIsBusy(true);

    try {
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file("manifest.json");

      if (!manifestFile) {
        setError("This does not look like a Dua Library backup.");
        return;
      }

      const manifest = JSON.parse(await manifestFile.async("string"));
      const incomingDocuments = Array.isArray(manifest.documents) ? manifest.documents : [];

      const existingHashes = new Set([
        ...(await Promise.all(documents.map(async (item) => item.hash || blobHash(item.blob)))),
        ...starterDocuments.map((item) => item.hash).filter(Boolean),
      ]);
      const existingIds = new Set(allDocuments.map((item) => item.id));
      const imported = [];
      let skipped = 0;

      for (const item of incomingDocuments) {
        const zippedFile = zip.file(`files/${item.storedName}`);
        if (!zippedFile) {
          skipped += 1;
          continue;
        }

        const blob = await zippedFile.async("blob");
        const hash = item.hash || (await blobHash(blob));

        if (existingIds.has(item.id) || existingHashes.has(hash)) {
          skipped += 1;
          continue;
        }

        const document = {
          id: item.id || crypto.randomUUID(),
          title: item.title || makeTitle(item.fileName || "Imported file"),
          category: CATEGORIES.includes(item.category) && item.category !== "All" ? item.category : "Other",
          fileName: item.fileName || item.storedName || "imported-file",
          size: item.size || blob.size,
          type: item.type || blob.type || "application/octet-stream",
          blob: new Blob([blob], { type: item.type || blob.type }),
          hash,
          favorite: Boolean(item.favorite),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        imported.push(document);
        existingIds.add(document.id);
        existingHashes.add(hash);
      }

      if (imported.length) {
        await Promise.all(imported.map(saveDocument));
        setDocuments((current) => [...imported, ...current].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setActiveId(imported[0].id);
      }

      setNotice(`Imported ${imported.length} file${imported.length === 1 ? "" : "s"}. Skipped ${skipped} already saved or missing item${skipped === 1 ? "" : "s"}.`);
    } catch {
      setError("Could not import this backup file.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete(id) {
    if (starterDocuments.some((item) => item.id === id)) return;
    await deleteDocument(id);
    setDocuments((current) => {
      const next = current.filter((item) => item.id !== id);
      setActiveId(next[0]?.id || null);
      return next;
    });
  }

  async function updateActive(updates) {
    if (!activeDocument) return;
    if (activeDocument.source === "starter") return;
    await refreshDocument({
      ...activeDocument,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="kicker">Islamic Reading Companion</p>
            <h1>Dua Library</h1>
            <p>Read, reflect, save offline, and keep your personal duas private on this device.</p>
            <div className="stat-pills" aria-label="Library summary">
              <span>{allDocuments.length} items</span>
              <span>{starterDocuments.length} starter</span>
              <span>{pdfCount} PDFs</span>
              <span>{documents.length} personal</span>
            </div>
          </div>
        </div>

        <div className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, file, or category"
            aria-label="Search library"
          />
          {query && (
            <button type="button" className="icon-button quiet" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={18} />
            </button>
          )}
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <section className={viewMode === "reader" ? "workspace reader-active" : "workspace"}>
        <aside className="sidebar">
          <div
            className={`dropzone ${dropActive ? "active" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <ImagePlus size={32} />
            <strong>Upload duas, surahs, Quran pages, or PDFs</strong>
            <span>Images and PDF files stay on this device.</span>
            <label className="primary-button">
              <Upload size={18} />
              Choose files
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
              />
            </label>
          </div>

          <div className="backup-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={saveStarterOffline}
              disabled={isCachingOffline || !starterDocuments.length}
            >
              <Download size={18} />
              {isCachingOffline ? "Saving..." : "Save offline"}
            </button>
            <button className="secondary-button" type="button" onClick={exportBackup} disabled={isBusy || !documents.length}>
              <FolderArchive size={18} />
              Export backup
            </button>
            <label className="secondary-button">
              <Import size={18} />
              Import backup
              <input
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={(event) => {
                  importBackup(event.target.files[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          <label className="field-label" htmlFor="upload-category">
            Save new uploads as
          </label>
          <select id="upload-category" value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>
            {CATEGORIES.filter((item) => item !== "All").map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <div className="stats-grid" aria-label="Library totals">
            <div>
              <Library size={18} />
              <strong>{allDocuments.length}</strong>
              <span>Items</span>
            </div>
            <div>
              <FileText size={18} />
              <strong>{pdfCount}</strong>
              <span>PDFs</span>
            </div>
            <div>
              <Star size={18} />
              <strong>{favoriteCount}</strong>
              <span>Saved</span>
            </div>
          </div>
        </aside>

        <section className="library-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Library</span>
              <h2>{category === "All" ? "All saved files" : category}</h2>
              <p className="panel-subtitle">
                Showing {filteredDocuments.length} of {allDocuments.length} items
              </p>
            </div>
            <div className="view-switch" aria-label="View mode">
              <button
                type="button"
                className={viewMode === "gallery" ? "switch active" : "switch"}
                onClick={() => setViewMode("gallery")}
              >
                <LayoutGrid size={16} />
                Gallery
              </button>
              <button
                type="button"
                className={viewMode === "reader" ? "switch active" : "switch"}
                onClick={() => setViewMode("reader")}
              >
                <PanelRightOpen size={16} />
                Reader
              </button>
            </div>
            {viewMode === "reader" && (
              <div className="autoplay-controls" aria-label="Auto play reader">
                {autoPlaySeconds ? <Pause size={16} /> : <Play size={16} />}
                <select
                  value={autoPlaySeconds}
                  onChange={(event) => setAutoPlaySeconds(Number(event.target.value))}
                  aria-label="Auto play interval"
                >
                  {AUTOPLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="filter-row" aria-label="Category filter">
              <Filter size={17} />
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={category === item ? "filter active" : "filter"}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {viewMode === "gallery" ? (
            <GalleryFeed
              documents={filteredDocuments}
              loading={isLoading}
              onSelect={(id) => {
                setActiveId(id);
                setViewMode("reader");
              }}
            />
          ) : (
            <div className="content-grid reader-layout">
              <div ref={readerTopRef} className="reader-focus-anchor" />
              <Viewer
                document={activeDocument}
                onDelete={handleDelete}
                onUpdate={updateActive}
              />
              <DocumentList
                documents={filteredDocuments}
                activeId={activeDocument?.id}
                loading={isLoading}
                onSelect={setActiveId}
              />
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function GalleryFeed({ documents, loading, onSelect }) {
  if (loading) {
    return <div className="empty-state">Opening local library...</div>;
  }

  if (!documents.length) {
    return (
      <div className="empty-state">
        <FileImage size={34} />
        <strong>No files yet</strong>
        <span>Upload an image or PDF to begin.</span>
      </div>
    );
  }

  return (
    <div className="gallery-feed" aria-label="Scrollable dua gallery">
      {documents.map((item) => (
        <GalleryCard key={item.id} document={item} onOpen={() => onSelect(item.id)} />
      ))}
    </div>
  );
}

function GalleryCard({ document, onOpen }) {
  const url = useDocumentUrl(document);

  return (
    <article className="gallery-card">
      <div className="gallery-card-header">
        <div>
          <strong>{document.title}</strong>
          <span>{document.category}</span>
        </div>
        {document.type === "application/pdf" ? (
          <a className="compact-action" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Open
          </a>
        ) : (
          <button className="compact-action" type="button" onClick={onOpen}>
            <PanelRightOpen size={16} />
            View
          </button>
        )}
      </div>
      {document.type === "application/pdf" ? (
        <button className="pdf-preview-card" type="button" onClick={onOpen}>
          <FileText size={38} />
          <strong>{document.fileName}</strong>
          <span>Tap Open for the most reliable mobile PDF viewer.</span>
        </button>
      ) : (
        <img className="gallery-image" src={url} alt={document.title} loading="lazy" />
      )}
      {document.type !== "application/pdf" && (
        <button className="image-open-hit" type="button" onClick={onOpen} aria-label={`Open ${document.title}`} />
      )}
    </article>
  );
}

function DocumentList({ documents, activeId, loading, onSelect }) {
  if (loading) {
    return <div className="empty-state">Opening local library...</div>;
  }

  if (!documents.length) {
    return (
      <div className="empty-state">
        <FileImage size={34} />
        <strong>No files yet</strong>
        <span>Upload an image or PDF to begin.</span>
      </div>
    );
  }

  return (
    <div className="document-list">
      {documents.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activeId === item.id ? "document-card active" : "document-card"}
          onClick={() => onSelect(item.id)}
        >
          <FilePreview document={item} />
          <div>
            <strong>{item.title}</strong>
            <span>{item.category}</span>
            <small>
              {formatBytes(item.size)} · {formatDate(item.updatedAt)}
            </small>
          </div>
        </button>
      ))}
    </div>
  );
}

function FilePreview({ document }) {
  const url = useDocumentUrl(document);

  if (document.type === "application/pdf") {
    return (
      <div className="preview-tile pdf-tile">
        <FileText size={26} />
      </div>
    );
  }

  return <img className="preview-tile" src={url} alt="" />;
}

function Viewer({ document, onDelete, onUpdate }) {
  const fileUrl = useDocumentUrl(document);

  if (!document) {
    return (
      <article className="viewer empty-viewer">
        <BookOpen size={42} />
        <h3>Your reading space is ready.</h3>
        <p>Upload a dua, surah image, Quran page, or PDF and it will appear here.</p>
      </article>
    );
  }

  return (
    <article className="viewer">
      <div className="viewer-toolbar">
        <div className="title-editor">
          <input
            value={document.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
            aria-label="Document title"
            readOnly={document.source === "starter"}
          />
          <span>
            <CalendarClock size={15} />
            Added {formatDate(document.createdAt)}
          </span>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className={document.favorite ? "icon-button favorite active" : "icon-button favorite"}
            onClick={() => onUpdate({ favorite: !document.favorite })}
            aria-label="Toggle favorite"
            disabled={document.source === "starter"}
          >
            <Heart size={18} />
          </button>
          <a className="icon-button" href={fileUrl} download={document.fileName} aria-label="Download file">
            <Download size={18} />
          </a>
          {document.type === "application/pdf" && (
            <a className="icon-button" href={fileUrl} target="_blank" rel="noreferrer" aria-label="Open PDF">
              <ExternalLink size={18} />
            </a>
          )}
          {document.source !== "starter" && (
            <button type="button" className="icon-button danger" onClick={() => onDelete(document.id)} aria-label="Delete file">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="meta-row">
        <select
          value={document.category}
          onChange={(event) => onUpdate({ category: event.target.value })}
          disabled={document.source === "starter"}
        >
          {CATEGORIES.filter((item) => item !== "All").map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span>{document.fileName}</span>
        <span>{formatBytes(document.size)}</span>
      </div>

      <div className="reader">
        {document.type === "application/pdf" ? (
          <div className="pdf-reader-fallback">
            <FileText size={48} />
            <h3>{document.title}</h3>
            <p>For Android Chrome, opening the PDF in its own tab is the most reliable way to read it.</p>
            <div className="pdf-actions">
              <a className="primary-button" href={fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={18} />
                Open PDF
              </a>
              <a className="secondary-button inline" href={fileUrl} download={document.fileName}>
                <Download size={18} />
                Download
              </a>
            </div>
          </div>
        ) : (
          <img src={fileUrl} alt={document.title} />
        )}
      </div>
    </article>
  );
}

function useDocumentUrl(document) {
  const url = useMemo(() => {
    if (!document) return "";
    if (document.url) return document.url;
    return URL.createObjectURL(document.blob);
  }, [document]);

  useEffect(() => {
    return () => {
      if (url && document?.blob) {
        URL.revokeObjectURL(url);
      }
    };
  }, [document, url]);

  return url;
}

createRoot(document.getElementById("root")).render(<App />);
