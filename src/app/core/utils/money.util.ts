export function centsToCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value / 100);
}

export function decimalToCents(value: number): number {
  return Math.round(value * 100);
}
