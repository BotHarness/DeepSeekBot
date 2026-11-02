export interface HostResponse {
  status: number;
  text(): Promise<string>;
  bytes?(): Promise<Uint8Array>;
  contentType?: string;
}

export interface HostRequest {
  method: 'GET' | 'POST';
  body?: string | Blob;
  headers?: Record<string, string>;
  signal: AbortSignal;
}

export interface HostSocketEvents {
  open(): void;
  message(text: string): void;
  closed(reason: string): void;
}

export interface HostSocket {
  readonly bufferedAmount?: number;
  send(text: string): void;
  close(): void;
}

export interface HostCarrier {
  randomBytes?(): Uint8Array;
  close?(): void;
  request(url: string, init: HostRequest): Promise<HostResponse>;
  openSocket(url: string, events: HostSocketEvents, headers?: Record<string, string>): HostSocket;
}
