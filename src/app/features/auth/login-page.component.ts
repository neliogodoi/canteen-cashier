import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  template: `
    <section class="login-page">
      <div class="login-card card">
        <div class="eyebrow">Acesso protegido</div>
        <h1>Entrar</h1>
        <p class="muted">Use usuario e senha do Firebase para liberar o caixa e a sincronizacao.</p>

        <form class="login-form" (ngSubmit)="submit()">
          <label>
            <span>Usuario</span>
            <input
              type="text"
              name="username"
              autocomplete="username"
              [value]="username()"
              (input)="username.set($any($event.target).value)"
              placeholder="operador ou email"
            />
          </label>

          <label>
            <span>Senha</span>
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
              placeholder="Digite a senha"
            />
          </label>

          @if (errorMessage()) {
            <p class="error-message">{{ errorMessage() }}</p>
          }

          <button class="button submit-button" type="submit" [disabled]="submitting()">
            {{ submitting() ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
      </div>
    </section>
  `,
  styles: `
    .login-page {
      min-height: calc(100vh - 2rem);
      display: grid;
      place-items: center;
      padding: 2rem 0;
    }

    .login-card {
      width: min(28rem, 100%);
      padding: 1.5rem;
      border-radius: 1.75rem;
    }

    .eyebrow {
      margin-bottom: 0.75rem;
      color: var(--brand-strong);
      font-size: 0.92rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 2.7rem);
      line-height: 0.98;
    }

    p {
      margin: 0.9rem 0 0;
      font-size: 1rem;
      line-height: 1.45;
    }

    .login-form {
      display: grid;
      gap: 1rem;
      margin-top: 1.5rem;
    }

    label {
      display: grid;
      gap: 0.45rem;
      font-weight: 600;
    }

    span {
      color: var(--muted);
      font-size: 0.95rem;
    }

    .submit-button {
      margin-top: 0.25rem;
      min-height: 3.2rem;
    }

    .error-message {
      margin: 0;
      color: #a54848;
      font-weight: 600;
    }
  `
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly username = signal('');
  readonly password = signal('');
  readonly submitting = signal(false);
  readonly errorMessage = signal('');

  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signIn(this.username(), this.password());
      const redirect = this.route.snapshot.queryParamMap.get('redirect') || '/home';
      await this.router.navigateByUrl(redirect);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Falha ao entrar.');
    } finally {
      this.submitting.set(false);
    }
  }
}
