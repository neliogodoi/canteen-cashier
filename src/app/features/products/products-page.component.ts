import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductService } from '../../core/services/product.service';
import { centsToCurrency } from '../../core/utils/money.util';

@Component({
	selector: 'app-products-page',
	imports: [RouterLink],
	template: `
    <section class="page-head">
      <div>
        <p class="eyebrow">Cadastro</p>
        <h1>Produtos</h1>
      </div>
      <a class="button" routerLink="/products/new">Novo produto</a>
    </section>

    <section class="product-grid">
      @for (product of products(); track product.id) {
        <article class="card product-card">
          <span class="badge status-badge" [class.inactive]="!product.active">
            {{ product.active ? 'Ativo' : 'Inativo' }}
          </span>

          <div class="product-main">
            <h2>{{ product.name }}</h2>
            <p class="price">{{ formatMoney(product.priceInCents) }}</p>
          </div>

          <div class="meta-list">
            <p class="meta muted">{{ product.description || 'Sem descricao' }}</p>
            <p class="meta muted">{{ product.category || 'Sem categoria' }}</p>
          </div>

          <div class="icon-actions">
            <a
              class="icon-button secondary"
              [routerLink]="['/products', product.id, 'edit']"
              aria-label="Editar produto"
              title="Editar produto"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 20h9"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
              </svg>
            </a>
            @if (product.active) {
              <button
                type="button"
                class="icon-button danger"
                (click)="deactivate(product.id)"
                aria-label="Desativar produto"
                title="Desativar produto"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M3 6h18"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M8 6V4h8v2"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                  <path
                    d="M10 11v6M14 11v6"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.8"
                  />
                </svg>
              </button>
            }
          </div>
        </article>
      } @empty {
        <article class="card">
          <h2>Nenhum produto cadastrado</h2>
          <p class="muted">Cadastre o primeiro item para abrir o caixa.</p>
        </article>
      }
    </section>
  `,
	styles: `
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .page-head {
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }

    h1,
    h2 {
      margin: 0;
    }

    .eyebrow {
      margin: 0 0 0.35rem;
      color: var(--brand-strong);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.8rem;
    }

    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
    }

    .product-card {
      position: relative;
      display: grid;
      gap: 0.35rem;
      padding: 0.8rem 0.9rem;
      padding-right: 5.25rem;
      padding-bottom: 0.8rem;
      border-radius: 1.1rem;
    }

    .product-main {
      min-width: 0;
    }

    .price {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
    }

    h2 {
      font-size: 1.05rem;
      line-height: 1.05;
    }

    .badge {
      padding: 0.2rem 0.45rem;
      border-radius: 999px;
      background: rgba(89, 176, 117, 0.47);
      color: var(--brand-strong);
      font-size: 0.68rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .status-badge {
      position: absolute;
      top: 0.8rem;
      right: 0.9rem;
    }

    .inactive {
      background: rgba(120, 115, 105, 0.12);
      color: #746d63;
    }

    .meta-list {
      display: grid;
      gap: 0.2rem;
    }

    .meta {
      margin: 0;
      font-size: 0.86rem;
      line-height: 1.2;
    }

    .icon-actions {
      position: absolute;
      right: 0.9rem;
      bottom: 0.8rem;
      display: flex;
      gap: 0.35rem;
    }

    .icon-button,
    .icon-button:visited {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      width: 2.1rem;
      height: 2.1rem;
      border-radius: 999px;
      text-decoration: none;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
    }

    .icon-button svg {
      width: 1.1rem;
      height: 1.1rem;
      display: block;
    }

    .icon-button.secondary {
      background: rgba(80, 80, 80, 0.12);
      color: var(--brand-strong);
    }

    .icon-button.danger {
      background: rgba(189, 73, 51, 0.1);
      color: #a33a24;
    }

    @media (max-width: 520px) {
      .page-head .button,
      .page-head .button:visited {
        width: 100%;
      }

      .product-grid {
        grid-template-columns: 1fr;
        gap: 0.6rem;
      }

      .product-card {
        padding: 0.75rem 0.8rem;
        padding-right: 5rem;
      }

      .status-badge {
        top: 0.75rem;
        right: 0.8rem;
      }

      .icon-actions {
        right: 0.8rem;
        bottom: 0.75rem;
      }
    }
  `
})
export class ProductsPageComponent {
	private readonly productService = inject(ProductService);
	readonly products = computed(() => this.productService.getAllProducts());

	formatMoney(value: number): string {
		return centsToCurrency(value);
	}

	deactivate(productId: string): void {
		this.productService.deactivateProduct(productId);
	}
}
