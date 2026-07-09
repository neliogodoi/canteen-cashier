import { Injectable, signal } from '@angular/core';

import { CartItem, PaymentMethod, PrintStatus, Sale, SaleTicketUnit } from '../models/app.models';
import { nowIso } from '../utils/date.util';
import { buildTicketUnits } from '../utils/ticket.util';
import { CashSessionService } from './cash-session.service';
import { FirebaseSyncService } from './firebase-sync.service';
import { PrinterService } from './printer.service';
import { StorageService } from './storage.service';

const SALES_KEY = 'cc.sales';
type LegacySale = Omit<Sale, 'paymentMethod'> & {
  paymentMethod: Sale['paymentMethod'] | 'card';
  ticketToken?: string;
  ticketUnits?: SaleTicketUnit[];
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

  findLocalSaleByTicketToken(ticketToken: string): Sale | undefined {
    return this.sales().find(
      (sale) => sale.ticketToken === ticketToken || sale.ticketUnits.some((ticketUnit) => ticketUnit.ticketToken === ticketToken)
    );
  }

  findLocalTicketUnitByTicketToken(ticketToken: string): { sale: Sale; ticketUnit: SaleTicketUnit } | null {
    for (const sale of this.sales()) {
      const ticketUnit = sale.ticketUnits.find((unit) => unit.ticketToken === ticketToken);
      if (ticketUnit) {
        return { sale, ticketUnit };
      }
    }

    return null;
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

    const saleId = crypto.randomUUID();
    const ticketNumber = `TKT${String(ticketSequence).padStart(3, '0')}`;
    const sale: Sale = {
      id: saleId,
      cashSessionId: session.id,
      ticketNumber,
      ticketToken: crypto.randomUUID(),
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
      ticketUnits: [],
      printStatus: 'not_requested',
      createdAt: now,
      updatedAt: now,
      reprintCount: 0
    };
    sale.ticketUnits = buildTicketUnits(sale.id, sale.ticketNumber, now, sale.items);

    const printed = await this.printer.printSale(sale, updatedSession);
    sale.printStatus = this.resolvePrintStatus(printed);
    sale.printedAt = printed ? nowIso() : undefined;

    this.sales.update((items) => [...items, sale]);
    this.persist();
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

    const printed = await this.printer.printSale(currentSale, session, { isReprint: true });
    const updatedSale: Sale = {
      ...currentSale,
      printStatus: this.resolvePrintStatus(printed),
      printedAt: printed ? nowIso() : currentSale.printedAt,
      updatedAt: nowIso(),
      reprintCount: currentSale.reprintCount + 1
    };

    this.sales.update((items) => items.map((sale) => (sale.id === saleId ? updatedSale : sale)));
    this.persist();
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
    const normalizedItems = sale.items.map((item) => ({
      ...item,
      unitPriceSnapshot: toNumber(item.unitPriceSnapshot),
      quantity: toNumber(item.quantity),
      total: toNumber(item.total)
    }));
    const ticketUnits = normalizeTicketUnits(sale, normalizedItems);

    return {
      ...sale,
      ticketToken: sale.ticketToken || crypto.randomUUID(),
      paymentMethod: sale.paymentMethod === 'card' ? 'note' : sale.paymentMethod,
      total: toNumber(sale.total),
      items: normalizedItems,
      ticketUnits,
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

function normalizeTicketUnits(sale: LegacySale, items: Sale['items']): SaleTicketUnit[] {
  if (Array.isArray(sale.ticketUnits) && sale.ticketUnits.length > 0) {
    return sale.ticketUnits.map((ticketUnit, index) => ({
      ...ticketUnit,
      id: ticketUnit.id || crypto.randomUUID(),
      saleId: ticketUnit.saleId || sale.id,
      saleItemIndex: toNumber(ticketUnit.saleItemIndex),
      unitIndex: toNumber(ticketUnit.unitIndex),
      ticketNumber: ticketUnit.ticketNumber || `${sale.ticketNumber}-${String(index + 1).padStart(2, '0')}`,
      ticketToken: ticketUnit.ticketToken || crypto.randomUUID(),
      productId: ticketUnit.productId,
      productNameSnapshot: ticketUnit.productNameSnapshot,
      unitPriceSnapshot: toNumber(ticketUnit.unitPriceSnapshot),
      createdAt: ticketUnit.createdAt || sale.createdAt,
      updatedAt: ticketUnit.updatedAt || sale.updatedAt || sale.createdAt
    }));
  }

  if (sale.ticketToken) {
    return [
      {
        id: crypto.randomUUID(),
        saleId: sale.id,
        saleItemIndex: 0,
        unitIndex: 0,
        ticketNumber: sale.ticketNumber,
        ticketToken: sale.ticketToken,
        productId: items[0]?.productId || sale.id,
        productNameSnapshot: items.length === 1 ? items[0].productNameSnapshot : `${items.length} itens`,
        unitPriceSnapshot: items.length === 1 ? items[0].unitPriceSnapshot : toNumber(sale.total),
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt || sale.createdAt
      }
    ];
  }

  return buildTicketUnits(sale.id, sale.ticketNumber, sale.createdAt, items);
}
