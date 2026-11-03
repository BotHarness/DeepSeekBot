interface Connection {
  start(): void;
  stop(): void;
}

export function createConnectionLifetime(initialForeground: boolean) {
  const connections = new Map<Connection, boolean>();
  let foreground = initialForeground;
  let background = false;
  function reconcile() {
    const needed = foreground || background;
    for (const [connection, running] of connections) {
      if (needed === running) continue;
      connections.set(connection, needed);
      if (needed) connection.start();
      else connection.stop();
    }
  }
  return {
    add(connection: Connection) {
      if (!connections.has(connection)) connections.set(connection, false);
      reconcile();
    },
    remove(connection: Connection) {
      const running = connections.get(connection);
      connections.delete(connection);
      if (running) connection.stop();
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
