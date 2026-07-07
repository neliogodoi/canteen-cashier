import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { PaymentMethod, Sale } from '../../core/models/app.models';
import { FirebaseSyncService } from '../../core/services/firebase-sync.service';
import { TicketRenewalService } from '../../core/services/ticket-renewal.service';
import { centsToCurrency } from '../../core/utils/money.util';

@Component({
  selector: 'app-monthly-report-page',
  imports: [RouterLink, FormsModule],
  template: `
    <section class="page-head">
      <div>
        <p class="eyebrow">Relatorios</p>
        <h1>Vendas do mes</h1>
      </div>
      <div class="head-actions">
        <input type="month" [ngModel]="selectedMonth()" (ngModelChange)="selectedMonth.set($event)" />
        <a class="button secondary" routerLink="/history">Historico</a>
      </div>
    </section>

    <section class="summary-grid">
      <article class="card summary-card">
        <span>Total vendido</span>
        <strong>{{ formatMoney(report().grossTotal) }}</strong>
      </article>
      <article class="card summary-card">
        <span>Vendas</span>
        <strong>{{ report().salesCount }}</strong>
      </article>
      <article class="card summary-card">
        <span>Caixas com venda</span>
        <strong>{{ report().sessionsCount }}</strong>
      </article>
      <article class="card summary-card">
        <span>Ticket medio</span>
        <strong>{{ formatMoney(report().averageTicket) }}</strong>
      </article>
      <article class="card summary-card">
        <span>Tickets renovados</span>
        <strong>{{ report().renewedTicketsCount }}</strong>
      </article>
    </section>

    <section class="details-grid">
      <article class="card">
        <h2>Pagamentos</h2>
        <div class="rows">
          <div class="row">
            <span>Dinheiro</span>
            <strong>{{ formatMoney(report().payments.cash) }}</strong>
          </div>
          <div class="row">
            <span>Pix</span>
            <strong>{{ formatMoney(report().payments.pix) }}</strong>
          </div>
          <div class="row">
            <span>Nota</span>
            <strong>{{ formatMoney(report().payments.note) }}</strong>
          </div>
        </div>
      </article>

      <article class="card">
        <h2>Notas em aberto</h2>
        <div class="rows">
          @for (note of report().notes; track note.saleId) {
            <div class="row">
              <div>
                <strong>{{ note.customerName }}</strong>
                <small>{{ note.ticketNumber }}</small>
              </div>
              <strong>{{ formatMoney(note.total) }}</strong>
            </div>
          } @empty {
            <p class="muted">Nenhuma venda em nota neste mes.</p>
          }
        </div>
      </article>

      <article class="card wide">
        <h2>Produtos mais vendidos</h2>
        <div class="rows">
          @for (product of report().topProducts; track product.name) {
            <div class="row">
              <div>
                <strong>{{ product.name }}</strong>
                <small>{{ product.quantity }} unidades</small>
              </div>
              <strong>{{ formatMoney(product.total) }}</strong>
            </div>
          } @empty {
            <p class="muted">Sem vendas registradas neste mes.</p>
          }
        </div>
      </article>

      <article class="card wide">
        <h2>Resumo por dia</h2>
        <div class="rows">
          @for (day of report().dailyTotals; track day.date) {
            <div class="row">
              <div>
                <strong>{{ day.label }}</strong>
                <small>{{ day.salesCount }} vendas</small>
              </div>
              <strong>{{ formatMoney(day.total) }}</strong>
            </div>
          } @empty {
            <p class="muted">Sem movimento neste mes.</p>
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

    .head-actions {
      flex-wrap: wrap;
      align-items: center;
    }

    .head-actions input {
      width: auto;
      min-width: 10.5rem;
      min-height: 2.8rem;
      padding: 0.75rem 1rem;
    }

    .head-actions .button,
    .head-actions .button:visited {
      min-height: 2.8rem;
      width: auto;
      padding-inline: 1rem;
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

    .summary-grid,
    .details-grid {
      display: grid;
      gap: 0.85rem;
    }

    .summary-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      margin-bottom: 0.85rem;
    }

    .summary-card {
      padding: 0.95rem 1rem;
    }

    .summary-card span,
    .summary-card strong,
    .row small {
      display: block;
    }

    .summary-card strong {
      font-size: 1.25rem;
      margin-top: 0.25rem;
    }

    .details-grid {
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      align-items: start;
    }

    .wide {
      grid-column: span 2;
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

    .row:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }

    @media (max-width: 900px) {
      .wide {
        grid-column: auto;
      }
    }

    @media (max-width: 640px) {
      .head-actions {
        width: 100%;
      }

      .head-actions input,
      .head-actions .button,
      .head-actions .button:visited {
        width: 100%;
      }
    }
  `
})
export class MonthlyReportPageComponent {
  private readonly syncService = inject(FirebaseSyncService);
  private readonly ticketRenewalService = inject(TicketRenewalService);
  readonly selectedMonth = signal(currentMonthValue());
  readonly sales = computed(() => this.syncService.getAllHistorySales());
  readonly renewals = computed(() => this.ticketRenewalService.allRenewals());
  readonly report = computed(() => buildMonthlyReport(this.sales(), this.renewals(), this.selectedMonth()));

  formatMoney(value: number): string {
    return centsToCurrency(value);
  }
}

function buildMonthlyReport(
  sales: Sale[],
  renewals: Array<{ renewedAt: string }>,
  selectedMonth: string
) {
  const filteredSales = sales.filter((sale) => sale.createdAt.slice(0, 7) === selectedMonth);
  const filteredRenewals = renewals.filter((renewal) => renewal.renewedAt.slice(0, 7) === selectedMonth);
  const sessionIds = new Set(filteredSales.map((sale) => sale.cashSessionId));
  const grossTotal = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const payments: Record<PaymentMethod, number> = { cash: 0, pix: 0, note: 0 };
  const topProductsMap = new Map<string, { name: string; quantity: number; total: number }>();
  const dailyMap = new Map<string, { date: string; total: number; salesCount: number }>();

  for (const sale of filteredSales) {
    payments[sale.paymentMethod] += sale.total;

    const date = sale.createdAt.slice(0, 10);
    const day = dailyMap.get(date) ?? { date, total: 0, salesCount: 0 };
    day.total += sale.total;
    day.salesCount += 1;
    dailyMap.set(date, day);

    for (const item of sale.items) {
      const current = topProductsMap.get(item.productNameSnapshot) ?? {
        name: item.productNameSnapshot,
        quantity: 0,
        total: 0
      };
      current.quantity += item.quantity;
      current.total += item.total;
      topProductsMap.set(item.productNameSnapshot, current);
    }
  }

  return {
    grossTotal,
    salesCount: filteredSales.length,
    sessionsCount: sessionIds.size,
    averageTicket: filteredSales.length ? Math.round(grossTotal / filteredSales.length) : 0,
    renewedTicketsCount: filteredRenewals.length,
    payments,
    notes: filteredSales
      .filter((sale) => sale.paymentMethod === 'note')
      .map((sale) => ({
        saleId: sale.id,
        ticketNumber: sale.ticketNumber,
        customerName: sale.noteCustomerName || 'Sem nome',
        total: sale.total
      })),
    topProducts: [...topProductsMap.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total),
    dailyTotals: [...dailyMap.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((day) => ({
        ...day,
        label: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${day.date}T12:00:00`))
      }))
  };
}

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
