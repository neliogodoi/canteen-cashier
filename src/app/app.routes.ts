import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';
import { LoginPageComponent } from './features/auth/login-page.component';
import { CashDetailsPageComponent } from './features/history/cash-details-page.component';
import { HistoryPageComponent } from './features/history/history-page.component';
import { MonthlyReportPageComponent } from './features/history/monthly-report-page.component';
import { HomePageComponent } from './features/home/home-page.component';
import { OpenCashPageComponent } from './features/open-cash/open-cash-page.component';
import { ProductFormPageComponent } from './features/products/product-form-page.component';
import { ProductsPageComponent } from './features/products/products-page.component';
import { CashRegisterPageComponent } from './features/cash-register/cash-register-page.component';
import { CloseCashPageComponent } from './features/cash-register/close-cash-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'login', component: LoginPageComponent, canActivate: [guestGuard] },
  { path: 'home', component: HomePageComponent, canActivate: [authGuard] },
  { path: 'products', component: ProductsPageComponent, canActivate: [authGuard] },
  { path: 'products/new', component: ProductFormPageComponent, canActivate: [authGuard] },
  { path: 'products/:id/edit', component: ProductFormPageComponent, canActivate: [authGuard] },
  { path: 'cash/open', component: OpenCashPageComponent, canActivate: [authGuard] },
  { path: 'cash/current', component: CashRegisterPageComponent, canActivate: [authGuard] },
  { path: 'cash/:id', component: CashDetailsPageComponent, canActivate: [authGuard] },
  { path: 'cash/:id/close', component: CloseCashPageComponent, canActivate: [authGuard] },
  { path: 'history', component: HistoryPageComponent, canActivate: [authGuard] },
  { path: 'reports/monthly', component: MonthlyReportPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'home' }
];
