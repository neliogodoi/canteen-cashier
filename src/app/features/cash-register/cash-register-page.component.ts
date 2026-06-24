import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CartService } from '../../core/services/cart.service';
import { CashSessionService } from '../../core/services/cash-session.service';
import { SaleService } from '../../core/services/sale.service';
import { PaymentMethod } from '../../core/models/app.models';
import { centsToCurrency } from '../../core/utils/money.util';
import { formatDateTime } from '../../core/utils/date.util';

@Component({
  selector: 'app-cash-register-page',
  imports: [RouterLink],
  template: `
    @if (session(); as currentSession) {
      <section class="utility-bar">
        <div class="utility-copy">
          <strong>{{ currentSession.operatorName }}</strong>
          <small>{{ formatDate(currentSession.openedAt) }}</small>
        </div>

        <div class="utility-menu">
          <button type="button" class="menu-toggle" (click)="toggleMenu()">
            ☰
          </button>

          @if (menuOpen()) {
            <div class="menu-panel card">
              <a routerLink="/home">Home</a>
              <a routerLink="/products">Produtos</a>
              <a routerLink="/history">Historico</a>
              <a [routerLink]="['/cash', currentSession.id]">Detalhes do caixa</a>
              <a [routerLink]="['/cash', currentSession.id, 'close']">Fechar caixa</a>
            </div>
          }
        </div>
      </section>

      <section class="layout">
        <div class="products-area">
          @for (product of currentSession.products; track product.id) {
            <button
              type="button"
              class="product-button"
              [disabled]="available(product) === 0"
              [class.low]="available(product) > 0 && available(product) <= 5"
              (click)="addProduct(product.productId)"
            >
              <strong>{{ product.productNameSnapshot }}</strong>
              <span>{{ formatMoney(product.productPriceSnapshot) }}</span>
              <small>
                {{ available(product) === 0 ? 'Esgotado' : available(product) + ' disponiveis' }}
              </small>
            </button>
          }
        </div>

        <aside class="card cart">
          <div class="cart-head">
            <h2>Carrinho</h2>
            <button type="button" class="button ghost" (click)="cart.clear()">Limpar</button>
          </div>

          @for (item of cart.items(); track item.productId) {
            <article class="cart-item">
              <div>
                <strong>{{ item.name }}</strong>
                <span>{{ formatMoney(item.unitPriceInCents) }}</span>
              </div>
              <div class="qty">
                <button type="button" class="mini" (click)="cart.decrement(item.productId)">-</button>
                <span>{{ item.quantity }}</span>
                <button type="button" class="mini" (click)="cart.increment(currentSession, item.productId)">+</button>
              </div>
            </article>
          } @empty {
            <p class="muted">Toque nos produtos para montar a venda.</p>
          }

          <div class="payment">
            <h3>Pagamento</h3>
            <div class="payment-grid">
              @for (method of paymentMethods; track method.value) {
                <button
                  type="button"
                  class="pay-option"
                  [class.selected]="selectedPayment() === method.value"
                  (click)="selectedPayment.set(method.value)"
                >
                  {{ method.label }}
                </button>
              }
            </div>
          </div>

          @if (selectedPayment() === 'note') {
            <label class="note-field">
              <span>Nome da nota</span>
              <input
                type="text"
                [value]="noteCustomerName()"
                (input)="noteCustomerName.set($any($event.target).value)"
                placeholder="Quem vai pagar depois"
              />
            </label>
          }

          @if (message()) {
            <p class="notice">{{ message() }}</p>
          }

          <div class="cart-total">
            <span>Total</span>
            <strong>{{ formatMoney(cart.totalInCents()) }}</strong>
          </div>

          <button type="button" class="button" [disabled]="!cart.items().length" (click)="finishSale()">
            Finalizar e imprimir
          </button>
        </aside>
      </section>
    } @else {
      <section class="card">
        <h1>Nenhum caixa aberto</h1>
        <p class="muted">Abra uma sessao do dia para comecar as vendas.</p>
        <a class="button" routerLink="/cash/open">Abrir caixa</a>
      </section>
    }
  `,
  styles: `
    .cart-head,
    .cart-total,
    .qty {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
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
    h3 {
      margin: 0;
    }

    .utility-bar {
      position: sticky;
      top: 0.45rem;
      z-index: 8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.6rem;
      padding: 0.35rem 0;
    }

    .utility-copy {
      display: grid;
      gap: 0.05rem;
    }

    .utility-copy strong {
      font-size: 0.95rem;
    }

    .utility-copy small {
      color: var(--muted);
      font-size: 0.76rem;
    }

    .utility-menu {
      position: relative;
    }

    .menu-toggle {
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 999px;
      background: rgba(47, 95, 62, 0.12);
      color: var(--brand-strong);
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
    }

    .menu-panel {
      position: absolute;
      top: calc(100% + 0.4rem);
      right: 0;
      min-width: 12rem;
      padding: 0.45rem;
      display: grid;
      gap: 0.2rem;
      border-radius: 1rem;
    }

    .menu-panel a {
      display: block;
      padding: 0.65rem 0.75rem;
      border-radius: 0.8rem;
      color: var(--text);
      text-decoration: none;
      font-weight: 700;
    }

    .menu-panel a:hover {
      background: rgba(47, 95, 62, 0.08);
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(320px, 420px);
      gap: 1rem;
      align-items: start;
      margin-top: 1rem;
    }

    .products-area {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
      gap: 0.55rem;
    }

    .product-button {
      display: grid;
      gap: 0.2rem;
      min-height: 5.4rem;
      padding: 0.65rem 0.7rem;
      border: 0;
      border-radius: 0.95rem;
      text-align: left;
      cursor: pointer;
      background: rgba(53, 94, 71, 0.1);
      box-shadow: inset 0 0 0 1px rgba(53, 94, 71, 0.16);
    }

    .product-button strong {
      font-size: 0.95rem;
      line-height: 1.05;
    }

    .product-button span {
      font-size: 0.9rem;
      font-weight: 700;
    }

    .product-button small {
      font-size: 0.72rem;
      line-height: 1.1;
      color: var(--muted);
    }

    .product-button.low {
      background: rgba(53, 94, 71, 0.18);
    }

    .product-button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
      background: rgba(120, 115, 105, 0.15);
    }

    .cart {
      display: grid;
      gap: 1rem;
      position: sticky;
      top: 5.5rem;
    }

    .cart-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding-bottom: 0.8rem;
      border-bottom: 1px solid rgba(47, 95, 62, 0.08);
    }

    .cart-item span {
      display: block;
      color: var(--muted);
      margin-top: 0.2rem;
    }

    .mini {
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      border: 0;
      background: rgba(47, 95, 62, 0.12);
      cursor: pointer;
      font-weight: 700;
    }

    .payment-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.6rem;
      margin-top: 0.55rem;
    }

    .note-field {
      display: grid;
      gap: 0.4rem;
      font-weight: 700;
    }

    .note-field span {
      font-size: 0.88rem;
    }

    .pay-option {
      padding: 0.85rem;
      border-radius: 0.9rem;
      border: 1px solid rgba(47, 95, 62, 0.15);
      background: transparent;
      cursor: pointer;
      font-weight: 700;
    }

    .pay-option.selected {
      border-color: var(--brand-strong);
      background: rgba(47, 95, 62, 0.12);
      color: var(--brand-strong);
    }

    .notice {
      margin: 0;
      padding: 0.9rem 1rem;
      border-radius: 1rem;
      background: rgba(47, 95, 62, 0.08);
      color: var(--brand-strong);
      font-weight: 600;
    }

    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .cart {
        position: static;
      }
    }

    @media (max-width: 520px) {
      .products-area {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .product-button {
        min-height: 5rem;
        padding: 0.6rem 0.65rem;
      }
    }
  `
})
export class CashRegisterPageComponent {
  private readonly cashSessionService = inject(CashSessionService);
  private readonly saleService = inject(SaleService);
  private readonly router = inject(Router);
  readonly cart = inject(CartService);
  readonly session = computed(() => this.cashSessionService.getCurrentOpenSession());
  readonly message = signal('');
  readonly menuOpen = signal(false);
  readonly selectedPayment = signal<PaymentMethod>('cash');
  readonly noteCustomerName = signal('');
  readonly paymentMethods = [
    { value: 'cash' as const, label: 'Dinheiro' },
    { value: 'pix' as const, label: 'Pix' },
    { value: 'note' as const, label: 'Nota' }
  ];

  available(product: { quantityPrepared: number; quantitySold: number }): number {
    return product.quantityPrepared - product.quantitySold;
  }

  formatMoney(value: number): string {
    return centsToCurrency(value);
  }

  formatDate(value: string): string {
    return formatDateTime(value);
  }

  addProduct(productId: string): void {
    const currentSession = this.session();
    if (!currentSession) {
      return;
    }

    const added = this.cart.add(currentSession, productId);
    if (!added) {
      this.message.set('Produto sem disponibilidade no momento.');
    } else {
      this.message.set('');
    }
  }

  toggleMenu(): void {
    this.menuOpen.set(!this.menuOpen());
  }

  async finishSale(): Promise<void> {
    try {
      const sale = await this.saleService.createSale(
        this.cart.items(),
        this.selectedPayment(),
        this.noteCustomerName()
      );
      this.cart.clear();
      this.noteCustomerName.set('');
      this.message.set(`Venda ${sale.ticketNumber} concluida. Impressao: ${sale.printStatus}.`);
      if (sale.printStatus === 'failed') {
        await this.router.navigate(['/cash', sale.cashSessionId]);
      }
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Nao foi possivel concluir a venda.');
    }
  }
}
