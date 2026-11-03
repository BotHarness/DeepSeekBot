interface Connection {
  start(): void;
  stop(): void;
}

export function createConnectionLifetime(initialForeground: boolean) {
  const connections = new Map<
    Connection,
    { running: boolean; allowed: boolean; refused: boolean }
  >();
  let foreground = initialForeground;
  let background = false;
  function reconcile() {
    for (const [connection, demand] of connections) {
      if (demand.refused) continue;
      const needed = foreground || (background && demand.allowed);
      if (needed === demand.running) continue;
      demand.running = needed;
      if (needed) connection.start();
      else connection.stop();
    }
  }
  return {
    add(connection: Connection) {
      if (!connections.has(connection))
        connections.set(connection, { running: false, allowed: false, refused: false });
      reconcile();
    },
    remove(connection: Connection) {
      const running = connections.get(connection)?.running;
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
      }
    },
    foreground(value: boolean) {
      foreground = value;
      reconcile();
    },
    backgroundRunning(value: boolean) {
      background = value;
      reconcile();
    },
  };
}
