package main

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestRelayIdentity(t *testing.T) {
	for _, value := range []string{
		"100.64.0.0", "100.127.255.255", "::ffff:100.64.0.1", "phone.tailnet.ts.net",
		"PHONE.TAILNET.TS.NET.", "localhost", "127.0.0.1", "::1", "127.example.com",
		"deepseekbot.dev", "nested.relay.deepseekbot.dev", "habcdef234567.botharness.dev",
		"habcdef234567.kite-u.com", "habcdef234567.tobs.app", "habcdef234567.deepseekbot.app",
		"habcdef234567.botharness.ai", "192.168.0.1",
	} {
		if got, err := relayIdentity(value); err == nil {
			t.Errorf("relayIdentity(%q) accepted %q", value, got)
		}
	}
	for input, want := range map[string]string{
		"RELAY.EXAMPLE.COM.": "relay.example.com",
		"relay.tobs.app":     "relay.tobs.app",
		"100.63.255.255":     "100.63.255.255",
		"100.128.0.0":        "100.128.0.0",
		"2001:db8::1":        "2001:db8::1",
	} {
		if got, err := relayIdentity(input); err != nil || got != want {
			t.Errorf("relayIdentity(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
}

func TestHTTP01ServesChallengesAndRedirects(t *testing.T) {
	handler := challengeOrRedirect("2001:db8::1", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "proof")
	}))
	challenge := httptest.NewRecorder()
	handler.ServeHTTP(challenge, httptest.NewRequest("GET", "/.well-known/acme-challenge/token", nil))
	if challenge.Code != 200 || challenge.Body.String() != "proof" {
		t.Fatalf("challenge returned %d %q", challenge.Code, challenge.Body.String())
	}
	redirect := httptest.NewRecorder()
	handler.ServeHTTP(redirect, httptest.NewRequest("GET", "http://other.example/health?probe=1", nil))
	if redirect.Code != 308 || redirect.Header().Get("Location") != "https://[2001:db8::1]/health?probe=1" {
		t.Fatalf("redirect returned %d %q", redirect.Code, redirect.Header().Get("Location"))
	}
}

func TestUpgradedSocketsUseSeparateBudget(t *testing.T) {
	dir := t.TempDir()
	relay, err := newRelay(dir, sampleToken("a"), filepath.Join(dir, "keys"))
	if err != nil {
		t.Fatal(err)
	}
	for i := range maxHosts {
		name := fmt.Sprintf("host-%d", i)
		relay.slots[name] = ownerState{Owner: digest(digest(name)), Phone: digest(digest(name + "-phone"))}
	}
	server := httptest.NewUnstartedServer(relay)
	server.Listener = newPendingListener(server.Listener)
	server.Config.ConnContext = pendingConnectionContext
	server.StartTLS()
	t.Cleanup(server.Close)
	t.Cleanup(relay.close)
	dialer := websocket.Dialer{TLSClientConfig: server.Client().Transport.(*http.Transport).TLSClientConfig}
	dial := func(path, token string) *websocket.Conn {
		conn, _, err := dialer.Dial("wss"+strings.TrimPrefix(server.URL, "https")+path, auth(token))
		if err != nil {
			t.Fatalf("upgrade %s: %v", path, err)
		}
		t.Cleanup(func() { conn.Close() })
		conn.SetReadDeadline(time.Now().Add(10 * time.Second))
		return conn
	}
	for i := range maxHosts {
		name := fmt.Sprintf("host-%d", i)
		host := dial("/host", digest(name))
		for range maxPhones {
			dial(channelPath, digest(name+"-phone"))
			mustMessage(t, host)
		}
	}
}

func TestPendingConnectionBudgetByPeer(t *testing.T) {
	listener := newPendingListener(nil)
	first := "192.0.2.1"
	for range maxPendingPerIP {
		if !listener.acquire(first) {
			t.Fatal("pending limit reached early for first peer")
		}
	}
	if listener.acquire(first) {
		t.Fatal("first peer exceeded its pending limit")
	}
	for i := range maxPendingConns - maxPendingPerIP {
		if !listener.acquire(fmt.Sprintf("192.0.2.%d", i+2)) {
			t.Fatal("pending limit reached early across peers")
		}
	}
	if listener.acquire("192.0.2.254") {
		t.Fatal("listener exceeded its pending limit")
	}
	listener.release(first)
	if !listener.acquire("192.0.2.254") {
		t.Fatal("closing a pending connection did not free capacity")
	}
}

type deadlineRecordingWriter struct {
	http.ResponseWriter
	deadlines chan time.Time
}

func (w deadlineRecordingWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	conn, rw, err := http.NewResponseController(w.ResponseWriter).Hijack()
	if err != nil {
		return nil, nil, err
	}
	return deadlineRecordingConn{Conn: conn, deadlines: w.deadlines}, rw, nil
}

type deadlineRecordingConn struct {
	net.Conn
	deadlines chan time.Time
}

func (c deadlineRecordingConn) SetWriteDeadline(deadline time.Time) error {
	c.deadlines <- deadline
	return c.Conn.SetWriteDeadline(deadline)
}

func TestFrameWriteAllowsPongWindow(t *testing.T) {
	dir := copyNodeState(t)
	relay, err := newRelay(dir, sampleToken("a"), filepath.Join(dir, "keys"))
	if err != nil {
		t.Fatal(err)
	}
	deadlines := make(chan time.Time, 8)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		relay.ServeHTTP(deadlineRecordingWriter{ResponseWriter: w, deadlines: deadlines}, r)
	}))
	t.Cleanup(server.Close)
	t.Cleanup(relay.close)
	host := openSocket(t, server.URL, "/host", auth(sampleToken("b")))
	openSocket(t, server.URL, channelPath, auth(sampleToken("c")))
	mustMessage(t, host)
	var last time.Time
	for len(deadlines) > 0 {
		last = <-deadlines
	}
	if remaining := time.Until(last); remaining < 2*pingInterval-time.Second {
		t.Fatalf("frame write deadline has %s remaining; want the %s pong window", remaining, 2*pingInterval)
	}
}
