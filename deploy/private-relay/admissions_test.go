package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestDeviceAdmissionSurvivesRelayRestart(t *testing.T) {
	dir := copyNodeState(t)
	keys := filepath.Join(dir, "keys")
	first, second := sampleToken("e"), sampleToken("f")
	owner := sampleToken("b")
	legacy := sampleToken("c")
	header := auth(owner)
	header.Set(protocolHeader, protocolV3)
	read := func(conn *websocket.Conn) []byte {
		t.Helper()
		if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
			t.Fatal(err)
		}
		return mustMessage(t, conn)
	}
	forbid := func(origin, path, token string) {
		t.Helper()
		conn, resp, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(origin, "http")+path, auth(token))
		if conn != nil {
			conn.Close()
		}
		if resp != nil {
			defer resp.Body.Close()
		}
		if err == nil || resp == nil || resp.StatusCode != http.StatusForbidden {
			t.Fatal("expected 403 upgrade refusal")
		}
	}
	sync := func(host *websocket.Conn, tokens ...string) {
		t.Helper()
		entries := make([]admission, 0, len(tokens))
		for _, token := range tokens {
			entries = append(entries, admission{Hash: digest(token)})
		}
		id := randomHex(16)
		body, err := json.Marshal(map[string]any{"type": "admissions", "id": id, "entries": entries})
		if err != nil {
			t.Fatal(err)
		}
		writeText(t, host, string(body))
		if got := string(read(host)); got != string(message("admissions-ack", id)) {
			t.Fatal("missing durable admission acknowledgement")
		}
	}
	exchange := func(origin string, host *websocket.Conn) {
		t.Helper()
		phone := openSocket(t, origin, channelPath, auth(second))
		var open struct{ ID, Type string }
		if err := json.Unmarshal(read(host), &open); err != nil || open.Type != "open" {
			t.Fatal("approved phone did not open")
		}
		writeText(t, phone, "still-approved")
		var data struct{ ID, Type, Data string }
		if err := json.Unmarshal(read(host), &data); err != nil ||
			data.ID != open.ID || data.Type != "data" || data.Data != "still-approved" {
			t.Fatal("approved phone traffic was lost")
		}
		writeText(t, host, `{"type":"data","id":"`+open.ID+`","data":"approved-reply"}`)
		if got := string(read(phone)); got != "approved-reply" {
			t.Fatal("approved phone reply was lost")
		}
	}

	func() {
		relay, err := newRelay(dir, sampleToken("a"), keys)
		if err != nil {
			t.Fatal(err)
		}
		server := httptest.NewServer(relay)
		defer server.Close()
		defer relay.close()
		host := openSocket(t, server.URL, "/host", header)
		forbid(server.URL, channelPath, legacy)
		sync(host, first, second)
		forbid(server.URL, channelPath, legacy)
		phone := openSocket(t, server.URL, channelPath, auth(first))
		read(host)
		sync(host, second)
		if err := phone.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
			t.Fatal(err)
		}
		if _, _, err := phone.ReadMessage(); err == nil || os.IsTimeout(err) {
			t.Fatal("revoked phone was left open")
		}
		read(host) // close notification for the revoked phone
		forbid(server.URL, channelPath, first)
		exchange(server.URL, host)
	}()

	restarted, err := newRelay(dir, sampleToken("a"), keys)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.close()
	slot := restarted.slots[defaultHost]
	if !slot.Managed || !slot.admits(digest(second)) || slot.admits(digest(first)) || slot.Phone == digest(legacy) {
		t.Fatal("restart did not read back the surviving admission and retired legacy token")
	}
	server := httptest.NewServer(restarted)
	defer server.Close()
	forbid(server.URL, "/host", owner)
	host := openSocket(t, server.URL, "/host", header)
	forbid(server.URL, channelPath, second)
	sync(host, second)
	forbid(server.URL, channelPath, first)
	exchange(server.URL, host)
}
