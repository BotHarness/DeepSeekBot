const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods';

interface RemoteMethodDescriptor {
  readonly version: 1;
  readonly methods: readonly {
    readonly method: string;
    readonly mode?: 'stream';
    readonly invocation: { readonly kind: 'direct' };
  }[];
}

export function markRemoteMethods(prototype: object, methods: readonly string[]): void {
  const descriptor: RemoteMethodDescriptor = {
    version: 1,
    methods: methods.map((method) =>
      Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }),
    ),
  };
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze(descriptor),
  });
}

export function markRemoteStreams(prototype: object, streams: readonly string[]): void {
  const marked = (prototype as Record<string, RemoteMethodDescriptor | undefined>)[
    REMOTE_METHOD_DESCRIPTOR
  ];
  const descriptor: RemoteMethodDescriptor = {
    version: 1,
    methods: [
      ...(marked?.methods ?? []),
      ...streams.map((method) =>
        Object.freeze({
          method,
          mode: 'stream' as const,
          invocation: Object.freeze({ kind: 'direct' as const }),
        }),
      ),
    ],
  };
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze(descriptor),
  });
}
