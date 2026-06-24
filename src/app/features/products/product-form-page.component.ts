import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ProductService } from '../../core/services/product.service';
import { decimalToCents } from '../../core/utils/money.util';

@Component({
  selector: 'app-product-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="card form-card">
      <div class="header">
        <div>
          <p class="eyebrow">Cadastro</p>
          <h1>{{ editing ? 'Editar produto' : 'Novo produto' }}</h1>
        </div>
        <a class="button secondary" routerLink="/products">Voltar</a>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()">
        <label>
          Nome
          <input type="text" formControlName="name" placeholder="Ex: Pastel" />
        </label>

        <label>
          Descricao
          <textarea rows="3" formControlName="description" placeholder="Opcional"></textarea>
        </label>

        <label>
          Categoria
          <input type="text" formControlName="category" placeholder="Ex: Salgados" />
        </label>

        <label>
          Preco
          <input type="number" min="0" step="0.01" formControlName="price" placeholder="0,00" />
        </label>

        <label class="checkbox">
          <input type="checkbox" formControlName="active" />
          Produto ativo
        </label>

        @if (submitted && form.invalid) {
          <p class="error">Preencha nome e preco valido para salvar.</p>
        }

        <div class="button-row">
          <button type="submit" class="button">Salvar produto</button>
          <a class="button ghost" routerLink="/products">Cancelar</a>
        </div>
      </form>
    </section>
  `,
  styles: `
    .form-card {
      max-width: 680px;
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
      gap: 0.45rem;
      font-weight: 600;
    }

    .checkbox {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .error {
      color: #b33d1f;
      margin: 0;
      font-weight: 600;
    }
  `
})
export class ProductFormPageComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly productService = inject(ProductService);
  private readonly fb = inject(FormBuilder);
  readonly productId = this.route.snapshot.paramMap.get('id');
  readonly editing = Boolean(this.productId);
  submitted = false;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    category: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    active: [true]
  });

  constructor() {
    if (!this.productId) {
      return;
    }

    const product = this.productService.getProductById(this.productId);
    if (!product) {
      void this.router.navigateByUrl('/products');
      return;
    }

    this.form.patchValue({
      name: product.name,
      description: product.description ?? '',
      category: product.category ?? '',
      price: product.priceInCents / 100,
      active: product.active
    });
  }

  save(): void {
    this.submitted = true;

    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const input = {
      name: value.name.trim(),
      description: value.description.trim() || undefined,
      category: value.category.trim() || undefined,
      priceInCents: decimalToCents(value.price),
      active: value.active
    };

    if (this.productId) {
      this.productService.updateProduct(this.productId, input);
    } else {
      this.productService.createProduct(input);
    }

    void this.router.navigateByUrl('/products');
  }
}
