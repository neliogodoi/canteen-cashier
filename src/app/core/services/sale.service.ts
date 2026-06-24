import { Injectable, signal } from '@angular/core';

import { CartItem, PaymentMethod, PrintStatus, Sale } from '../models/app.models';
import { nowIso } from '../utils/date.util';
import { CashSessionService } from './cash-session.service';
import { FirebaseSyncService } from './firebase-sync.service';
import { PrinterService } from './printer.service';
import { StorageService } from './storage.service';

const SALES_KEY = 'cc.sales';
type LegacySale = Omit<Sale, 'paymentMethod'> & {
  paymentMethod: Sale['paymentMethod'] | 'card';
};

@Injectable({ providedIn: 'root' })
export class SaleService {
  readonly sales = signal<Sale[]>([]);

  constructor(
    private readonly storage: StorageService,
    private readonly sessions: CashSessionService,
    private readonly printer: PrinterService,
    private readonly syncService: FirebaseSyncService
  ) {
    const storedSales = this.storage.getItem<LegacySale[]>(SALES_KEY, []);
    const normalizedSales = storedSales.map((sale) => this.normalizeSale(sale));
    this.sales.set(normalizedSales);
    this.persist();
  }

  getSalesBySession(sessionId: string): Sale[] {
    return this.sales()
      .filter((sale) => sale.cashSessionId === sessionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getAllSales(): Sale[] {
    return [...this.sales()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createSale(
    cartItems: CartItem[],
    paymentMethod: PaymentMethod,
    noteCustomerName?: string
  ): Promise<Sale> {
    const session = this.sessions.getCurrentOpenSession();
    if (!session) {
      throw new Error('Abra um caixa antes de vender.');
    }

    if (!cartItems.length) {
      throw new Error('Adicione itens ao carrinho para concluir a venda.');
    }

    const normalizedNoteCustomerName = noteCustomerName?.trim();
    if (paymentMethod === 'note' && !normalizedNoteCustomerName) {
      throw new Error('Informe o nome para registrar a nota.');
    }

    const quantities = Object.fromEntries(cartItems.map((item) => [item.productId, item.quantity]));
    const total = cartItems.reduce((sum, item) => sum + item.unitPriceInCents * item.quantity, 0);
    const updatedSession = this.sessions.registerSaleUpdate(session.id, quantities, total, paymentMethod);
    const ticketSequence = updatedSession.ticketSequence;
    const now = nowIso();

    const sale: Sale = {
      id: crypto.randomUUID(),
      cashSessionId: session.id,
      ticketNumber: `TKT${String(ticketSequence).padStart(3, '0')}`,
      operatorName: session.operatorName,
      items: cartItems.map((item) => ({
        productId: item.productId,
        productNameSnapshot: item.name,
        unitPriceSnapshot: item.unitPriceInCents,
        quantity: item.quantity,
        total: item.unitPriceInCents * item.quantity
      })),
      paymentMethod,
      noteCustomerName: normalizedNoteCustomerName,
      total,
      printStatus: 'not_requested',
      createdAt: now,
      updatedAt: now,
      reprintCount: 0
    };

    const printed = await this.printer.printSale(sale, updatedSession);
    sale.printStatus = this.resolvePrintStatus(printed);
    sale.printedAt = printed ? nowIso() : undefined;

    this.sales.update((items) => [...items, sale]);
    this.persist();
    this.syncService.enqueueSaleCreated();
    return sale;
  }

  async reprintSale(saleId: string): Promise<Sale> {
    const currentSale = this.sales().find((sale) => sale.id === saleId);
    if (!currentSale) {
      throw new Error('Venda nao encontrada.');
    }

    const session = this.sessions.getSessionById(currentSale.cashSessionId);
    if (!session) {
      throw new Error('Caixa da venda nao encontrado para reimpressao.');
    }

    const printed = await this.printer.printSale(currentSale, session, true);
    const updatedSale: Sale = {
      ...currentSale,
      printStatus: this.resolvePrintStatus(printed),
      printedAt: printed ? nowIso() : currentSale.printedAt,
      updatedAt: nowIso(),
      reprintCount: currentSale.reprintCount + 1
    };

    this.sales.update((items) => items.map((sale) => (sale.id === saleId ? updatedSale : sale)));
    this.persist();
    this.syncService.enqueueSaleReprinted();
    return updatedSale;
  }

  replaceAllSales(sales: Sale[]): void {
    this.sales.set(sales.map((sale) => this.normalizeSale(sale as LegacySale)));
    this.persist();
  }

  private resolvePrintStatus(printed: boolean): PrintStatus {
    return printed ? 'printed' : 'failed';
  }

  private normalizeSale(sale: LegacySale): Sale {
    return {
      ...sale,
      paymentMethod: sale.paymentMethod === 'card' ? 'note' : sale.paymentMethod,
      total: toNumber(sale.total),
      items: sale.items.map((item) => ({
        ...item,
        unitPriceSnapshot: toNumber(item.unitPriceSnapshot),
        quantity: toNumber(item.quantity),
        total: toNumber(item.total)
      })),
      noteCustomerName: sale.noteCustomerName?.trim() || undefined
    };
  }

  private persist(): void {
    this.storage.setItem(SALES_KEY, this.sales());
  }
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
