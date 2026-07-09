import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { Sale } from '../../core/models/app.models';
import { CashSessionService } from '../../core/services/cash-session.service';
import { FirebaseSyncService } from '../../core/services/firebase-sync.service';
import { SaleService } from '../../core/services/sale.service';
import { TicketRenewalService } from '../../core/services/ticket-renewal.service';
import { formatDateTime } from '../../core/utils/date.util';
import { centsToCurrency } from '../../core/utils/money.util';

@Component({
  selector: 'app-cash-details-page',
  imports: [RouterLink, FormsModule],
  template: `
    @if (session(); as currentSession) {
      <section class="card">
        <div class="header">
          <div>
            <p class="eyebrow">Detalhes do caixa</p>
            <h1>{{ currentSession.operatorName }}</h1>
            <p class="muted">
              Aberto em {{ formatDate(currentSession.openedAt) }}
              @if (currentSession.closedAt) {
                <span> • Fechado em {{ formatDate(currentSession.closedAt) }}</span>
              }
            </p>
          </div>
          <div class="button-row">
            @if (currentSession.status === 'open') {
              <a class="button" routerLink="/cash/current">Continuar venda</a>
              <a class="button ghost" [routerLink]="['/cash', currentSession.id, 'close']">Fechar caixa</a>
            }
            <a class="button secondary" routerLink="/history">Historico</a>
          </div>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span>Total geral</span>
            <strong>{{ formatMoney(currentSession.totals.grossTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span>Dinheiro</span>
            <strong>{{ formatMoney(currentSession.totals.cashTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span>Pix</span>
            <strong>{{ formatMoney(currentSession.totals.pixTotal) }}</strong>
          </article>
          <article class="summary-card">
            <span>Nota</span>
            <strong>{{ formatMoney(currentSession.totals.noteTotal) }}</strong>
          </article>
        </div>
      </section>

      <section class="card renewal-card">
        <div class="renewal-head">
          <div>
            <h2>Renovar ticket</h2>
            <p class="muted">Escaneie o QR do ticket deste caixa e renove sem digitar.</p>
          </div>
        </div>

        <div class="scanner-actions">
          <button type="button" class="button" [disabled]="scannerBusy()" (click)="toggleScanner()">
            {{ scannerActive() ? 'Parar camera' : 'Escanear ticket' }}
          </button>
        </div>

        @if (!canUseCameraScanner()) {
          <p class="muted scanner-hint">A camera do navegador nao esta disponivel neste dispositivo.</p>
        }

        @if (scannerActive()) {
          <div class="scanner-preview">
            <video #scannerVideo autoplay muted playsinline></video>
          </div>
          <p class="muted scanner-hint">Aponte a camera para o QR do ticket.</p>
        }

        <div class="scanner-form">
          <input
            type="text"
            placeholder="CC:token-do-ticket"
            [ngModel]="ticketCode()"
            (ngModelChange)="ticketCode.set($event)"
          />
          <button type="button" class="button ghost" (click)="lookupTicket()">Usar codigo manual</button>
        </div>

        @if (scanMessage()) {
          <p class="notice">{{ scanMessage() }}</p>
        }

        @if (matchedSale(); as match) {
          <div class="renewal-match">
            <div>
              <strong>{{ match.ticketUnit.ticketNumber }}</strong>
              <small>{{ match.ticketUnit.productNameSnapshot }}</small>
              <small>{{ formatDate(match.sale.createdAt) }}</small>
            </div>
            <div class="numbers">
              <small>{{ paymentLabel(match.sale.paymentMethod) }}</small>
              <strong>{{ formatMoney(match.ticketUnit.unitPriceSnapshot) }}</strong>
            </div>
          </div>
          <button type="button" class="button" (click)="renewTicket()">Renovar e imprimir</button>
        }

        <div class="rows renewals-list">
          @for (renewal of sessionRenewals(); track renewal.id) {
            <div class="row">
              <div>
                <strong>{{ renewal.ticketNumber }}</strong>
                <small>{{ renewal.productNameSnapshot }}</small>
                <small>{{ renewal.operatorName }}</small>
              </div>
              <small>{{ formatDate(renewal.renewedAt) }}</small>
            </div>
          } @empty {
            <p class="muted">Nenhuma renovacao registrada neste caixa.</p>
          }
        </div>
      </section>

      <section class="details-grid">
        <article class="card">
          <h2>Produtos</h2>
          <div class="rows">
            @for (product of currentSession.products; track product.id) {
              <div class="row">
                <div>
                  <strong>{{ product.productNameSnapshot }}</strong>
                  <small>Preparado {{ product.quantityPrepared }}</small>
                </div>
                <div class="numbers">
                  <small>Vendidos {{ product.quantitySold }}</small>
                  <small>Restantes {{ product.quantityPrepared - product.quantitySold }}</small>
                </div>
              </div>
            }
          </div>
        </article>

        <article class="card">
          <h2>Vendas</h2>
          <div class="rows">
            @for (sale of sales(); track sale.id) {
              <div class="row">
                <div>
                  <strong>{{ sale.ticketNumber }}</strong>
                  <small>{{ formatDate(sale.createdAt) }}</small>
                </div>
                <div class="numbers">
                  <small>{{ paymentLabel(sale.paymentMethod) }}</small>
                  @if (sale.noteCustomerName) {
                    <small>{{ sale.noteCustomerName }}</small>
                  }
                  <small [class.failed]="sale.printStatus === 'failed'">{{ printLabel(sale) }}</small>
                  <strong>{{ formatMoney(sale.total) }}</strong>
                </div>
              </div>
              <div class="button-row">
                <button type="button" class="button secondary" (click)="reprint(sale.id)">
                  {{ sale.printStatus === 'failed' ? 'Tentar imprimir novamente' : 'Reimprimir ticket' }}
                </button>
              </div>
            } @empty {
              <p class="muted">Ainda nao houve vendas neste caixa.</p>
            }
          </div>
        </article>
      </section>
    } @else {
      <section class="card">
        <h1>Caixa nao encontrado</h1>
        <a class="button" routerLink="/history">Voltar ao historico</a>
      </section>
    }
  `,
  styles: `
    .header,
    .renewal-head,
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .header,
    .renewal-head {
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

    h1,
    h2,
    p {
      margin: 0;
    }

    .summary-grid,
    .details-grid {
      display: grid;
      gap: 1rem;
    }

    .summary-grid {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .summary-card {
      padding: 1rem;
      border-radius: 1rem;
      background: rgba(47, 95, 62, 0.08);
    }

    .summary-card span,
    .summary-card strong,
    .numbers small,
    .row small {
      display: block;
    }

    .renewal-card {
      margin-top: 1rem;
    }

    .details-grid {
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      margin-top: 1rem;
      align-items: start;
    }

    .rows {
      display: grid;
      gap: 1rem;
    }

    .scanner-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
    }

    .scanner-preview {
      overflow: hidden;
      margin-top: 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(53, 94, 71, 0.12);
      background: rgba(23, 25, 25, 0.92);
    }

    .scanner-preview video {
      display: block;
      width: 100%;
      max-height: 22rem;
      object-fit: cover;
    }

    .scanner-hint {
      margin-top: 0.75rem;
    }

    .scanner-form {
      display: grid;
      gap: 0.75rem;
      margin-top: 0.85rem;
    }

    .renewal-match {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin: 1rem 0;
      padding: 1rem;
      border-radius: 1rem;
      background: rgba(47, 95, 62, 0.08);
    }

    .notice {
      margin: 0.9rem 0;
      padding: 0.85rem 1rem;
      border-radius: 1rem;
      background: rgba(47, 95, 62, 0.08);
      color: var(--brand-strong);
      font-weight: 600;
    }

    .renewals-list {
      margin-top: 1rem;
    }

    .renewal-card .button {
      width: auto;
    }

    .numbers {
      text-align: right;
    }

    .failed {
      color: #9b2f19;
      font-weight: 700;
    }

    @media (max-width: 640px) {
      .scanner-actions .button,
      .renewal-card .button {
        width: 100%;
      }

      .renewal-match {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `
})
export class CashDetailsPageComponent {
  private readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('scannerVideo');
  private readonly route = inject(ActivatedRoute);
  private readonly cashSessionService = inject(CashSessionService);
  private readonly saleService = inject(SaleService);
  private readonly syncService = inject(FirebaseSyncService);
  private readonly ticketRenewalService = inject(TicketRenewalService);
  private readonly barcodeDetector = createBarcodeDetector();
  private scannerStream: MediaStream | null = null;
  private scannerFrameId = 0;

  readonly sessionId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly ticketCode = signal('');
  readonly scanMessage = signal('');
  readonly matchedSale = signal<ReturnType<TicketRenewalService['findSaleByCode']>>(null);
  readonly scannerActive = signal(false);
  readonly scannerBusy = signal(false);
  readonly canUseCameraScanner = signal(canUseCameraScanner());
  readonly session = computed(() => {
    const localSession = this.cashSessionService.getSessionById(this.sessionId);
    if (localSession?.status === 'open') {
      return localSession;
    }

    return this.syncService.getHistorySessionById(this.sessionId) ?? localSession;
  });
  readonly sales = computed(() => {
    if (this.session()?.status === 'open') {
      return this.saleService.getSalesBySession(this.sessionId);
    }

    const remoteSales = this.syncService.getHistorySalesBySession(this.sessionId);
    return remoteSales.length ? remoteSales : this.saleService.getSalesBySession(this.sessionId);
  });
  readonly sessionRenewals = computed(() =>
    this.ticketRenewalService
      .allRenewals()
      .filter((renewal) => renewal.cashSessionId === this.sessionId)
      .slice(0, 12)
  );

  formatMoney(value: number): string {
    return centsToCurrency(value);
  }

  formatDate(value: string): string {
    return formatDateTime(value);
  }

  paymentLabel(paymentMethod: Sale['paymentMethod']): string {
    switch (paymentMethod) {
      case 'cash':
        return 'Dinheiro';
      case 'pix':
        return 'Pix';
      case 'note':
        return 'Nota';
      default:
        return 'Nota';
    }
  }

  printLabel(sale: Sale): string {
    if (sale.printStatus === 'printed') {
      return sale.reprintCount > 0 ? 'Impresso com segunda via' : 'Impresso';
    }

    if (sale.printStatus === 'failed') {
      return 'Falha na impressao';
    }

    return 'Aguardando impressao';
  }

  async reprint(saleId: string): Promise<void> {
    await this.saleService.reprintSale(saleId);
  }

  async toggleScanner(): Promise<void> {
    if (this.scannerActive()) {
      this.stopScanner();
      return;
    }

    await this.startScanner();
  }

  lookupTicket(): void {
    const match = this.ticketRenewalService.findSaleByCode(this.ticketCode());
    if (match && match.sale.cashSessionId !== this.sessionId) {
      this.matchedSale.set(null);
      this.scanMessage.set('Esse ticket pertence a outro caixa.');
      return;
    }

    this.matchedSale.set(match);
    this.scanMessage.set(match ? '' : 'Nenhum ticket encontrado para esse codigo.');
  }

  async renewTicket(): Promise<void> {
    try {
      const renewal = await this.ticketRenewalService.renewByCode(this.ticketCode());
      if (renewal.cashSessionId !== this.sessionId) {
        this.scanMessage.set('Esse ticket pertence a outro caixa.');
        return;
      }

      this.scanMessage.set(`Ticket ${renewal.ticketNumber} renovado com sucesso.`);
      this.matchedSale.set(this.ticketRenewalService.findSaleByCode(this.ticketCode()));
    } catch (error) {
      this.scanMessage.set(error instanceof Error ? error.message : 'Nao foi possivel renovar o ticket.');
    }
  }

  private async startScanner(): Promise<void> {
    if (!this.canUseCameraScanner()) {
      this.scanMessage.set('A camera do navegador nao esta disponivel neste dispositivo.');
      return;
    }

    if (!this.barcodeDetector) {
      this.scanMessage.set('Leitura de QR nao esta disponivel neste navegador.');
      return;
    }

    this.scanMessage.set('');
    this.scannerBusy.set(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }
        },
        audio: false
      });

      this.scannerStream = stream;
      this.scannerActive.set(true);
      queueMicrotask(() => {
        const video = this.videoElement()?.nativeElement;
        if (!video || !this.scannerStream) {
          return;
        }

        video.srcObject = this.scannerStream;
        void video.play().then(() => this.scanFrameLoop());
      });
    } catch (error) {
      this.scanMessage.set(error instanceof Error ? error.message : 'Nao foi possivel abrir a camera.');
      this.stopScanner();
    } finally {
      this.scannerBusy.set(false);
    }
  }

  private stopScanner(): void {
    if (this.scannerFrameId) {
      cancelAnimationFrame(this.scannerFrameId);
      this.scannerFrameId = 0;
    }

    const video = this.videoElement()?.nativeElement;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    this.scannerStream?.getTracks().forEach((track) => track.stop());
    this.scannerStream = null;
    this.scannerActive.set(false);
    this.scannerBusy.set(false);
  }

  private scanFrameLoop(): void {
    if (!this.scannerActive() || !this.barcodeDetector) {
      return;
    }

    const video = this.videoElement()?.nativeElement;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.scannerFrameId = requestAnimationFrame(() => this.scanFrameLoop());
      return;
    }

    void this.barcodeDetector
      .detect(video)
      .then((barcodes) => {
        const rawValue = barcodes[0]?.rawValue?.trim();
        if (rawValue) {
          this.ticketCode.set(rawValue);
          this.lookupTicket();
          this.stopScanner();
          return;
        }

        this.scannerFrameId = requestAnimationFrame(() => this.scanFrameLoop());
      })
      .catch(() => {
        this.scannerFrameId = requestAnimationFrame(() => this.scanFrameLoop());
      });
  }
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

function canUseCameraScanner(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

function createBarcodeDetector(): BarcodeDetectorLike | null {
  const barcodeGlobal = globalThis as typeof globalThis & {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  };

  if (typeof globalThis === 'undefined' || !barcodeGlobal.BarcodeDetector) {
    return null;
  }

  return new barcodeGlobal.BarcodeDetector({ formats: ['qr_code'] });
}
