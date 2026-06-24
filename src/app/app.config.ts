import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, inject } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { FirebaseSyncService } from './core/services/firebase-sync.service';
import { StorageService } from './core/services/storage.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAppInitializer(() => {
      const storageService = inject(StorageService);
      const syncService = inject(FirebaseSyncService);
      return storageService.initialize().then(() => syncService.initialize());
    })
  ]
};
