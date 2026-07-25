import { AttendanceQueue, type AttendanceAction, type QueuedAttendanceAction } from "@/features/coaching/attendance-queue";

export interface AttendanceStore {
  load(): Promise<readonly QueuedAttendanceAction[]>;
  save(items: readonly QueuedAttendanceAction[]): Promise<void>;
}

export class DurableAttendanceQueue {
  private writeTail: Promise<void> = Promise.resolve();
  private constructor(private readonly store: AttendanceStore, private readonly queue: AttendanceQueue) {}

  static async open(store: AttendanceStore): Promise<DurableAttendanceQueue> {
    const queue = new AttendanceQueue();
    for (const action of await store.load()) queue.enqueue(action);
    return new DurableAttendanceQueue(store, queue);
  }

  pending(): QueuedAttendanceAction[] {
    const removed = this.queue.pruneExpired();
    const items = this.queue.pending();
    if (removed) void this.persistSnapshot(items);
    return items;
  }

  async pruneExpired(now = Date.now()): Promise<number> {
    const removed = this.queue.pruneExpired(now);
    if (removed) await this.persistSnapshot(this.queue.pending());
    return removed;
  }

  async enqueue(action: AttendanceAction): Promise<QueuedAttendanceAction> {
    const queued = this.queue.enqueue(action);
    await this.persist();
    return queued;
  }

  async acknowledge(idempotencyKey: string): Promise<boolean> {
    const removed = this.queue.acknowledge(idempotencyKey);
    if (removed) await this.persist();
    return removed;
  }

  private persist(): Promise<void> {
    const snapshot = this.queue.pending();
    return this.persistSnapshot(snapshot);
  }

  private persistSnapshot(snapshot: readonly QueuedAttendanceAction[]): Promise<void> {
    this.writeTail = this.writeTail.then(() => this.store.save(snapshot));
    return this.writeTail;
  }
}

export class IndexedDbAttendanceStore implements AttendanceStore {
  private readonly databaseName: string;
  private readonly storeName = "attendance-actions";

  constructor(scope: string) {
    if (!scope.trim()) throw new Error("An authenticated attendance storage scope is required.");
    this.databaseName = `grassroots-offline-${scope.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName, { keyPath: "idempotencyKey" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Offline attendance storage could not be opened."));
    });
  }

  async load(): Promise<readonly QueuedAttendanceAction[]> {
    const database = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();
        let valid: QueuedAttendanceAction[] = [];
        request.onsuccess = () => {
          const items = request.result as QueuedAttendanceAction[];
          valid = items.filter((item) => Date.parse(item.expiresAt) > Date.now());
          for (const item of items) if (Date.parse(item.expiresAt) <= Date.now()) store.delete(item.idempotencyKey);
        };
        transaction.oncomplete = () => resolve(valid);
        transaction.onerror = () => reject(transaction.error ?? new Error("Offline attendance actions could not be read."));
        request.onerror = () => reject(request.error ?? new Error("Offline attendance actions could not be read."));
      });
    } finally { database.close(); }
  }

  async save(items: readonly QueuedAttendanceAction[]): Promise<void> {
    const database = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        store.clear();
        for (const item of items) store.put(item);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Offline attendance actions could not be saved."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Offline attendance storage was interrupted."));
      });
    } finally { database.close(); }
  }
}
