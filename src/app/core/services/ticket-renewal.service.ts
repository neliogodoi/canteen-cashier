import { Injectable, computed, signal } from '@angular/core';

import { CashSession, Sale, SaleTicketUnit, TicketRenewal } from '../models/app.models';
import { nowIso } from '../utils/date.util';
import { parseTicketQrPayload } from '../utils/ticket.util';
import { CashSessionService } from './cash-session.service';
import { FirebaseSyncService } from './firebase-sync.service';
import { PrinterService } from './printer.service';
import { SaleService } from './sale.service';
import { StorageService } from './storage.service';

const TICKET_RENEWALS_KEY = 'cc.ticket-renewals';

@Injectable({ providedIn: 'root' })
export class TicketRenewalService {
  readonly renewals = signal<TicketRenewal[]>([]);
  readonly allRenewals = computed(() => {
    const merged = new Map<string, TicketRenewal>();

    for (const renewal of this.syncService.getHistoryTicketRenewals()) {
      merged.set(renewal.id, renewal);
    }

    for (const renewal of this.renewals()) {
      merged.set(renewal.id, renewal);
    }

    return [...merged.values()].sort((a, b) => b.renewedAt.localeCompare(a.renewedAt));
  });

  constructor(
    private readonly storage: StorageService,
    private readonly saleService: SaleService,
    private readonly cashSessionService: CashSessionService,
    private readonly syncService: FirebaseSyncService,
    private readonly printer: PrinterService
  ) {
    this.renewals.set(this.storage.getItem<TicketRenewal[]>(TICKET_RENEWALS_KEY, []).map((renewal) => normalizeRenewal(renewal)));
    this.persist();
  }

  findSaleByCode(rawCode: string): { sale: Sale; session: CashSession; ticketUnit: SaleTicketUnit } | null {
    const ticketToken = parseTicketQrPayload(rawCode);
    if (!ticketToken) {
      return null;
    }

    const localMatch = this.saleService.findLocalTicketUnitByTicketToken(ticketToken);
    if (localMatch) {
      const localSession = this.cashSessionService.getSessionById(localMatch.sale.cashSessionId);
      if (localSession) {
        return { sale: localMatch.sale, session: localSession, ticketUnit: localMatch.ticketUnit };
      }
    }

    const historyMatch = this.syncService.getHistorySaleByTicketToken(ticketToken);
    if (!historyMatch) {
      return null;
    }

    const historySession = this.syncService.getHistorySessionById(historyMatch.sale.cashSessionId);
    if (!historySession) {
      return null;
    }

    return { sale: historyMatch.sale, session: historySession, ticketUnit: historyMatch.ticketUnit };
  }

  async renewByCode(rawCode: string): Promise<TicketRenewal> {
    const match = this.findSaleByCode(rawCode);
    if (!match) {
      throw new Error('Ticket nao encontrado.');
    }

    const { sale, session, ticketUnit } = match;
    const printed = await this.printer.printTicketUnit(sale, ticketUnit, session, { headerTag: 'TICKET RENOVADO' });
    if (!printed) {
      throw new Error('Falha ao imprimir o ticket renovado.');
    }

    const now = nowIso();
    const renewal: TicketRenewal = {
      id: crypto.randomUUID(),
      saleId: sale.id,
      cashSessionId: sale.cashSessionId,
      ticketNumber: ticketUnit.ticketNumber,
      ticketUnitId: ticketUnit.id,
      ticketToken: ticketUnit.ticketToken,
      productNameSnapshot: ticketUnit.productNameSnapshot,
      unitPriceSnapshot: ticketUnit.unitPriceSnapshot,
      operatorName: session.operatorName,
      renewedAt: now,
      createdAt: now,
      updatedAt: now
    };

    this.renewals.update((items) => [...items, renewal]);
    this.persist();
    this.syncService.markTicketRenewalPending(renewal.id);
    this.syncService.enqueueTicketRenewalChanged();
    return renewal;
  }

  getLocalRenewals(): TicketRenewal[] {
    return [...this.renewals()].sort((a, b) => b.renewedAt.localeCompare(a.renewedAt));
  }

  private persist(): void {
    this.storage.setItem(TICKET_RENEWALS_KEY, this.renewals());
  }
}

function normalizeRenewal(renewal: TicketRenewal): TicketRenewal {
  return {
    ...renewal,
    ticketUnitId: renewal.ticketUnitId || renewal.id,
    productNameSnapshot: renewal.productNameSnapshot || 'Item',
    unitPriceSnapshot:
      typeof renewal.unitPriceSnapshot === 'number' && Number.isFinite(renewal.unitPriceSnapshot)
        ? renewal.unitPriceSnapshot
        : 0
  };
}
