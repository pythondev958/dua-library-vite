const DB_NAME = "dua-library-db";
const STORE_NAME = "documents";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(mode, callback) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = callback(store);

        request.onsuccess = () => {
          if (mode === "readonly") {
            resolve(request.result);
          }
        };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => {
          db.close();
          if (mode !== "readonly") {
            resolve(request.result);
          }
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      }),
  );
}

export function getDocuments() {
  return runTransaction("readonly", (store) => store.getAll());
}

export function saveDocument(document) {
  return runTransaction("readwrite", (store) => store.put(document));
}

export function deleteDocument(id) {
  return runTransaction("readwrite", (store) => store.delete(id));
}
