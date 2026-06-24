import { Injectable, signal } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';

import { authUsernameDomain, firebaseConfig } from './firebase.config';

type AuthState = 'checking' | 'authenticated' | 'unauthenticated';

interface FirebaseAuthRuntime {
  auth: Auth;
  browserLocalPersistence: typeof import('firebase/auth').browserLocalPersistence;
  onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged;
  setPersistence: typeof import('firebase/auth').setPersistence;
  signInWithEmailAndPassword: typeof import('firebase/auth').signInWithEmailAndPassword;
  signOut: typeof import('firebase/auth').signOut;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly initialized = signal(false);
  readonly authState = signal<AuthState>('checking');
  readonly currentUser = signal<User | null>(null);
  readonly lastError = signal('');

  private runtimePromise: Promise<FirebaseAuthRuntime> | null = null;
  private initializePromise: Promise<void> | null = null;

  isAuthenticated(): boolean {
    return this.authState() === 'authenticated';
  }

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') {
      this.initialized.set(true);
      this.authState.set('unauthenticated');
      return;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.initializeInternal();
    return this.initializePromise;
  }

  async signIn(username: string, password: string): Promise<void> {
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedPassword) {
      throw new Error('Informe usuario e senha.');
    }

    const runtime = await this.getRuntime();
    this.lastError.set('');
    await runtime.setPersistence(runtime.auth, runtime.browserLocalPersistence);

    try {
      await runtime.signInWithEmailAndPassword(
        runtime.auth,
        normalizeUsernameToEmail(normalizedUsername),
        normalizedPassword
      );
    } catch (error) {
      const message = mapAuthError(error);
      this.lastError.set(message);
      throw new Error(message);
    }
  }

  async signOut(): Promise<void> {
    const runtime = await this.getRuntime();
    await runtime.signOut(runtime.auth);
  }

  private async initializeInternal(): Promise<void> {
    const runtime = await this.getRuntime();

    await new Promise<void>((resolve) => {
      let firstEventHandled = false;

      runtime.onAuthStateChanged(runtime.auth, (user) => {
        this.currentUser.set(user);
        this.authState.set(user ? 'authenticated' : 'unauthenticated');
        this.lastError.set('');

        if (!firstEventHandled) {
          firstEventHandled = true;
          this.initialized.set(true);
          resolve();
        }
      });
    });
  }

  private async getRuntime(): Promise<FirebaseAuthRuntime> {
    if (this.runtimePromise) {
      return this.runtimePromise;
    }

    this.runtimePromise = this.loadRuntime();
    return this.runtimePromise;
  }

  private async loadRuntime(): Promise<FirebaseAuthRuntime> {
    const appModule = await import('firebase/app');
    const authModule = await import('firebase/auth');
    const app: FirebaseApp = appModule.getApps().length
      ? appModule.getApp()
      : appModule.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);

    return {
      auth,
      browserLocalPersistence: authModule.browserLocalPersistence,
      onAuthStateChanged: authModule.onAuthStateChanged,
      setPersistence: authModule.setPersistence,
      signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
      signOut: authModule.signOut
    };
  }
}

function normalizeUsernameToEmail(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue.includes('@')) {
    return normalizedValue;
  }

  return `${normalizedValue}@${authUsernameDomain}`;
}

function mapAuthError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Usuario ou senha invalidos.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    case 'auth/network-request-failed':
      return 'Falha de rede ao autenticar.';
    default:
      return 'Nao foi possivel autenticar agora.';
  }
}
