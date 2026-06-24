import { AppSettings, CashSession, PaymentMethod, Sale, SaleItem } from '../models/app.models';
import { formatDateTime } from './date.util';

const LINE_WIDTH = 32;

export function buildTicketText(
  sale: Sale,
  session: CashSession,
  settings: AppSettings,
  isReprint = false
): string {
  const lines: string[] = [];

  lines.push(...formatHeaderLines(settings.canteenName));
  if (isReprint) {
    lines.push(centerText('SEGUNDA VIA'));
  }

  lines.push(separator());
  lines.push(`Ticket: ${sale.ticketNumber}`);
  lines.push(`Data: ${sanitizeTicketText(formatDateTime(sale.createdAt))}`);
  lines.push(`Operador: ${sanitizeTicketText(session.operatorName)}`);
  lines.push(separator());

  for (const item of sale.items) {
    lines.push(...formatSaleItem(item));
  }

  lines.push(separator());
  lines.push(formatMoneyRow('TOTAL', sale.total));
  lines.push(`Pagamento: ${paymentLabel(sale.paymentMethod)}`);
  if (sale.noteCustomerName) {
    lines.push(`Nota em nome de: ${sanitizeTicketText(sale.noteCustomerName)}`);
  }
  lines.push(separator());
  lines.push(sanitizeTicketText(settings.ticketFooterMessage));
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push('');

  return sanitizeTicketText(lines.join('\n'));
}

function formatSaleItem(item: SaleItem): string[] {
  const label = sanitizeTicketText(`${item.quantity}x ${item.productNameSnapshot}`);
  const total = formatPrinterMoney(item.total);
  const head = fitLine(label, total);
  const unitPrice = `  ${formatPrinterMoney(item.unitPriceSnapshot)} cada`;
  return [head, unitPrice];
}

function formatMoneyRow(label: string, value: number): string {
  return fitLine(label, formatPrinterMoney(value));
}

function fitLine(left: string, right: string): string {
  const safeLeft = left.trim();
  const safeRight = right.trim();
  const spaces = LINE_WIDTH - safeLeft.length - safeRight.length;
  if (spaces >= 1) {
    return `${safeLeft}${' '.repeat(spaces)}${safeRight}`;
  }

  const maxLeft = Math.max(1, LINE_WIDTH - safeRight.length - 1);
  return `${safeLeft.slice(0, maxLeft)} ${safeRight}`;
}

function centerText(value: string): string {
  if (value.length >= LINE_WIDTH) {
    return value.slice(0, LINE_WIDTH);
  }

  const padStart = Math.floor((LINE_WIDTH - value.length) / 2);
  return `${' '.repeat(padStart)}${value}`;
}

function formatHeaderLines(value: string): string[] {
  return sanitizeTicketText(value)
    .toUpperCase()
    .split('\n')
    .map((line) => centerText(line.trim()))
    .filter((line) => line.length > 0);
}

function separator(): string {
  return '-'.repeat(LINE_WIDTH);
}

function paymentLabel(paymentMethod: PaymentMethod): string {
  switch (paymentMethod) {
    case 'cash':
      return 'Dinheiro';
    case 'pix':
      return 'Pix';
    case 'note':
      return 'Nota';
  }
}

function formatPrinterMoney(value: number): string {
  const normalized = Number.isFinite(value) ? Math.round(value) : 0;
  const absolute = Math.abs(normalized);
  const reais = Math.floor(absolute / 100);
  const cents = absolute % 100;
  const formattedReais = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = normalized < 0 ? '-' : '';
  return `${sign}R$ ${formattedReais},${String(cents).padStart(2, '0')}`;
}

function sanitizeTicketText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e\n]/g, '')
    .replace(/\r/g, '');
}
