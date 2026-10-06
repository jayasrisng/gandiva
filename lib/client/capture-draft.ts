// IndexedDB capture drafts are scoped to the authenticated owner.
export type Draft = {
  photos: File[];
  text: string;
  key: string;
  recording: RecordingSource | null;
  language: string;
};
export type Upload = {
  id: string;
  path: string;
  bucket: string;
  token?: string;
  kind: "original" | "derivative" | "audio";
  mime: string;
  size: number;
  parentIndex: number | null;
};
export type RecordingSource = {
  upload: Upload;
  rawTranscript: string;
  model: string;
  language: string;
};
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("gandiva-capture", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function draftStore(
  owner: string,
  value?: Draft | null,
): Promise<Draft | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      "drafts",
      value === undefined ? "readonly" : "readwrite",
    );
    const store = transaction.objectStore("drafts");
    const request =
      value === undefined
        ? store.get(owner)
        : value === null
          ? store.delete(owner)
          : store.put(value, owner);
    let result: Draft | undefined;
    request.onsuccess = () => {
      result = value === undefined ? request.result : undefined;
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
