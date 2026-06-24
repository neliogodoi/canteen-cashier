import { Injectable, signal } from '@angular/core';

import { CreateProductInput, Product } from '../models/app.models';
import { nowIso } from '../utils/date.util';
import { FirebaseSyncService } from './firebase-sync.service';
import { StorageService } from './storage.service';

const PRODUCTS_KEY = 'cc.products';

@Injectable({ providedIn: 'root' })
export class ProductService {
  readonly products = signal<Product[]>([]);

  constructor(
    private readonly storage: StorageService,
    private readonly syncService: FirebaseSyncService
  ) {
    this.products.set(this.storage.getItem<Product[]>(PRODUCTS_KEY, this.seedProducts()));
    this.persist();
  }

  getAllProducts(): Product[] {
    return [...this.products()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getActiveProducts(): Product[] {
    return this.getAllProducts().filter((product) => product.active);
  }

  getProductById(id: string): Product | undefined {
    return this.products().find((product) => product.id === id);
  }

  createProduct(input: CreateProductInput): Product {
    const now = nowIso();
    const product: Product = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now
    };

    this.products.update((items) => [...items, product]);
    this.persist();
    this.syncService.enqueueProductChanged();
    return product;
  }

  updateProduct(id: string, input: CreateProductInput): Product {
    let updatedProduct!: Product;

    this.products.update((items) =>
      items.map((product) => {
        if (product.id !== id) {
          return product;
        }

        updatedProduct = {
          ...product,
          ...input,
          updatedAt: nowIso()
        };

        return updatedProduct;
      })
    );

    this.persist();
    this.syncService.enqueueProductChanged();
    return updatedProduct;
  }

  deactivateProduct(id: string): void {
    const product = this.getProductById(id);
    if (!product) {
      return;
    }

    this.updateProduct(id, { ...product, active: false });
  }

  replaceAllProducts(products: Product[]): void {
    this.products.set([...products]);
    this.persist();
  }

  private persist(): void {
    this.storage.setItem(PRODUCTS_KEY, this.products());
  }

  private seedProducts(): Product[] {
    const now = nowIso();
    return [
      {
        id: crypto.randomUUID(),
        name: 'Pastel',
        description: 'Carne ou queijo',
        category: 'Salgados',
        priceInCents: 800,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: crypto.randomUUID(),
        name: 'Pudim',
        description: 'Pote individual',
        category: 'Doces',
        priceInCents: 700,
        active: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: crypto.randomUUID(),
        name: 'Refrigerante',
        description: 'Lata 350ml',
        category: 'Bebidas',
        priceInCents: 600,
        active: true,
        createdAt: now,
        updatedAt: now
      }
    ];
  }
}
