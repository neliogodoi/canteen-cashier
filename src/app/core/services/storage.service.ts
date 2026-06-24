import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

interface KeyValueEntry {
  key: string;
  value: unknown;
}

class AppStorageDatabase extends Dexie {
  kv!: Table<KeyValueEntry, string>;

  constructor() {
    super('caixa-cantina-db');
    this.version(1).stores({
      kv: '&key'
    });
  }
}

const LEGACY_KEYS = [
  'cc.products',
  'cc.sessions',
  'cc.sales',
  'cc.settings',
  'cc.sync.meta',
  'cc.sync.queue'
];

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly db = new AppStorageDatabase();
  private readonly cache = new Map<string, unknown>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.db.open();
    const entries = await this.db.kv.toArray();

    if (!entries.length) {
      await this.migrateLegacyLocalStorage();
    } else {
      for (const entry of entries) {
        this.cache.set(entry.key, entry.value);
      }
    }

    this.initialized = true;
  }

  getItem<T>(key: string, fallback: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    return fallback;
  }

  setItem<T>(key: string, value: T): void {
    this.cache.set(key, value);
    void this.db.kv.put({ key, value });
  }

  private async migrateLegacyLocalStorage(): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const migratedEntries: KeyValueEntry[] = [];

    for (const key of LEGACY_KEYS) {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) {
        continue;
      }

      try {
        const parsed = JSON.parse(rawValue) as unknown;
        this.cache.set(key, parsed);
        migratedEntries.push({ key, value: parsed });
      } catch {
        // Ignora entradas legadas inválidas.
      }
    }

    if (migratedEntries.length) {
      await this.db.kv.bulkPut(migratedEntries);
    }
  }
}
