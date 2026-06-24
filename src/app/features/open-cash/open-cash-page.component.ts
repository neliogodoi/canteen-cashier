import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ProductService } from '../../core/services/product.service';
import { CashSessionService } from '../../core/services/cash-session.service';
import { PrinterService } from '../../core/services/printer.service';
import { centsToCurrency } from '../../core/utils/money.util';

@Component({
  selector: 'app-open-cash-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="card form-card">
      <div class="header">
        <div>
          <p class="eyebrow">Sessao do dia</p>
          <h1>Abrir caixa</h1>
        </div>
        <a class="button secondary" routerLink="/home">Voltar</a>
      </div>

      @if (currentSession(); as session) {
        <div class="warning">
          Ja existe um caixa aberto para {{ session.operatorName }}.
          <a routerLink="/cash/current">Continuar caixa</a>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="openSession()">
          <label>
            Operador
            <input type="text" formControlName="operatorName" placeholder="Nome do operador" />
          </label>

          <div class="product-list">
            @for (product of products(); track product.id) {
              <label class="product-row">
                <div>
                  <strong>{{ product.name }}</strong>
                  <span>{{ formatMoney(product.priceInCents) }}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  [value]="quantities()[product.id] ?? 0"
                  (input)="setQuantity(product.id, $any($event.target).valueAsNumber || 0)"
                />
              </label>
            }
          </div>

          @if (errorMessage) {
            <p class="error">{{ errorMessage }}</p>
          }

          <button type="submit" class="button">Abrir caixa</button>
        </form>
      }
    </section>
  `,
  styles: `
    .form-card {
      max-width: 760px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1rem;
      flex-wrap: wrap;
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
      margin: 0;
    }

    form {
      display: grid;
      gap: 1rem;
    }

    label {
      display: grid;
      gap: 0.5rem;
      font-weight: 600;
    }

    .product-list {
      display: grid;
      gap: 0.8rem;
    }

    .product-row {
      grid-template-columns: 1fr 120px;
      align-items: center;
      padding: 0.9rem 1rem;
      border-radius: 1rem;
      background: rgba(53, 94, 71, 0.08);
    }

    .product-row span {
      display: block;
      color: var(--muted);
      font-weight: 500;
      margin-top: 0.2rem;
    }

    .warning,
    .error {
      padding: 0.95rem 1rem;
      border-radius: 1rem;
      font-weight: 600;
    }

    .warning {
      background: rgba(53, 94, 71, 0.1);
    }

    .error {
      background: rgba(179, 61, 31, 0.12);
      color: #8d2f18;
    }
  `
})
export class OpenCashPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly cashSessionService = inject(CashSessionService);
  private readonly printerService = inject(PrinterService);
  readonly products = computed(() => this.productService.getActiveProducts());
  readonly currentSession = computed(() => this.cashSessionService.getCurrentOpenSession());
  readonly form = this.fb.nonNullable.group({
    operatorName: ['', Validators.required]
  });
  readonly quantities = signal<Partial<Record<string, number>>>({});
  errorMessage = '';

  setQuantity(productId: string, quantity: number): void {
    this.quantities.update((state) => ({
      ...state,
      [productId]: Math.max(0, Math.floor(quantity || 0))
    }));
  }

  formatMoney(value: number): string {
    return centsToCurrency(value);
  }

  openSession(): void {
    this.errorMessage = '';

    if (this.form.invalid) {
      this.errorMessage = 'Informe o nome do operador.';
      return;
    }

    try {
      this.cashSessionService.openSession({
        operatorName: this.form.getRawValue().operatorName,
        printerStatusAtOpen: this.printerService.getStatus(),
        products: this.products().map((product) => ({
          productId: product.id,
          quantityPrepared: this.quantities()[product.id] ?? 0
        }))
      });

      void this.router.navigateByUrl('/cash/current');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Nao foi possivel abrir o caixa.';
    }
  }
}
