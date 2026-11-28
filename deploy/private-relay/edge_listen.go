package main

import (
	"errors"
	"net"
	"net/netip"
	"sync"
	"syscall"
)

// Tailscale's ranges: `tailscale serve` commonly owns :443 on these addresses.
var edgeSkippedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("fd7a:115c:a1e0::/48"),
}

// listenEdge binds TCP 443 on every address first. When another process already
// owns 443 on one interface (for example `tailscale serve`), the wildcard bind
// fails, so it falls back to binding each eligible interface address directly.
func listenEdge(explicit string) (net.Listener, error) {
	if explicit != "" {
		return net.Listen("tcp", explicit)
	}
	listener, err := net.Listen("tcp", ":443")
	if err == nil || !errors.Is(err, syscall.EADDRINUSE) {
		return listener, err
	}
	addresses, _ := net.InterfaceAddrs()
	var listeners []net.Listener
	for _, ip := range edgeBindCandidates(addresses) {
		l, bindErr := net.Listen("tcp", net.JoinHostPort(ip.String(), "443"))
		if bindErr == nil {
			listeners = append(listeners, l)
		}
	}
	if len(listeners) == 0 {
		return nil, err
	}
	return newMultiListener(listeners), nil
}

func edgeBindCandidates(addresses []net.Addr) []netip.Addr {
	var out []netip.Addr
	for _, address := range addresses {
		prefix, err := netip.ParsePrefix(address.String())
		if err != nil {
			continue
		}
		ip := prefix.Addr().Unmap()
		if !ip.IsValid() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsMulticast() || ip.IsUnspecified() {
			continue
		}
		skipped := false
		for _, p := range edgeSkippedPrefixes {
			if p.Contains(ip) {
				skipped = true
				break
			}
		}
		if !skipped {
			out = append(out, ip)
		}
	}
	return out
}

type acceptResult struct {
	conn net.Conn
	err  error
}

type multiListener struct {
	listeners []net.Listener
	accepted  chan acceptResult
	done      chan struct{}
	once      sync.Once
}

func newMultiListener(listeners []net.Listener) *multiListener {
	m := &multiListener{listeners: listeners, accepted: make(chan acceptResult), done: make(chan struct{})}
	for _, l := range listeners {
		go func(l net.Listener) {
			for {
				conn, err := l.Accept()
				select {
				case m.accepted <- acceptResult{conn, err}:
				case <-m.done:
					if conn != nil {
						_ = conn.Close()
					}
					return
				}
				if err != nil {
					return
				}
			}
		}(l)
	}
	return m
}

func (m *multiListener) Accept() (net.Conn, error) {
	select {
	case r := <-m.accepted:
		return r.conn, r.err
	case <-m.done:
		return nil, net.ErrClosed
	}
}

func (m *multiListener) Close() error {
	m.once.Do(func() {
		close(m.done)
		for _, l := range m.listeners {
			_ = l.Close()
		}
	})
	return nil
}

func (m *multiListener) Addr() net.Addr { return m.listeners[0].Addr() }
