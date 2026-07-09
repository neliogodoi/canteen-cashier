export type PrinterConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
export type CashSessionStatus = 'open' | 'closed';
export type PaymentMethod = 'cash' | 'pix' | 'note';
export type PrintStatus = 'not_requested' | 'printed' | 'failed';

export interface Product {
  id: string;
  name: string;
  description?: string;
  priceInCents: number;
  category?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashSessionTotals {
  grossTotal: number;
  cashTotal: number;
  pixTotal: number;
  noteTotal: number;
  salesCount: number;
}

export interface CashSessionProduct {
  id: string;
  cashSessionId: string;
  productId: string;
  productNameSnapshot: string;
  productPriceSnapshot: number;
  quantityPrepared: number;
  quantitySold: number;
  activeInSession: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashSession {
  id: string;
  date: string;
  operatorName: string;
  status: CashSessionStatus;
  openedAt: string;
  closedAt?: string;
  printerStatusAtOpen?: PrinterConnectionStatus;
  ticketSequence: number;
  totals: CashSessionTotals;
  products: CashSessionProduct[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
  total: number;
}

export interface SaleTicketUnit {
  id: string;
  saleId: string;
  saleItemIndex: number;
  unitIndex: number;
  ticketNumber: string;
  ticketToken: string;
  productId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id: string;
  cashSessionId: string;
  ticketNumber: string;
  ticketToken: string;
  operatorName: string;
  items: SaleItem[];
  paymentMethod: PaymentMethod;
  noteCustomerName?: string;
  total: number;
  ticketUnits: SaleTicketUnit[];
  printStatus: PrintStatus;
  printedAt?: string;
  createdAt: string;
  updatedAt: string;
  reprintCount: number;
}

export interface TicketRenewal {
  id: string;
  saleId: string;
  cashSessionId: string;
  ticketNumber: string;
  ticketUnitId: string;
  ticketToken: string;
  productNameSnapshot: string;
  unitPriceSnapshot: number;
  operatorName: string;
  renewedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: 'default';
  canteenName: string;
  ticketFooterMessage: string;
  printerDeviceName?: string;
  currency: 'BRL';
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  unitPriceInCents: number;
  quantity: number;
  maxAvailable: number;
}

export interface OpenSessionProductInput {
  productId: string;
  quantityPrepared: number;
}

export interface OpenSessionInput {
  operatorName: string;
  products: OpenSessionProductInput[];
  printerStatusAtOpen: PrinterConnectionStatus;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  category?: string;
  priceInCents: number;
  active: boolean;
}

export interface SessionSummary {
  session: CashSession;
  sales: Sale[];
  totalsByPayment: Record<PaymentMethod, number>;
  preparedCount: number;
  soldCount: number;
  remainingCount: number;
}
