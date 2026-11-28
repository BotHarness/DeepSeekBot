package main

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"

	"github.com/gorilla/websocket"
)

func TestEdgeForwardsOnlyDeviceUpgradeAndReadinessProbe(t *testing.T) {
	const token = "test-admission"
	const probe = "/.well-known/botharness-tunnel/0123456789abcdef0123456789abcdef"
	var requests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		requests.Add(1)
		if req.Header.Get("Cookie") != "" || req.Header.Get("X-Forwarded-For") != "" {
			t.Error("edge forwarded untrusted route context")
		}
		if req.RequestURI == probe {
			_, _ = fmt.Fprint(w, "nonce")
			return
		}
		if req.RequestURI != channelPath || req.Header.Get("X-Botharness-Admission") != token {
			t.Error("invalid upstream request")
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		upgrader := websocket.Upgrader{}
		ws, err := upgrader.Upgrade(w, req, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		defer ws.Close()
		kind, ciphertext, err := ws.ReadMessage()
		if err != nil {
			t.Errorf("read: %v", err)
			return
		}
		if err := ws.WriteMessage(kind, ciphertext); err != nil {
			t.Errorf("echo: %v", err)
		}
	}))
	defer upstream.Close()
	edge := httptest.NewTLSServer(edgeHandler(upstream.Listener.Addr().(*net.TCPAddr).Port))
	defer edge.Close()
	for _, path := range []string{"/", "/api", "/api/botharness/devices", "/health",
		channelPath, channelPath + "?test=1", "/%62otharness-device/channel", probe + "/"} {
		response, err := edge.Client().Get(edge.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusNotFound {
			t.Errorf("%s: got status %d", path, response.StatusCode)
		}
	}
	if requests.Load() != 0 {
		t.Fatal("rejected request reached the upstream")
	}
	response, err := edge.Client().Get(edge.URL + probe)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("probe: got status %d", response.StatusCode)
	}

	dialer := websocket.Dialer{
		TLSClientConfig: edge.Client().Transport.(*http.Transport).TLSClientConfig,
	}
	ws, _, err := dialer.Dial("wss"+strings.TrimPrefix(edge.URL, "https")+channelPath, http.Header{
		"X-Botharness-Admission": {token},
		"Cookie":                 {"session=do-not-forward"},
		"X-Forwarded-For":        {"203.0.113.1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	if err := ws.WriteMessage(websocket.BinaryMessage, []byte("opaque")); err != nil {
		t.Fatal(err)
	}
	kind, data, err := ws.ReadMessage()
	if err != nil || kind != websocket.BinaryMessage || string(data) != "opaque" {
		t.Fatalf("channel roundtrip: kind=%d payload=%q err=%v", kind, data, err)
	}
}

func TestEdgeBindFailureCodes(t *testing.T) {
	for failure, want := range map[error]string{
		syscall.EADDRINUSE:    "direct-port-busy",
		syscall.EACCES:        "direct-port-permission",
		syscall.EPERM:         "direct-port-permission",
		syscall.EADDRNOTAVAIL: "direct-bind-failed",
	} {
		if got := edgeBindIssue(fmt.Errorf("listen: %w", failure)); got != want {
			t.Errorf("%v: got %s, want %s", failure, got, want)
		}
	}
}

func TestEdgeBindCandidatesSkipTailscaleAndLoopback(t *testing.T) {
	addrs := []net.Addr{}
	for _, cidr := range []string{"127.0.0.1/8", "100.101.102.103/32", "fd7a:115c:a1e0::1/128",
		"fe80::1/64", "10.8.0.4/20", "203.0.113.7/24", "2001:db8::7/64"} {
		ip, network, err := net.ParseCIDR(cidr)
		if err != nil {
			t.Fatal(err)
		}
		network.IP = ip
		addrs = append(addrs, network)
	}
	var got []string
	for _, ip := range edgeBindCandidates(addrs) {
		got = append(got, ip.String())
	}
	if want := "10.8.0.4,203.0.113.7,2001:db8::7"; strings.Join(got, ",") != want {
		t.Fatalf("candidates = %v, want %s", got, want)
	}
}

func TestMultiListenerAcceptsFromEveryListener(t *testing.T) {
	var listeners []net.Listener
	for range 2 {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		listeners = append(listeners, l)
	}
	m := newMultiListener(listeners)
	defer m.Close()
	for _, l := range listeners {
		client, err := net.Dial("tcp", l.Addr().String())
		if err != nil {
			t.Fatal(err)
		}
		conn, err := m.Accept()
		if err != nil {
			t.Fatal(err)
		}
		if conn.LocalAddr().String() != l.Addr().String() {
			t.Fatalf("accepted on %s, want %s", conn.LocalAddr(), l.Addr())
		}
		conn.Close()
		client.Close()
	}
	m.Close()
	if _, err := m.Accept(); err == nil {
		t.Fatal("Accept after Close succeeded")
	}
}
