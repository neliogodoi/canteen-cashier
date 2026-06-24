import { Routes } from '@angular/router';

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
  { path: 'home', component: HomePageComponent },
  { path: 'products', component: ProductsPageComponent },
  { path: 'products/new', component: ProductFormPageComponent },
  { path: 'products/:id/edit', component: ProductFormPageComponent },
  { path: 'cash/open', component: OpenCashPageComponent },
  { path: 'cash/current', component: CashRegisterPageComponent },
  { path: 'cash/:id', component: CashDetailsPageComponent },
  { path: 'cash/:id/close', component: CloseCashPageComponent },
  { path: 'history', component: HistoryPageComponent },
  { path: 'reports/monthly', component: MonthlyReportPageComponent },
  { path: '**', redirectTo: 'home' }
];
