interface Connection {
  start(): void;
  stop(): void;
}

export function createConnectionLifetime(initialForeground: boolean) {
  const connections = new Map<
    Connection,
    {
      running: boolean;
      allowed: boolean;
      refused: boolean;
      retained: Set<symbol>;
      releasing: Map<symbol, ReturnType<typeof setTimeout>>;
    }
  >();
  let foreground = initialForeground;
  let background = false;
  function reconcile() {
    for (const [connection, demand] of connections) {
      if (demand.refused) continue;
      const needed = foreground || demand.retained.size > 0 || (background && demand.allowed);
      if (needed === demand.running) continue;
      demand.running = needed;
      if (needed) connection.start();
      else connection.stop();
    }
  }
  return {
    add(connection: Connection) {
      if (!connections.has(connection))
        connections.set(connection, {
          running: false,
          allowed: false,
          refused: false,
          retained: new Set(),
          releasing: new Map(),
        });
      reconcile();
    },
    retain(connection: Connection, options: { untilForeground?: boolean } = {}): () => void {
      const demand = connections.get(connection);
      if (demand === undefined || demand.refused) return () => undefined;
      const token = Symbol();
      demand.retained.add(token);
      reconcile();
      let released = false;
      const finish = () => {
        clearTimeout(demand.releasing.get(token));
        demand.releasing.delete(token);
        if (connections.get(connection) !== demand || !demand.retained.delete(token)) return;
        reconcile();
      };
      return () => {
        if (released) return;
        released = true;
        if (
          options.untilForeground &&
          !foreground &&
          !demand.refused &&
          demand.retained.has(token) &&
          connections.get(connection) === demand
        )
          demand.releasing.set(token, setTimeout(finish, 1_500));
        else finish();
      };
    },
    retained(connection: Connection): boolean {
      const demand = connections.get(connection);
      return demand !== undefined && !demand.refused && demand.retained.size > 0;
    },
    remove(connection: Connection) {
      const demand = connections.get(connection);
      const running = demand?.running;
      for (const timer of demand?.releasing.values() ?? []) clearTimeout(timer);
      connections.delete(connection);
      if (running) connection.stop();
    },
    allowBackground(connection: Connection, value: boolean) {
      const demand = connections.get(connection);
      if (demand) demand.allowed = value;
      reconcile();
    },
    backgroundAllowed(connection: Connection): boolean {
      return connections.get(connection)?.allowed === true;
    },
    refused(connection: Connection) {
      const demand = connections.get(connection);
      if (demand) {
        demand.running = false;
        demand.refused = true;
        for (const timer of demand.releasing.values()) clearTimeout(timer);
        demand.releasing.clear();
      }
    },
    foreground(value: boolean) {
      foreground = value;
      if (value)
        for (const demand of connections.values()) {
          for (const [token, timer] of demand.releasing) {
            clearTimeout(timer);
            demand.retained.delete(token);
          }
          demand.releasing.clear();
        }
      reconcile();
    },
    backgroundRunning(value: boolean) {
      background = value;
      reconcile();
    },
  };
}
