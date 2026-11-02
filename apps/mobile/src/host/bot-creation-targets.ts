export function botCreationTargets(hosts: readonly { hostId: string; name: string }[]) {
  return hosts.map((host) => {
    const peers = hosts.filter((other) => other.name === host.name);
    if (peers.length === 1) return { value: host.hostId, label: host.name };
    let length = Math.min(4, host.hostId.length);
    while (
      length < host.hostId.length &&
      peers.some(
        (other) =>
          other.hostId !== host.hostId &&
          other.hostId.slice(-length) === host.hostId.slice(-length),
      )
    )
      length++;
    return { value: host.hostId, label: `${host.name} · ${host.hostId.slice(-length)}` };
  });
}
