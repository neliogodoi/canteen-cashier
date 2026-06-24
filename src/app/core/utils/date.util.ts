export function nowIso(): string {
  return new Date().toISOString();
}

export function currentBusinessDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatLongDate(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full'
  }).format(value);
}
