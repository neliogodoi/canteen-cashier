import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FirebaseSyncService } from '../../core/services/firebase-sync.service';
import { centsToCurrency } from '../../core/utils/money.util';
import { formatDateTime } from '../../core/utils/date.util';

@Component({
	selector: 'app-history-page',
	imports: [RouterLink],
	template: `
    <section class="page-head">
      <div>
        <p class="eyebrow">Consulta</p>
        <h1>Historico de caixas</h1>
      </div>
      <div class="head-actions">
        <a class="button ghost" routerLink="/tickets/renew">Renovar ticket</a>
        <a class="button secondary" routerLink="/reports/monthly">Relatorio mensal</a>
      </div>
    </section>

    <section class="history-list">
      @for (session of sessions(); track session.id) {
        <a class="card history-card" [routerLink]="['/cash', session.id]">
          <div class="line">
            <strong>{{ session.operatorName }}</strong>
            <span class="badge" [class.closed]="session.status === 'closed'">
              {{ session.status === 'open' ? 'Aberto' : 'Fechado' }}
            </span>
          </div>
          <span class="muted">{{ formatDate(session.openedAt) }}</span>
          <strong>{{ formatMoney(session.totals.grossTotal) }}</strong>
          <small>{{ session.totals.salesCount }} vendas</small>
        </a>
      } @empty {
        <article class="card">
          <h2>Sem historico</h2>
          <p class="muted">As sessoes de caixa aparecerao aqui.</p>
        </article>
      }
    </section>
  `,
	styles: `
    .page-head,
    .line,
    .head-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .page-head {
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .head-actions .button,
    .head-actions .button:visited {
      width: auto;
      min-height: 2.8rem;
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
    h2 {
      margin: 0;
    }

    .history-list {
      display: grid;
      gap: 1rem;
    }

    .history-card {
      text-decoration: none;
      color: inherit;
      display: grid;
      gap: 0.5rem;
    }

    .badge {
      padding: 0.3rem 0.65rem;
      border-radius: 999px;
      background: rgba(132, 132, 132, 0.25);
      font-size: 0.78rem;
      font-weight: 700;
    }

    .badge.closed {
      background: rgba(69, 69, 69, 0.12);
      color: var(--brand-strong);
    }

    @media (max-width: 640px) {
      .head-actions {
        width: 100%;
      }

      .head-actions .button,
      .head-actions .button:visited {
        width: 100%;
      }
    }
  `
})
export class HistoryPageComponent {
	private readonly syncService = inject(FirebaseSyncService);
	readonly sessions = computed(() => this.syncService.getHistorySessions());

	formatMoney(value: number): string {
		return centsToCurrency(value);
	}

	formatDate(value: string): string {
		return formatDateTime(value);
	}
}
