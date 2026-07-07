import { Injectable, computed, signal } from '@angular/core';

import { CashSession, Sale, TicketRenewal } from '../models/app.models';
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
    this.renewals.set(this.storage.getItem<TicketRenewal[]>(TICKET_RENEWALS_KEY, []));
    this.persist();
  }

  findSaleByCode(rawCode: string): { sale: Sale; session: CashSession } | null {
    const ticketToken = parseTicketQrPayload(rawCode);
    if (!ticketToken) {
      return null;
    }

    const localSale = this.saleService.findLocalSaleByTicketToken(ticketToken);
    if (localSale) {
      const localSession = this.cashSessionService.getSessionById(localSale.cashSessionId);
      if (localSession) {
        return { sale: localSale, session: localSession };
      }
    }

    const historySale = this.syncService.getHistorySaleByTicketToken(ticketToken);
    if (!historySale) {
      return null;
    }

    const historySession = this.syncService.getHistorySessionById(historySale.cashSessionId);
    if (!historySession) {
      return null;
    }

    return { sale: historySale, session: historySession };
  }

  async renewByCode(rawCode: string): Promise<TicketRenewal> {
    const match = this.findSaleByCode(rawCode);
    if (!match) {
      throw new Error('Ticket nao encontrado.');
    }

    const { sale, session } = match;
    const printed = await this.printer.printSale(sale, session, { headerTag: 'TICKET RENOVADO' });
    if (!printed) {
      throw new Error('Falha ao imprimir o ticket renovado.');
    }

    const now = nowIso();
    const renewal: TicketRenewal = {
      id: crypto.randomUUID(),
      saleId: sale.id,
      cashSessionId: sale.cashSessionId,
      ticketNumber: sale.ticketNumber,
      ticketToken: sale.ticketToken,
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
