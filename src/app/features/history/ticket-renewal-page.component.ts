import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TicketRenewalService } from '../../core/services/ticket-renewal.service';
import { centsToCurrency } from '../../core/utils/money.util';
import { formatDateTime } from '../../core/utils/date.util';

@Component({
  selector: 'app-ticket-renewal-page',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page-head">
      <div>
        <p class="eyebrow">Tickets</p>
        <h1>Renovar ticket</h1>
      </div>
      <div class="head-actions">
        <a class="button secondary" routerLink="/history">Historico</a>
      </div>
    </section>

    <section class="details-grid">
      <article class="card">
        <h2>Leitura</h2>
        <p class="muted">Escaneie o QR no campo abaixo ou cole o codigo do ticket.</p>

        <div class="scanner-form">
          <input
            type="text"
            placeholder="CC:token-do-ticket"
            [ngModel]="ticketCode()"
            (ngModelChange)="ticketCode.set($event)"
          />
          <button type="button" class="button" (click)="lookupTicket()">Buscar ticket</button>
        </div>

        @if (scanMessage()) {
          <p class="notice">{{ scanMessage() }}</p>
        }

        @if (matchedSale(); as match) {
          <div class="match-card">
            <strong>{{ match.sale.ticketNumber }}</strong>
            <span>{{ match.sale.operatorName }}</span>
            <span>{{ formatMoney(match.sale.total) }}</span>
            <small>{{ formatDate(match.sale.createdAt) }}</small>
            <button type="button" class="button" (click)="renewTicket()">Renovar e imprimir</button>
          </div>
        }
      </article>

      <article class="card">
        <h2>Renovacoes recentes</h2>
        <div class="rows">
          @for (renewal of recentRenewals(); track renewal.id) {
            <div class="row">
              <div>
                <strong>{{ renewal.ticketNumber }}</strong>
                <small>{{ renewal.operatorName }}</small>
              </div>
              <small>{{ formatDate(renewal.renewedAt) }}</small>
            </div>
          } @empty {
            <p class="muted">Nenhum ticket renovado ainda.</p>
          }
        </div>
      </article>
    </section>
  `,
  styles: `
    .page-head,
    .head-actions,
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .page-head {
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .details-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      align-items: start;
    }

    .scanner-form {
      display: grid;
      gap: 0.75rem;
      margin-top: 0.8rem;
    }

    .rows {
      display: grid;
      gap: 0.8rem;
      margin-top: 0.8rem;
    }

    .row {
      padding-bottom: 0.75rem;
      border-bottom: 1px solid rgba(47, 95, 62, 0.08);
    }

    .match-card {
      display: grid;
      gap: 0.35rem;
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 1rem;
      background: rgba(47, 95, 62, 0.08);
    }

    .notice {
      margin: 0.9rem 0 0;
      padding: 0.85rem 1rem;
      border-radius: 1rem;
      background: rgba(47, 95, 62, 0.08);
      color: var(--brand-strong);
      font-weight: 600;
    }

    .eyebrow {
      margin: 0 0 0.35rem;
      color: var(--brand-strong);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.8rem;
    }

    h1,
    h2,
    p {
      margin: 0;
    }
  `
})
export class TicketRenewalPageComponent {
  private readonly ticketRenewalService = inject(TicketRenewalService);

  readonly ticketCode = signal('');
  readonly scanMessage = signal('');
  readonly matchedSale = signal<ReturnType<TicketRenewalService['findSaleByCode']>>(null);
  readonly recentRenewals = computed(() => this.ticketRenewalService.allRenewals().slice(0, 12));

  lookupTicket(): void {
    const match = this.ticketRenewalService.findSaleByCode(this.ticketCode());
    this.matchedSale.set(match);
    this.scanMessage.set(match ? '' : 'Nenhum ticket encontrado para esse codigo.');
  }

  async renewTicket(): Promise<void> {
    try {
      const renewal = await this.ticketRenewalService.renewByCode(this.ticketCode());
      this.scanMessage.set(`Ticket ${renewal.ticketNumber} renovado com sucesso.`);
      this.matchedSale.set(this.ticketRenewalService.findSaleByCode(this.ticketCode()));
    } catch (error) {
      this.scanMessage.set(error instanceof Error ? error.message : 'Nao foi possivel renovar o ticket.');
    }
  }

  formatMoney(value: number): string {
    return centsToCurrency(value);
  }

  formatDate(value: string): string {
    return formatDateTime(value);
  }
}
