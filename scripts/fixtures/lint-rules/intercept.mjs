export function install(connection, gateway) {
  connection.rpc.intercept('/api', () => {});
  connection.rpc.intercept('/rpc', () => {});
  gateway.register('/api/bots', () => {});
  connection.rpc.intercept(`/api/bots`, () => {});
}
