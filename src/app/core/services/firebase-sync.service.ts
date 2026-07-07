import { effect, Injectable, Injector, signal } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore
} from 'firebase/firestore';

import { AppSettings, CashSession, Product, Sale, TicketRenewal } from '../models/app.models';
import { nowIso } from '../utils/date.util';
import { AuthService } from './auth.service';
import { defaultCanteenId, firebaseConfig } from './firebase.config';
import { StorageService } from './storage.service';
import { ProductService } from './product.service';
import { CashSessionService } from './cash-session.service';
import { SaleService } from './sale.service';
import { SettingsService } from './settings.service';

type SyncCollectionName = 'products' | 'cashSessions' | 'sales' | 'settings' | 'ticketRenewals';
type SyncReason =
  | 'full_sync'
  | 'cash_opened'
  | 'cash_closed'
  | 'sale_created'
  | 'sale_reprinted'
  | 'sale_cancelled'
  | 'production_changed'
  | 'product_changed'
  | 'settings_changed'
  | 'ticket_renewal_changed';

interface SyncCollectionMeta {
  lastPulledAt: string;
  lastPushedAt: string;
}

interface SyncMetadata {
  collections: Record<SyncCollectionName, SyncCollectionMeta>;
}

interface PendingSyncState {
  products: string[];
  cashSessions: string[];
  sales: string[];
  settings: boolean;
  ticketRenewals: string[];
}

const SYNC_META_KEY = 'cc.sync.meta';
const SYNC_QUEUE_KEY = 'cc.sync.queue';
const SYNC_PENDING_KEY = 'cc.sync.pending';
const PRODUCTS_KEY = 'cc.products';
const SESSIONS_KEY = 'cc.sessions';
const SALES_KEY = 'cc.sales';
const SETTINGS_KEY = 'cc.settings';
const REMOTE_HISTORY_SESSIONS_KEY = 'cc.remote.sessions';
const REMOTE_HISTORY_SALES_KEY = 'cc.remote.sales';
const TICKET_RENEWALS_KEY = 'cc.ticket-renewals';
const REMOTE_HISTORY_TICKET_RENEWALS_KEY = 'cc.remote.ticket-renewals';
const EMPTY_META: SyncCollectionMeta = {
  lastPulledAt: '',
  lastPushedAt: ''
};
const EMPTY_PENDING_STATE: PendingSyncState = {
  products: [],
  cashSessions: [],
  sales: [],
  settings: false,
  ticketRenewals: []
};

interface SyncQueueItem {
  id: string;
  collections: SyncCollectionName[];
  reason: SyncReason;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class FirebaseSyncService {
  readonly syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');
  readonly lastSyncAt = signal('');
  readonly lastError = signal('');
  readonly queueSize = signal(0);
  readonly historySessions = signal<CashSession[]>([]);
  readonly historySales = signal<Sale[]>([]);
  readonly historyTicketRenewals = signal<TicketRenewal[]>([]);

  private app: FirebaseApp | null = null;
  private firestore: Firestore | null = null;
  private firebaseModulesPromise: Promise<FirebaseRuntime> | null = null;
  private syncPromise: Promise<void> | null = null;
  private metadata: SyncMetadata;
  private queue: SyncQueueItem[];
  private pendingState: PendingSyncState;
  private readonly debugEnabled = true;

  constructor(
    private readonly injector: Injector,
    private readonly storage: StorageService,
    private readonly authService: AuthService
  ) {
    this.metadata = this.storage.getItem<SyncMetadata>(SYNC_META_KEY, {
      collections: {
        products: { ...EMPTY_META },
        cashSessions: { ...EMPTY_META },
        sales: { ...EMPTY_META },
        settings: { ...EMPTY_META },
        ticketRenewals: { ...EMPTY_META }
      }
    });
    this.queue = this.storage.getItem<SyncQueueItem[]>(SYNC_QUEUE_KEY, []);
    this.pendingState = this.storage.hasItem(SYNC_PENDING_KEY)
      ? normalizePendingState(this.storage.getItem<PendingSyncState>(SYNC_PENDING_KEY, EMPTY_PENDING_STATE))
      : this.buildInitialPendingState();
    this.historySessions.set(this.storage.getItem<CashSession[]>(REMOTE_HISTORY_SESSIONS_KEY, []));
    this.historySales.set(this.storage.getItem<Sale[]>(REMOTE_HISTORY_SALES_KEY, []));
    this.historyTicketRenewals.set(this.storage.getItem<TicketRenewal[]>(REMOTE_HISTORY_TICKET_RENEWALS_KEY, []));
    this.queueSize.set(this.queue.length);

    effect(
      () => {
        if (!this.authService.initialized()) {
          return;
        }

        const authenticated = this.authService.isAuthenticated();
        this.log('auth state changed', { authenticated });

        if (authenticated) {
          this.enqueueFullSync();
        }
      },
      { allowSignalWrites: true }
    );
  }

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    this.log('initialize', {
      online: typeof navigator === 'undefined' ? 'unknown' : navigator.onLine,
      queueSize: this.queue.length
    });

    window.addEventListener('online', () => {
      this.log('browser online event');
      if (this.authService.isAuthenticated()) {
        this.enqueueFullSync();
      }
    });

    if (this.authService.isAuthenticated()) {
      this.enqueueFullSync();
      return;
    }

    this.log('waiting for authenticated session before syncing');
  }

  enqueueFullSync(): void {
    this.enqueue(['products', 'cashSessions', 'sales', 'settings', 'ticketRenewals'], 'full_sync');
  }

  enqueueCashSessionOpened(): void {
    this.enqueue(['cashSessions'], 'cash_opened');
  }

  enqueueCashSessionClosed(): void {
    this.enqueue(['cashSessions'], 'cash_closed');
  }

  enqueueSaleCreated(): void {
    this.enqueue(['cashSessions', 'sales'], 'sale_created');
  }

  enqueueSaleReprinted(): void {
    this.enqueue(['sales'], 'sale_reprinted');
  }

  enqueueSaleCancelled(): void {
    this.enqueue(['cashSessions', 'sales'], 'sale_cancelled');
  }

  enqueueProductionChanged(): void {
    this.enqueue(['cashSessions'], 'production_changed');
  }

  enqueueProductChanged(): void {
    this.enqueue(['products'], 'product_changed');
  }

  enqueueSettingsChanged(): void {
    this.enqueue(['settings'], 'settings_changed');
  }

  enqueueTicketRenewalChanged(): void {
    this.enqueue(['ticketRenewals'], 'ticket_renewal_changed');
  }

  prepareClosedSessionExport(sessionId: string): void {
    const cashSessionService = this.injector.get(CashSessionService);
    const saleService = this.injector.get(SaleService);
    const session = cashSessionService.getSessionById(sessionId);
    if (!session || session.status !== 'closed') {
      return;
    }

    this.markCashSessionPending(session.id);
    for (const sale of saleService.getSalesBySession(sessionId)) {
      this.markSalePending(sale.id);
    }

    this.enqueue(['cashSessions', 'sales'], 'cash_closed');
  }

  getHistorySessions(): CashSession[] {
    return [...this.historySessions()]
      .filter((session) => session.status === 'closed')
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  getHistorySessionById(sessionId: string): CashSession | undefined {
    return this.historySessions().find((session) => session.id === sessionId);
  }

  getHistorySalesBySession(sessionId: string): Sale[] {
    return this.historySales()
      .filter((sale) => sale.cashSessionId === sessionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getAllHistorySales(): Sale[] {
    return [...this.historySales()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getHistorySaleByTicketToken(ticketToken: string): Sale | undefined {
    return this.historySales().find((sale) => sale.ticketToken === ticketToken);
  }

  getHistoryTicketRenewals(): TicketRenewal[] {
    return [...this.historyTicketRenewals()].sort((a, b) => b.renewedAt.localeCompare(a.renewedAt));
  }

  markProductPending(productId: string): void {
    this.markPendingEntity('products', productId);
  }

  markCashSessionPending(sessionId: string): void {
    this.markPendingEntity('cashSessions', sessionId);
  }

  markSalePending(saleId: string): void {
    this.markPendingEntity('sales', saleId);
  }

  markSettingsPending(): void {
    if (this.pendingState.settings) {
      return;
    }

    this.pendingState = {
      ...this.pendingState,
      settings: true
    };
    this.persistPendingState();
  }

  markTicketRenewalPending(renewalId: string): void {
    this.markPendingEntity('ticketRenewals', renewalId);
  }

  async syncIncremental(): Promise<void> {
    if (this.syncPromise) {
      this.log('sync already in progress, joining existing promise');
      return this.syncPromise;
    }

    this.syncPromise = this.processQueue();
    try {
      await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  private async processQueue(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      this.log('sync skipped because user is not authenticated');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.log('sync skipped because browser is offline');
      return;
    }

    while (this.queue.length) {
      const currentJob = this.queue[0];

      try {
        this.syncStatus.set('syncing');
        this.lastError.set('');

        const runtime = await this.getRuntime();
        const db = runtime.firestore;
        await this.ensureCanteenRootDocument(db, runtime);
        const collections = new Set<SyncCollectionName>(currentJob.collections);
        this.log('processing sync job', {
          id: currentJob.id,
          reason: currentJob.reason,
          collections: [...collections]
        });

        const forceFull = currentJob.reason === 'full_sync';

        if (collections.has('products')) {
          await this.pushProducts(db, runtime, forceFull);
        }
        if (collections.has('cashSessions')) {
          await this.pushCashSessions(db, runtime, forceFull);
        }
        if (collections.has('sales')) {
          await this.pushSales(db, runtime, forceFull);
        }
        if (collections.has('settings')) {
          await this.pushSettings(db, runtime, forceFull);
        }
        if (collections.has('ticketRenewals')) {
          await this.pushTicketRenewals(db, runtime, forceFull);
        }

        if (collections.has('products')) {
          await this.pullProducts(db, runtime, forceFull);
        }
        if (collections.has('cashSessions')) {
          await this.pullCashSessions(db, runtime, forceFull);
        }
        if (collections.has('sales')) {
          await this.pullSales(db, runtime, forceFull);
        }
        if (collections.has('settings')) {
          await this.pullSettings(db, runtime);
        }
        if (collections.has('ticketRenewals')) {
          await this.pullTicketRenewals(db, runtime, forceFull);
        }

        this.queue.shift();
        this.persistQueue();
        this.lastSyncAt.set(nowIso());
        this.syncStatus.set('idle');
        this.log('sync job completed', {
          id: currentJob.id,
          reason: currentJob.reason,
          queueRemaining: this.queue.length
        });
      } catch (error) {
        this.syncStatus.set('error');
        const message = error instanceof Error ? error.message : 'Falha na sincronizacao com Firebase.';
        this.lastError.set(message);
        this.log('sync job failed', {
          id: currentJob.id,
          reason: currentJob.reason,
          error: message
        });
        console.error('[FirebaseSync]', error);
        break;
      }
    }
  }

  private async pushProducts(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const productService = this.injector.get(ProductService);
    const products = productService.getAllProducts();
    const pendingIds = this.pendingIds('products');
    const pending = products.filter((item) => pendingIds.has(item.id));
    this.log('pushProducts', {
      total: products.length,
      pending: pending.length,
      forceFull,
      pendingIds: pendingIds.size
    });

    await Promise.all(
      pending.map((product) =>
        runtime.setDoc(
          runtime.doc(this.productsCollection(db, runtime), product.id),
          sanitizeForFirestore(product),
          { merge: true }
        )
      )
    );

    this.clearPendingEntities('products', pending.map((item) => item.id));
    this.updatePushedMeta('products', maxUpdatedAt(pending));
  }

  private async pullProducts(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const productService = this.injector.get(ProductService);
    const snapshot = await runtime.getDocs(
      buildIncrementalQuery(
        this.productsCollection(db, runtime),
        forceFull ? '' : this.meta('products').lastPulledAt,
        runtime
      )
    );
    const remoteProducts = snapshot.docs.map((item) => item.data() as Product);
    this.log('pullProducts', {
      fetched: remoteProducts.length,
      forceFull,
      lastPulledAt: this.meta('products').lastPulledAt
    });
    const merged = reconcileRemoteFirst(productService.getAllProducts(), remoteProducts, this.pendingIds('products'));
    productService.replaceAllProducts(merged);
    this.updatePulledMeta('products', maxUpdatedAt(remoteProducts));
  }

  private async pushCashSessions(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const cashSessionService = this.injector.get(CashSessionService);
    const sessions = cashSessionService.getAllSessions();
    const pendingIds = this.pendingIds('cashSessions');
    const pending = sessions.filter((item) => pendingIds.has(item.id) && item.status === 'closed');
    this.log('pushCashSessions', {
      total: sessions.length,
      pending: pending.length,
      forceFull,
      pendingIds: pendingIds.size
    });

    await Promise.all(
      pending.map((session) =>
        runtime.setDoc(
          runtime.doc(this.cashSessionsCollection(db, runtime), session.id),
          sanitizeForFirestore(session),
          { merge: true }
        )
      )
    );

    this.clearPendingEntities('cashSessions', pending.map((item) => item.id));
    this.updatePushedMeta('cashSessions', maxUpdatedAt(pending));
  }

  private async pullCashSessions(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const snapshot = await runtime.getDocs(
      buildIncrementalQuery(
        this.cashSessionsCollection(db, runtime),
        forceFull ? '' : this.meta('cashSessions').lastPulledAt,
        runtime
      )
    );
    const remoteSessions = snapshot.docs.map((item) => item.data() as CashSession);
    this.log('pullCashSessions', {
      fetched: remoteSessions.length,
      forceFull,
      lastPulledAt: this.meta('cashSessions').lastPulledAt
    });
    const merged = mergeEntities(this.historySessions(), remoteSessions);
    this.historySessions.set(merged);
    this.storage.setItem(REMOTE_HISTORY_SESSIONS_KEY, merged);
    this.updatePulledMeta('cashSessions', maxUpdatedAt(remoteSessions));
  }

  private async pushSales(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const saleService = this.injector.get(SaleService);
    const cashSessionService = this.injector.get(CashSessionService);
    const sales = saleService.getAllSales();
    const pendingIds = this.pendingIds('sales');
    const pending = sales.filter((item) => {
      if (!pendingIds.has(item.id)) {
        return false;
      }

      const session = cashSessionService.getSessionById(item.cashSessionId);
      return session?.status === 'closed';
    });
    this.log('pushSales', {
      total: sales.length,
      pending: pending.length,
      forceFull,
      pendingIds: pendingIds.size
    });

    await Promise.all(
      pending.map((sale) =>
        runtime.setDoc(runtime.doc(this.salesCollection(db, runtime), sale.id), sanitizeForFirestore(sale), {
          merge: true
        })
      )
    );

    this.clearPendingEntities('sales', pending.map((item) => item.id));
    this.updatePushedMeta('sales', maxUpdatedAt(pending));
  }

  private async pullSales(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const snapshot = await runtime.getDocs(
      buildIncrementalQuery(
        this.salesCollection(db, runtime),
        forceFull ? '' : this.meta('sales').lastPulledAt,
        runtime
      )
    );
    const remoteSales = snapshot.docs.map((item) => item.data() as Sale);
    this.log('pullSales', {
      fetched: remoteSales.length,
      forceFull,
      lastPulledAt: this.meta('sales').lastPulledAt
    });
    const merged = mergeEntities(this.historySales(), remoteSales);
    this.historySales.set(merged);
    this.storage.setItem(REMOTE_HISTORY_SALES_KEY, merged);
    this.updatePulledMeta('sales', maxUpdatedAt(remoteSales));
  }

  private async pushSettings(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const settingsService = this.injector.get(SettingsService);
    const settings = settingsService.settings();
    if (!this.pendingState.settings) {
      this.log('pushSettings skipped', {
        forceFull,
        updatedAt: settings.updatedAt,
        pending: false
      });
      return;
    }

    this.log('pushSettings', {
      forceFull,
      updatedAt: settings.updatedAt
    });
    await runtime.setDoc(this.settingsDoc(db, runtime), sanitizeForFirestore(settings), { merge: true });
    this.clearSettingsPending();
    this.updatePushedMeta('settings', settings.updatedAt);
  }

  private async pushTicketRenewals(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const pendingIds = this.pendingIds('ticketRenewals');
    const renewals = this.storage.getItem<TicketRenewal[]>(TICKET_RENEWALS_KEY, []);
    const pending = renewals.filter((renewal) => pendingIds.has(renewal.id));
    this.log('pushTicketRenewals', {
      total: renewals.length,
      pending: pending.length,
      forceFull,
      pendingIds: pendingIds.size
    });

    await Promise.all(
      pending.map((renewal) =>
        runtime.setDoc(
          runtime.doc(this.ticketRenewalsCollection(db, runtime), renewal.id),
          sanitizeForFirestore(renewal),
          { merge: true }
        )
      )
    );

    this.clearPendingEntities('ticketRenewals', pending.map((item) => item.id));
    this.updatePushedMeta('ticketRenewals', maxUpdatedAt(pending));
  }

  private async pullSettings(db: Firestore, runtime: FirebaseRuntime): Promise<void> {
    const settingsService = this.injector.get(SettingsService);
    const snapshot = await runtime.getDoc(this.settingsDoc(db, runtime));
    if (!snapshot.exists()) {
      this.log('pullSettings found no remote settings');
      return;
    }

    const remoteSettings = snapshot.data() as AppSettings;
    this.log('pullSettings', {
      remoteUpdatedAt: remoteSettings.updatedAt
    });
    const localSettings = settingsService.settings();
    const winner = this.pendingState.settings
      ? compareUpdatedAt(localSettings.updatedAt, remoteSettings.updatedAt) >= 0
        ? localSettings
        : remoteSettings
      : remoteSettings;
    settingsService.replaceSettings(winner);
    this.updatePulledMeta('settings', remoteSettings.updatedAt);
  }

  private async pullTicketRenewals(db: Firestore, runtime: FirebaseRuntime, forceFull = false): Promise<void> {
    const snapshot = await runtime.getDocs(
      buildIncrementalQuery(
        this.ticketRenewalsCollection(db, runtime),
        forceFull ? '' : this.meta('ticketRenewals').lastPulledAt,
        runtime
      )
    );
    const remoteRenewals = snapshot.docs.map((item) => item.data() as TicketRenewal);
    this.log('pullTicketRenewals', {
      fetched: remoteRenewals.length,
      forceFull,
      lastPulledAt: this.meta('ticketRenewals').lastPulledAt
    });
    const merged = mergeEntities(this.historyTicketRenewals(), remoteRenewals);
    this.historyTicketRenewals.set(merged);
    this.storage.setItem(REMOTE_HISTORY_TICKET_RENEWALS_KEY, merged);
    this.updatePulledMeta('ticketRenewals', maxUpdatedAt(remoteRenewals));
  }

  private async getRuntime(): Promise<FirebaseRuntime> {
    if (this.firebaseModulesPromise) {
      return this.firebaseModulesPromise;
    }

    this.log('loading firebase runtime lazily');
    this.firebaseModulesPromise = this.loadFirebaseRuntime();
    return this.firebaseModulesPromise;
  }

  private async loadFirebaseRuntime(): Promise<FirebaseRuntime> {
    const appModule = await import('firebase/app');
    const firestoreModule = await import('firebase/firestore');

    if (this.firestore) {
      this.log('reusing existing firestore instance');
      return buildRuntime(appModule, firestoreModule, this.app!, this.firestore);
    }

    this.app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    this.firestore = firestoreModule.getFirestore(this.app);
    this.log('firebase initialized', {
      projectId: firebaseConfig.projectId
    });
    return buildRuntime(appModule, firestoreModule, this.app, this.firestore);
  }

  private rootCollection(db: Firestore, name: SyncCollectionName, runtime: FirebaseRuntime) {
    return runtime.collection(db, 'canteens', defaultCanteenId, name);
  }

  private productsCollection(db: Firestore, runtime: FirebaseRuntime) {
    return this.rootCollection(db, 'products', runtime);
  }

  private cashSessionsCollection(db: Firestore, runtime: FirebaseRuntime) {
    return this.rootCollection(db, 'cashSessions', runtime);
  }

  private salesCollection(db: Firestore, runtime: FirebaseRuntime) {
    return this.rootCollection(db, 'sales', runtime);
  }

  private ticketRenewalsCollection(db: Firestore, runtime: FirebaseRuntime) {
    return this.rootCollection(db, 'ticketRenewals', runtime);
  }

  private settingsDoc(db: Firestore, runtime: FirebaseRuntime) {
    return runtime.doc(this.rootCollection(db, 'settings', runtime), 'default');
  }

  private canteenDoc(db: Firestore, runtime: FirebaseRuntime) {
    return runtime.doc(runtime.collection(db, 'canteens'), defaultCanteenId);
  }

  private meta(collectionName: SyncCollectionName): SyncCollectionMeta {
    return this.metadata.collections[collectionName];
  }

  private updatePulledMeta(collectionName: SyncCollectionName, timestamp: string): void {
    if (!timestamp || compareUpdatedAt(timestamp, this.meta(collectionName).lastPulledAt) <= 0) {
      return;
    }

    this.metadata.collections[collectionName].lastPulledAt = timestamp;
    this.persistMeta();
  }

  private updatePushedMeta(collectionName: SyncCollectionName, timestamp: string): void {
    if (!timestamp || compareUpdatedAt(timestamp, this.meta(collectionName).lastPushedAt) <= 0) {
      return;
    }

    this.metadata.collections[collectionName].lastPushedAt = timestamp;
    this.persistMeta();
  }

  private persistMeta(): void {
    this.storage.setItem(SYNC_META_KEY, this.metadata);
  }

  private buildInitialPendingState(): PendingSyncState {
    const pendingState = normalizePendingState({
      products: [],
      cashSessions: this.storage
        .getItem<Array<{ id: string; status?: string }>>(SESSIONS_KEY, [])
        .filter((session) => session.status === 'closed')
        .map((session) => session.id),
      sales: this.storage
        .getItem<Array<{ id: string }>>(SALES_KEY, [])
        .map((sale) => sale.id),
      settings: this.storage.hasItem(SETTINGS_KEY)
      ,
      ticketRenewals: this.storage
        .getItem<Array<{ id: string }>>(TICKET_RENEWALS_KEY, [])
        .map((renewal) => renewal.id)
    });

    this.storage.setItem(SYNC_PENDING_KEY, pendingState);
    return pendingState;
  }

  private pendingIds(
    collectionName: Extract<SyncCollectionName, 'products' | 'cashSessions' | 'sales' | 'ticketRenewals'>
  ): Set<string> {
    return new Set(this.pendingState[collectionName]);
  }

  private markPendingEntity(
    collectionName: Extract<SyncCollectionName, 'products' | 'cashSessions' | 'sales' | 'ticketRenewals'>,
    entityId: string
  ): void {
    const currentIds = new Set(this.pendingState[collectionName]);
    if (currentIds.has(entityId)) {
      return;
    }

    currentIds.add(entityId);
    this.pendingState = {
      ...this.pendingState,
      [collectionName]: [...currentIds]
    };
    this.persistPendingState();
  }

  private clearPendingEntities(
    collectionName: Extract<SyncCollectionName, 'products' | 'cashSessions' | 'sales' | 'ticketRenewals'>,
    entityIds: string[]
  ): void {
    if (!entityIds.length) {
      return;
    }

    const nextIds = this.pendingState[collectionName].filter((id) => !entityIds.includes(id));
    this.pendingState = {
      ...this.pendingState,
      [collectionName]: nextIds
    };
    this.persistPendingState();
  }

  private clearSettingsPending(): void {
    if (!this.pendingState.settings) {
      return;
    }

    this.pendingState = {
      ...this.pendingState,
      settings: false
    };
    this.persistPendingState();
  }

  private persistPendingState(): void {
    this.storage.setItem(SYNC_PENDING_KEY, this.pendingState);
  }

  private async ensureCanteenRootDocument(db: Firestore, runtime: FirebaseRuntime): Promise<void> {
    const settingsService = this.injector.get(SettingsService);
    const settings = settingsService.settings();

    this.log('ensure canteen root document', {
      canteenId: defaultCanteenId,
      name: settings.canteenName
    });
    await runtime.setDoc(
      this.canteenDoc(db, runtime),
      sanitizeForFirestore({
        id: defaultCanteenId,
        name: settings.canteenName,
        updatedAt: nowIso()
      }),
      { merge: true }
    );
  }

  private enqueue(collections: SyncCollectionName[], reason: SyncReason): void {
    const normalizedCollections = [...new Set(collections)];
    const lastJob = this.queue.at(-1);

    if (
      lastJob &&
      lastJob.reason === reason &&
      sameCollections(lastJob.collections, normalizedCollections)
    ) {
      this.log('enqueue deduplicated', {
        reason,
        collections: normalizedCollections
      });
      void this.syncIncremental();
      return;
    }

    this.queue.push({
      id: crypto.randomUUID(),
      collections: normalizedCollections,
      reason,
      createdAt: nowIso()
    });
    this.persistQueue();
    this.log('enqueue', {
      reason,
      collections: normalizedCollections,
      queueSize: this.queue.length
    });
    void this.syncIncremental();
  }

  private persistQueue(): void {
    this.queueSize.set(this.queue.length);
    this.storage.setItem(SYNC_QUEUE_KEY, this.queue);
  }

  private log(message: string, details?: unknown): void {
    if (!this.debugEnabled) {
      return;
    }

    if (details === undefined) {
      console.log(`[FirebaseSync] ${message}`);
      return;
    }

    console.log(`[FirebaseSync] ${message}`, details);
  }
}

function reconcileRemoteFirst<T extends { id: string; updatedAt: string }>(
  localItems: T[],
  remoteItems: T[],
  pendingIds: Set<string>
): T[] {
  const merged = new Map<string, T>(remoteItems.map((item) => [item.id, item]));

  for (const localItem of localItems) {
    if (!pendingIds.has(localItem.id)) {
      continue;
    }

    const remoteItem = merged.get(localItem.id);
    if (!remoteItem || compareUpdatedAt(localItem.updatedAt, remoteItem.updatedAt) >= 0) {
      merged.set(localItem.id, localItem);
    }
  }

  return [...merged.values()];
}

function mergeEntities<T extends { id: string; updatedAt: string }>(localItems: T[], remoteItems: T[]): T[] {
  const merged = new Map<string, T>();

  for (const item of localItems) {
    merged.set(item.id, item);
  }

  for (const item of remoteItems) {
    const current = merged.get(item.id);
    if (!current || compareUpdatedAt(item.updatedAt, current.updatedAt) > 0) {
      merged.set(item.id, item);
    }
  }

  return [...merged.values()];
}

function maxUpdatedAt<T extends { updatedAt: string }>(items: T[]): string {
  return items.reduce((latest, item) => (compareUpdatedAt(item.updatedAt, latest) > 0 ? item.updatedAt : latest), '');
}

function isNewerThan(candidate: string, baseline: string): boolean {
  return compareUpdatedAt(candidate, baseline) > 0;
}

function compareUpdatedAt(left: string, right: string): number {
  return (left || '').localeCompare(right || '');
}

function sameCollections(left: SyncCollectionName[], right: SyncCollectionName[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((item, index) => item === rightSorted[index]);
}

function buildIncrementalQuery(
  collectionRef: CollectionReference<DocumentData, DocumentData>,
  lastPulledAt: string,
  runtime: FirebaseRuntime
) {
  if (!lastPulledAt) {
    return runtime.query(collectionRef, runtime.orderBy('updatedAt'));
  }

  return runtime.query(collectionRef, runtime.where('updatedAt', '>', lastPulledAt), runtime.orderBy('updatedAt'));
}

function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === 'object') {
    const sanitizedEntries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, sanitizeForFirestore(entryValue)]);

    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}

function normalizePendingState(value: PendingSyncState): PendingSyncState {
  return {
    products: uniqueIds(value.products),
    cashSessions: uniqueIds(value.cashSessions),
    sales: uniqueIds(value.sales),
    settings: Boolean(value.settings),
    ticketRenewals: uniqueIds(value.ticketRenewals)
  };
}

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter(Boolean))];
}

interface FirebaseRuntime {
  firestore: Firestore;
  collection: typeof import('firebase/firestore').collection;
  doc: typeof import('firebase/firestore').doc;
  getDoc: typeof import('firebase/firestore').getDoc;
  getDocs: typeof import('firebase/firestore').getDocs;
  query: typeof import('firebase/firestore').query;
  where: typeof import('firebase/firestore').where;
  orderBy: typeof import('firebase/firestore').orderBy;
  setDoc: typeof import('firebase/firestore').setDoc;
}

function buildRuntime(
  _appModule: typeof import('firebase/app'),
  firestoreModule: typeof import('firebase/firestore'),
  _app: FirebaseApp,
  firestore: Firestore
): FirebaseRuntime {
  return {
    firestore,
    collection: firestoreModule.collection,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    getDocs: firestoreModule.getDocs,
    query: firestoreModule.query,
    where: firestoreModule.where,
    orderBy: firestoreModule.orderBy,
    setDoc: firestoreModule.setDoc
  };
}
