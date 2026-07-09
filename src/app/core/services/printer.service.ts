import { Injectable, computed, inject, signal } from '@angular/core';

import { AppSettings, CashSession, PrinterConnectionStatus, Sale, SaleTicketUnit } from '../models/app.models';
import { buildTicketQrPayload, buildTicketUnitTextSections } from '../utils/ticket.util';
import { SettingsService } from './settings.service';

interface BluetoothCharacteristicLike {
  properties: {
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  writeValueWithoutResponse(data: BufferSource): Promise<void>;
  writeValue?(data: BufferSource): Promise<void>;
}

interface BluetoothServiceLike {
  getCharacteristics(): Promise<BluetoothCharacteristicLike[]>;
}

interface BluetoothServerLike {
  connected?: boolean;
  getPrimaryServices(): Promise<BluetoothServiceLike[]>;
}

interface BluetoothGattLike {
  connected: boolean;
  connect(): Promise<BluetoothServerLike>;
  disconnect(): void;
}

interface BluetoothDeviceLike extends EventTarget {
  name?: string;
  gatt?: BluetoothGattLike;
}

interface PrintSaleOptions {
  isReprint?: boolean;
  headerTag?: string;
}

const PRINTER_OPTIONAL_SERVICES = [
  'battery_service',
  0x1800,
  0x1801,
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455'
];

@Injectable({ providedIn: 'root' })
export class PrinterService {
  private readonly settingsService = inject(SettingsService);
  private readonly textEncoder = new TextEncoder();
  readonly settings = this.settingsService.settings;
  readonly status = signal<PrinterConnectionStatus>('disconnected');
  readonly lastError = signal<string>('');
  readonly connectedDeviceName = signal<string>('');
  readonly canUseBluetooth = computed(
    () => typeof navigator !== 'undefined' && 'bluetooth' in (navigator as Navigator & { bluetooth?: unknown })
  );

  private bluetoothDevice: BluetoothDeviceLike | null = null;
  private gattServer: BluetoothServerLike | null = null;
  private writableCharacteristic: BluetoothCharacteristicLike | null = null;

  constructor() {
    this.connectedDeviceName.set(this.settings().printerDeviceName ?? '');
  }

  async connect(): Promise<void> {
    if (!this.canUseBluetooth()) {
      this.status.set('error');
      this.lastError.set('Web Bluetooth nao esta disponivel neste navegador/dispositivo.');
      throw new Error(this.lastError());
    }

    this.status.set('connecting');
    this.lastError.set('');

    try {
      const bluetooth = this.getBluetoothNavigator();
      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_OPTIONAL_SERVICES
      });

      this.bluetoothDevice = device;
      this.bluetoothDevice.addEventListener('gattserverdisconnected', this.handleDisconnect);

      const server = await this.requireServer(device);
      const characteristic = await this.findWritableCharacteristic(server);

      this.gattServer = server;
      this.writableCharacteristic = characteristic;
      this.status.set('connected');
      this.connectedDeviceName.set(device.name ?? 'Impressora Bluetooth');
      this.settingsService.updatePrinterDeviceName(this.connectedDeviceName());
    } catch (error) {
      this.status.set('error');
      this.lastError.set(this.resolveErrorMessage(error));
      this.clearConnectionState(false);
      throw error instanceof Error ? error : new Error(this.lastError());
    }
  }

  async reconnect(): Promise<void> {
    if (!this.bluetoothDevice) {
      await this.connect();
      return;
    }

    this.status.set('connecting');
    this.lastError.set('');

    try {
      const server = await this.requireServer(this.bluetoothDevice);
      const characteristic = await this.findWritableCharacteristic(server);
      this.gattServer = server;
      this.writableCharacteristic = characteristic;
      this.status.set('connected');
    } catch (error) {
      this.status.set('error');
      this.lastError.set(this.resolveErrorMessage(error));
      this.clearConnectionState(false);
      throw error instanceof Error ? error : new Error(this.lastError());
    }
  }

  disconnect(): void {
    if (this.bluetoothDevice?.gatt?.connected) {
      this.bluetoothDevice.gatt.disconnect();
    }

    this.clearConnectionState(true);
    this.status.set('disconnected');
  }

  getStatus(): PrinterConnectionStatus {
    return this.status();
  }

  async printSale(sale: Sale, session: CashSession, options: PrintSaleOptions = {}): Promise<boolean> {
    try {
      for (const ticketUnit of sale.ticketUnits) {
        const printed = await this.printTicketUnit(sale, ticketUnit, session, options);
        if (!printed) {
          return false;
        }
      }
      return true;
    } catch (error) {
      this.status.set('error');
      this.lastError.set(this.resolveErrorMessage(error));
      return false;
    }
  }

  async printText(text: string, qrPayload?: string, trailingText = ''): Promise<void> {
    const characteristic = await this.ensureWritableCharacteristic();
    const payload = this.buildEscPosBytes(text, qrPayload, trailingText);

    for (let index = 0; index < payload.length; index += 180) {
      await characteristic.writeValueWithoutResponse(payload.slice(index, index + 180));
    }
  }

  async printTicketUnit(
    sale: Sale,
    ticketUnit: SaleTicketUnit,
    session: CashSession,
    options: PrintSaleOptions = {}
  ): Promise<boolean> {
    try {
      const sections = buildTicketUnitTextSections(sale, ticketUnit, session, this.settings(), options);
      await this.printText(sections.beforeQr, buildTicketQrPayload(ticketUnit), sections.afterQr);
      return true;
    } catch (error) {
      this.status.set('error');
      this.lastError.set(this.resolveErrorMessage(error));
      return false;
    }
  }

  private async ensureWritableCharacteristic(): Promise<BluetoothCharacteristicLike> {
    if (this.writableCharacteristic) {
      return this.writableCharacteristic;
    }

    if (this.bluetoothDevice) {
      await this.reconnect();
    }

    if (!this.writableCharacteristic) {
      throw new Error('Nenhuma impressora conectada.');
    }

    return this.writableCharacteristic;
  }

  private async requireServer(device: BluetoothDeviceLike): Promise<BluetoothServerLike> {
    if (device.gatt?.connected && this.gattServer) {
      return this.gattServer;
    }

    const server = await device.gatt?.connect();
    if (!server) {
      throw new Error('Nao foi possivel abrir a conexao Bluetooth com a impressora.');
    }

    return server;
  }

  private async findWritableCharacteristic(server: BluetoothServerLike): Promise<BluetoothCharacteristicLike> {
    const services = await server.getPrimaryServices();

    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      const writable = characteristics.find(
        (characteristic: BluetoothCharacteristicLike) =>
          characteristic.properties.write || characteristic.properties.writeWithoutResponse
      );

      if (writable) {
        return writable;
      }
    }

    throw new Error('Nenhuma caracteristica gravavel foi encontrada na impressora selecionada.');
  }

  private buildEscPosBytes(text: string, qrPayload?: string, trailingText = ''): Uint8Array {
    const init = new Uint8Array([0x1b, 0x40]);
    const center = new Uint8Array([0x1b, 0x61, 0x01]);
    const left = new Uint8Array([0x1b, 0x61, 0x00]);
    const normal = new Uint8Array([0x1b, 0x45, 0x00]);
    const cut = new Uint8Array([0x1d, 0x56, 0x41, 0x10]);
    const body = this.textEncoder.encode(text.replace(/\n/g, '\r\n'));
    const tail = trailingText
      ? this.textEncoder.encode(trailingText.replace(/\n/g, '\r\n'))
      : new Uint8Array();
    const qr = qrPayload ? this.buildQrCodeBytes(qrPayload) : new Uint8Array();

    return concatUint8Arrays(init, center, normal, left, body, qr, left, tail, cut);
  }

  private buildQrCodeBytes(value: string): Uint8Array {
    const payload = this.textEncoder.encode(value);
    const storeLength = payload.length + 3;
    const pL = storeLength % 256;
    const pH = Math.floor(storeLength / 256);

    return concatUint8Arrays(
      new Uint8Array([0x0a, 0x1b, 0x61, 0x01]),
      new Uint8Array([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
      new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
      new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]),
      new Uint8Array([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
      payload,
      new Uint8Array([0x0a, 0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30, 0x0a])
    );
  }

  private clearConnectionState(resetRememberedName: boolean): void {
    if (this.bluetoothDevice) {
      this.bluetoothDevice.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    }

    this.bluetoothDevice = null;
    this.gattServer = null;
    this.writableCharacteristic = null;

    if (resetRememberedName) {
      this.connectedDeviceName.set('');
      this.settingsService.updatePrinterDeviceName(undefined);
    }
  }

  private readonly handleDisconnect = (): void => {
    this.gattServer = null;
    this.writableCharacteristic = null;
    this.status.set('disconnected');
  };

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Falha ao comunicar com a impressora.';
  }

  private getBluetoothNavigator(): { requestDevice(options: unknown): Promise<BluetoothDeviceLike> } {
    const bluetooth = (navigator as Navigator & {
      bluetooth?: { requestDevice(options: unknown): Promise<BluetoothDeviceLike> };
    }).bluetooth;

    if (!bluetooth) {
      throw new Error('Web Bluetooth nao esta disponivel neste navegador/dispositivo.');
    }

    return bluetooth;
  }
}

function concatUint8Arrays(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}
