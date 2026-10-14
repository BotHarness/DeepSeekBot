export interface HostResponse {
  status: number;
  text(): Promise<string>;
}

export interface HostRequest {
  method: 'GET' | 'POST';
  body?: string;
  signal: AbortSignal;
}

export interface HostSocketEvents {
  open(): void;
  message(text: string): void;
  closed(reason: string): void;
}

export interface HostSocket {
  send(text: string): void;
  close(): void;
}

export interface HostCarrier {
  request(url: string, init: HostRequest): Promise<HostResponse>;
  openSocket(url: string, events: HostSocketEvents): HostSocket;
}
