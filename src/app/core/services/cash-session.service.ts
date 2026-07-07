import { Injectable, signal } from '@angular/core';

import {
  CashSession,
  CashSessionProduct,
  OpenSessionInput,
  PaymentMethod,
  SessionSummary
} from '../models/app.models';
import { currentBusinessDate, nowIso } from '../utils/date.util';
import { FirebaseSyncService } from './firebase-sync.service';
import { StorageService } from './storage.service';
import { ProductService } from './product.service';

const SESSIONS_KEY = 'cc.sessions';
type LegacyCashSession = CashSession & {
  totals: CashSession['totals'] & { cardTotal?: number };
};

@Injectable({ providedIn: 'root' })
export class CashSessionService {
  readonly sessions = signal<CashSession[]>([]);

  constructor(
    private readonly storage: StorageService,
    private readonly productService: ProductService,
    private readonly syncService: FirebaseSyncService
  ) {
    const storedSessions = this.storage.getItem<LegacyCashSession[]>(SESSIONS_KEY, []);
    const normalizedSessions = storedSessions.map((session) => this.normalizeSession(session));
    this.sessions.set(normalizedSessions);
    this.persist();
  }

  getAllSessions(): CashSession[] {
    return [...this.sessions()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  getCurrentOpenSession(): CashSession | null {
    return this.sessions().find((session) => session.status === 'open') ?? null;
  }

  getSessionById(id: string): CashSession | undefined {
    return this.sessions().find((session) => session.id === id);
  }

  openSession(input: OpenSessionInput): CashSession {
    if (this.getCurrentOpenSession()) {
      throw new Error('Ja existe um caixa aberto neste dispositivo.');
    }

    const selectedProducts = input.products
      .filter((item) => item.quantityPrepared > 0)
      .map((item) => {
        const product = this.productService.getProductById(item.productId);
        if (!product) {
          throw new Error('Produto selecionado nao encontrado.');
        }

        const timestamp = nowIso();
        return {
          id: crypto.randomUUID(),
          cashSessionId: 'pending',
          productId: product.id,
          productNameSnapshot: product.name,
          productPriceSnapshot: product.priceInCents,
          quantityPrepared: item.quantityPrepared,
          quantitySold: 0,
          activeInSession: true,
          createdAt: timestamp,
          updatedAt: timestamp
        } satisfies CashSessionProduct;
      });

    if (!selectedProducts.length) {
      throw new Error('Informe ao menos um produto com quantidade preparada maior que zero.');
    }

    const now = nowIso();
    const sessionId = crypto.randomUUID();
    const session: CashSession = {
      id: sessionId,
      date: currentBusinessDate(),
      operatorName: input.operatorName.trim(),
      status: 'open',
      openedAt: now,
      printerStatusAtOpen: input.printerStatusAtOpen,
      ticketSequence: 0,
      totals: {
        grossTotal: 0,
        cashTotal: 0,
        pixTotal: 0,
        noteTotal: 0,
        salesCount: 0
      },
      products: selectedProducts.map((item) => ({ ...item, cashSessionId: sessionId })),
      createdAt: now,
      updatedAt: now
    };

    this.sessions.update((items) => [...items, session]);
    this.persist();
    return session;
  }

  registerSaleUpdate(sessionId: string, quantities: Record<string, number>, total: number, paymentMethod: PaymentMethod): CashSession {
    const session = this.getSessionById(sessionId);
    if (!session || session.status !== 'open') {
      throw new Error('Nao ha caixa aberto para registrar a venda.');
    }

    const nextProducts = session.products.map((item) => {
      const soldNow = quantities[item.productId] ?? 0;
      const nextSold = item.quantitySold + soldNow;

      if (nextSold > item.quantityPrepared) {
        throw new Error(`Quantidade indisponivel para ${item.productNameSnapshot}.`);
      }

      return {
        ...item,
        quantitySold: nextSold,
        updatedAt: nowIso()
      };
    });

    const updatedSession: CashSession = {
      ...session,
      ticketSequence: session.ticketSequence + 1,
      totals: {
        grossTotal: session.totals.grossTotal + total,
        cashTotal: session.totals.cashTotal + (paymentMethod === 'cash' ? total : 0),
        pixTotal: session.totals.pixTotal + (paymentMethod === 'pix' ? total : 0),
        noteTotal: session.totals.noteTotal + (paymentMethod === 'note' ? total : 0),
        salesCount: session.totals.salesCount + 1
      },
      products: nextProducts,
      updatedAt: nowIso()
    };

    this.replaceSession(updatedSession);
    return updatedSession;
  }

  closeSession(sessionId: string): CashSession {
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error('Caixa nao encontrado.');
    }

    const updatedSession: CashSession = {
      ...session,
      status: 'closed',
      closedAt: nowIso(),
      updatedAt: nowIso()
    };

    this.replaceSession(updatedSession);
    this.syncService.prepareClosedSessionExport(updatedSession.id);
    return updatedSession;
  }

  getSummary(sessionId: string, salesTotals: Array<{ paymentMethod: PaymentMethod; total: number }>): SessionSummary {
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error('Caixa nao encontrado.');
    }

    const preparedCount = session.products.reduce((sum, item) => sum + item.quantityPrepared, 0);
    const soldCount = session.products.reduce((sum, item) => sum + item.quantitySold, 0);

    return {
      session,
      sales: [],
      totalsByPayment: salesTotals.reduce<Record<PaymentMethod, number>>(
        (totals, sale) => ({
          ...totals,
          [sale.paymentMethod]: totals[sale.paymentMethod] + sale.total
        }),
        { cash: 0, pix: 0, note: 0 }
      ),
      preparedCount,
      soldCount,
      remainingCount: preparedCount - soldCount
    };
  }

  private replaceSession(updatedSession: CashSession): void {
    this.sessions.update((items) => items.map((session) => (session.id === updatedSession.id ? updatedSession : session)));
    this.persist();
  }

  replaceAllSessions(sessions: CashSession[]): void {
    this.sessions.set(sessions.map((session) => this.normalizeSession(session)));
    this.persist();
  }

  private normalizeSession(session: LegacyCashSession): CashSession {
    const noteTotal = toNumber(session.totals.noteTotal ?? session.totals.cardTotal);

    return {
      ...session,
      totals: {
        grossTotal: toNumber(session.totals.grossTotal),
        cashTotal: toNumber(session.totals.cashTotal),
        pixTotal: toNumber(session.totals.pixTotal),
        noteTotal,
        salesCount: toNumber(session.totals.salesCount)
      }
    };
  }

  private persist(): void {
    this.storage.setItem(SESSIONS_KEY, this.sessions());
  }
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
