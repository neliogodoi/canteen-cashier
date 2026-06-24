import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CashSessionService } from '../../core/services/cash-session.service';
import { centsToCurrency } from '../../core/utils/money.util';

@Component({
  selector: 'app-close-cash-page',
  imports: [RouterLink],
  template: `
    @if (session(); as currentSession) {
      <section class="card close-card">
        <p class="eyebrow">Fechamento</p>
        <h1>Fechar caixa de {{ currentSession.operatorName }}</h1>
        <p class="muted">Revise os totais antes de confirmar. Esta acao nao podera ser desfeita no MVP.</p>

        <div class="summary-grid">
          <article class="summary-card">
            <span>Total geral</span>
            <strong>{{ formatMoney(currentSession.totals.grossTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span>Vendas</span>
            <strong>{{ currentSession.totals.salesCount }}</strong>
          </article>
          <article class="summary-card">
            <span>Produtos restantes</span>
            <strong>{{ remainingProducts() }}</strong>
          </article>
        </div>

        <div class="button-row">
          <button type="button" class="button" (click)="close()">Confirmar fechamento</button>
          <a class="button secondary" [routerLink]="['/cash', currentSession.id]">Cancelar</a>
        </div>
      </section>
    }
  `,
  styles: `
    .close-card {
      max-width: 760px;
      margin: 0 auto;
    }

    .eyebrow {
      margin: 0 0 0.35rem;
      color: var(--brand-strong);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.8rem;
    }

    h1 {
      margin-top: 0;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin: 1rem 0 1.25rem;
    }

    .summary-card {
      padding: 1rem;
      border-radius: 1rem;
      background: rgba(47, 95, 62, 0.08);
    }

    .summary-card span,
    .summary-card strong {
      display: block;
    }
  `
})
export class CloseCashPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cashSessionService = inject(CashSessionService);
  readonly sessionId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly session = computed(() => this.cashSessionService.getSessionById(this.sessionId));
  readonly remainingProducts = computed(() =>
    (this.session()?.products ?? []).reduce((sum, item) => sum + item.quantityPrepared - item.quantitySold, 0)
  );

  formatMoney(value: number): string {
    return centsToCurrency(value);
  }

  close(): void {
    const session = this.session();
    if (!session) {
      return;
    }

    this.cashSessionService.closeSession(session.id);
    void this.router.navigate(['/cash', session.id]);
  }
}
