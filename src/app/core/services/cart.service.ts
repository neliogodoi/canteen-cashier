import { Injectable, computed, signal } from '@angular/core';

import { CartItem, CashSession } from '../models/app.models';

@Injectable({ providedIn: 'root' })
export class CartService {
  readonly items = signal<CartItem[]>([]);
  readonly totalInCents = computed(() =>
    this.items().reduce((sum, item) => sum + item.unitPriceInCents * item.quantity, 0)
  );

  clear(): void {
    this.items.set([]);
  }

  add(session: CashSession, productId: string): boolean {
    const sessionProduct = session.products.find((item) => item.productId === productId);
    if (!sessionProduct) {
      return false;
    }

    const existing = this.items().find((item) => item.productId === productId);
    const currentQuantity = existing?.quantity ?? 0;
    const available = sessionProduct.quantityPrepared - sessionProduct.quantitySold;

    if (currentQuantity >= available) {
      return false;
    }

    this.items.update((items) => {
      if (!existing) {
        return [
          ...items,
          {
            productId,
            name: sessionProduct.productNameSnapshot,
            unitPriceInCents: sessionProduct.productPriceSnapshot,
            quantity: 1,
            maxAvailable: available
          }
        ];
      }

      return items.map((item) =>
        item.productId === productId ? { ...item, quantity: item.quantity + 1, maxAvailable: available } : item
      );
    });

    return true;
  }

  increment(session: CashSession, productId: string): boolean {
    return this.add(session, productId);
  }

  decrement(productId: string): void {
    this.items.update((items) =>
      items
        .map((item) => (item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  remove(productId: string): void {
    this.items.update((items) => items.filter((item) => item.productId !== productId));
  }
}
