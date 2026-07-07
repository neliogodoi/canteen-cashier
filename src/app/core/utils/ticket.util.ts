import { AppSettings, CashSession, PaymentMethod, Sale, SaleItem } from '../models/app.models';
import { formatDateTime } from './date.util';

const LINE_WIDTH = 32;
const TICKET_CODE_PREFIX = 'CC';

interface TicketBuildOptions {
  isReprint?: boolean;
  headerTag?: string;
}

interface TicketTextSections {
  beforeQr: string;
  afterQr: string;
}

export function buildTicketTextSections(
  sale: Sale,
  session: CashSession,
  settings: AppSettings,
  options: TicketBuildOptions = {}
): TicketTextSections {
  const beforeQrLines: string[] = [];
  const afterQrLines: string[] = [];

  beforeQrLines.push(...formatHeaderLines(settings.canteenName));
  if (options.headerTag) {
    beforeQrLines.push(centerText(options.headerTag));
  } else if (options.isReprint) {
    beforeQrLines.push(centerText('SEGUNDA VIA'));
  }

  beforeQrLines.push(separator());
  beforeQrLines.push(`Ticket: ${sale.ticketNumber}`);
  beforeQrLines.push(`Data: ${sanitizeTicketText(formatDateTime(sale.createdAt))}`);
  beforeQrLines.push(`Operador: ${sanitizeTicketText(session.operatorName)}`);
  beforeQrLines.push(separator());

  for (const item of sale.items) {
    beforeQrLines.push(...formatSaleItem(item));
  }

  beforeQrLines.push(separator());
  beforeQrLines.push(formatMoneyRow('TOTAL', sale.total));
  beforeQrLines.push(`Pagamento: ${paymentLabel(sale.paymentMethod)}`);
  if (sale.noteCustomerName) {
    beforeQrLines.push(`Nota em nome de: ${sanitizeTicketText(sale.noteCustomerName)}`);
  }
  beforeQrLines.push('');

  afterQrLines.push('');
  afterQrLines.push(wrapTicketCode(buildTicketQrPayload(sale)));
  afterQrLines.push('');
  afterQrLines.push(sanitizeTicketText(settings.ticketFooterMessage));
  afterQrLines.push('');
  afterQrLines.push('');

  return {
    beforeQr: sanitizeTicketText(beforeQrLines.join('\n')),
    afterQr: sanitizeTicketText(afterQrLines.join('\n'))
  };
}

export function buildTicketQrPayload(sale: Pick<Sale, 'ticketToken'>): string {
  return `${TICKET_CODE_PREFIX}:${sale.ticketToken}`;
}

export function parseTicketQrPayload(value: string): string {
  const normalized = sanitizeTicketText(value).trim();
  if (!normalized) {
    return '';
  }

  return normalized.startsWith(`${TICKET_CODE_PREFIX}:`)
    ? normalized.slice(TICKET_CODE_PREFIX.length + 1).trim()
    : normalized;
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

function wrapTicketCode(value: string): string {
  if (value.length <= LINE_WIDTH) {
    return value;
  }

  const breakIndex = value.lastIndexOf('-', LINE_WIDTH);
  if (breakIndex <= 0) {
    return `${value.slice(0, LINE_WIDTH)}\n${value.slice(LINE_WIDTH)}`;
  }

  return `${value.slice(0, breakIndex + 1)}\n${value.slice(breakIndex + 1)}`;
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
