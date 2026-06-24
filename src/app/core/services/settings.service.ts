import { Injectable, signal } from '@angular/core';

import { AppSettings } from '../models/app.models';
import { nowIso } from '../utils/date.util';
import { FirebaseSyncService } from './firebase-sync.service';
import { StorageService } from './storage.service';

const SETTINGS_KEY = 'cc.settings';
const DEFAULT_CANTEEN_NAME = 'Igreja Metodista em Pedra Roxa\nCANTINA';
const LEGACY_CANTEEN_NAME = 'Cantina da Igreja';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<AppSettings>(this.loadDefault());

  constructor(
    private readonly storage: StorageService,
    private readonly syncService: FirebaseSyncService
  ) {
    const storedSettings = this.storage.getItem<AppSettings>(SETTINGS_KEY, this.loadDefault());
    const normalizedSettings = this.normalizeSettings(storedSettings);
    this.settings.set(normalizedSettings);
    this.storage.setItem(SETTINGS_KEY, normalizedSettings);
  }

  updatePrinterDeviceName(printerDeviceName?: string): void {
    const current = this.settings();
    const next: AppSettings = {
      ...current,
      printerDeviceName,
      updatedAt: nowIso()
    };

    this.settings.set(next);
    this.persist(next, true);
  }

  replaceSettings(settings: AppSettings): void {
    this.settings.set(this.normalizeSettings(settings));
    this.persist(this.settings(), false);
  }

  private loadDefault(): AppSettings {
    const now = nowIso();
    return {
      id: 'default',
      canteenName: DEFAULT_CANTEEN_NAME,
      ticketFooterMessage: 'Obrigado e bom apetite!',
      printerDeviceName: undefined,
      currency: 'BRL',
      createdAt: now,
      updatedAt: now
    };
  }

  private normalizeSettings(settings: AppSettings): AppSettings {
    if (settings.canteenName !== LEGACY_CANTEEN_NAME) {
      return settings;
    }

    return {
      ...settings,
      canteenName: DEFAULT_CANTEEN_NAME,
      updatedAt: nowIso()
    };
  }

  private persist(settings: AppSettings, scheduleSync: boolean): void {
    this.storage.setItem(SETTINGS_KEY, settings);
    if (scheduleSync) {
      this.syncService.enqueueSettingsChanged();
    }
  }
}
