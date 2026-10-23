"""Runs only inside the task-owned systemd user service; no desktop/session discovery."""
import json
import os
import selectors
import signal
import socket
import subprocess
import sys
import time


def identity(pid):
    with open('/proc/' + str(pid) + '/stat', encoding='ascii') as source:
        return source.read().rsplit(')', 1)[1].split()[19]


def main():
    host, expected, launch, executable, *args = sys.argv[1:]
    if os.getuid() == 0 or identity(host) != expected:
        return 2
    address = os.environ['NOTIFY_SOCKET']
    if address.startswith('@'):
        address = '\0' + address[1:]
    notify = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    notify.connect(address)
    allowed = {'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR',
               'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE',
               'DBUS_SESSION_BUS_ADDRESS', 'BOTHARNESS_MEDIA_USER_DATA',
               'BOTHARNESS_MEDIA_DISPLAY_GENERATION'}
    env = {key: value for key, value in os.environ.items() if key in allowed}
    child = subprocess.Popen([executable, *args], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
    print(json.dumps({'worker': os.getpid(), 'launchId': launch}), flush=True)
    notify.send(b'READY=1\nWATCHDOG=1')
    selector = selectors.DefaultSelector()
    selector.register(sys.stdin.buffer, selectors.EVENT_READ, 'input')
    selector.register(child.stdout, selectors.EVENT_READ, 'output')
    os.set_blocking(sys.stdout.fileno(), False)
    os.set_blocking(child.stdin.fileno(), False)
    last_ping = 0.0
    while child.poll() is None:
        if identity(host) != expected:
            return 1
        now = time.monotonic()
        if now - last_ping >= 0.5:
            notify.send(b'WATCHDOG=1')
            last_ping = now
        for key, _ in selector.select(0.1):
            data = os.read(key.fd, 32768)
            if not data:
                return 0
            target = child.stdin.fileno() if key.data == 'input' else sys.stdout.fileno()
            # Backpressure is a refusal, never an unbounded buffer or stalled watchdog.
            if os.write(target, data) != len(data):
                return 1
    return child.returncode


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        sys.exit(main())
    except Exception:
        # The user service owns all descendants and kills the cgroup on main exit.
        sys.exit(1)
