import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CashSessionService } from '../../core/services/cash-session.service';
import { PrinterService } from '../../core/services/printer.service';
import { SettingsService } from '../../core/services/settings.service';
import { formatLongDate } from '../../core/utils/date.util';

@Component({
	selector: 'app-home-page',
	imports: [RouterLink],
	template: `
    <section class="hero card">
      <div>
        <p class="eyebrow">Cantina em operacao</p>
        <h1>{{ homeTitle() }}</h1>
        <p class="muted">{{ currentDate }}</p>
      </div>

      <div class="status-grid">
        <article class="status-tile">
          <span>Impressora</span>
          <strong
            [class.connected]="printerStatus() === 'connected'"
            [class.connecting]="printerStatus() === 'connecting'"
            [class.error]="printerStatus() === 'error'"
          >
            {{ printerStatusLabel() }}
          </strong>
          @if (printerName()) {
            <small>{{ printerName() }}</small>
          }
        </article>

        <article class="status-tile">
          <span>Caixa</span>
          <strong>{{ currentSession() ? 'Aberto' : 'Fechado' }}</strong>
        </article>
      </div>
    </section>

    <section class="action-grid">
      <a class="action card action-primary" [routerLink]="currentSession() ? '/cash/current' : '/cash/open'">
        <span>{{ currentSession() ? 'Continuar caixa' : 'Abrir caixa' }}</span>
        <strong>{{ currentSession()?.operatorName ?? 'Iniciar sessao do dia' }}</strong>
      </a>
    </section>

    <section class="card quick-actions">
      <h2>Impressora</h2>
      <p class="muted">Ative o Bluetooth e ligue a impressora para fazer o pareamento.</p>
      <div class="button-row">
        <button type="button" class="button" [disabled]="printerStatus() === 'connecting'" (click)="connectPrinter()">
          {{ printerStatus() === 'connected' ? 'Trocar impressora' : 'Conectar impressora' }}
        </button>
        @if (printerStatus() === 'connected') {
          <button type="button" class="button secondary" (click)="disconnectPrinter()">
            Desconectar
          </button>
        }
      </div>
      @if (printerError()) {
        <p class="printer-error">{{ printerError() }}</p>
      }
      @if (!bluetoothAvailable()) {
        <p class="printer-hint">Este navegador/dispositivo nao oferece Web Bluetooth. A venda continua, mas o ticket sera marcado como nao impresso.</p>
      }
    </section>
  `,
	styles: `
    .hero {
      display: grid;
      gap: 0.9rem;
      margin-bottom: 1rem;
      padding: 1rem 1.1rem;
    }

    .eyebrow {
      margin: 0 0 0.4rem;
      color: var(--brand-strong);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.8rem;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.35rem, 4.2vw, 2rem);
      line-height: 1.04;
    }

    .status-grid,
    .action-grid {
      display: grid;
      gap: 0.75rem;
    }

    .status-grid {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }

    .status-tile span,
    .action span {
      color: var(--muted);
      display: block;
      margin-bottom: 0.2rem;
    }

    .status-tile small {
      display: block;
      margin-top: 0.15rem;
      color: var(--muted);
      font-size: 0.84rem;
    }

    .status-tile strong,
    .action strong {
      font-size: 1rem;
    }

    .connected {
      color: var(--brand-strong);
    }

    .connecting {
      color: #a36b09;
    }

    .error,
    .printer-error {
      color: #9b2f19;
    }

    .action-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin-bottom: 1.25rem;
    }

    .action {
      text-decoration: none;
      color: inherit;
    }

    .action-primary {
      padding: 1.2rem 1.25rem;
      background: linear-gradient(135deg, rgba(38, 145, 84, 0.3), rgba(42, 102, 66, 0.26));
      border-color: rgba(53, 94, 71, 0.14);
      box-shadow:
        0 20px 42px rgba(40, 45, 42, 0.1),
        inset 0 0 0 1px rgba(255, 255, 255, 0.45);
    }

    .action-primary span {
      font-size: 1.08rem;
    }

    .action-primary strong {
      font-size: 1.45rem;
      line-height: 1.05;
    }

    .quick-actions h2 {
      margin-top: 0;
    }

    .printer-error,
    .printer-hint {
      margin: 1rem 0 0;
      font-weight: 600;
    }
  `
})
export class HomePageComponent {
	private readonly cashSessionService = inject(CashSessionService);
	private readonly printerService = inject(PrinterService);
	readonly settings = inject(SettingsService).settings;
	readonly currentSession = computed(() => this.cashSessionService.getCurrentOpenSession());
	readonly printerStatus = this.printerService.status;
	readonly printerError = this.printerService.lastError;
	readonly printerName = this.printerService.connectedDeviceName;
	readonly bluetoothAvailable = this.printerService.canUseBluetooth;
	readonly homeTitle = computed(() => this.settings().canteenName.split('\n')[0] ?? this.settings().canteenName);
	readonly printerStatusLabel = computed(() => {
		const status = this.printerStatus();
		if (status === 'connected') {
			return 'Conectada';
		}

		if (status === 'connecting') {
			return 'Conectando';
		}

		if (status === 'error') {
			return 'Erro';
		}

		return 'Desconectada';
	});

	readonly currentDate = formatLongDate();

	async connectPrinter(): Promise<void> {
		try {
			await this.printerService.connect();
		} catch {
			// O erro fica refletido nos signals do servico.
		}
	}

	disconnectPrinter(): void {
		this.printerService.disconnect();
	}
}
