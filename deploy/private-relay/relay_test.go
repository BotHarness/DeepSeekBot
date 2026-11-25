package main

import (
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func sampleToken(letter string) string { return strings.Repeat(letter, 64) }

func copyNodeState(t *testing.T) string {
	t.Helper()
	source := os.DirFS("testdata/node-v2")
	dest := t.TempDir()
	err := fs.WalkDir(source, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		target := filepath.Join(dest, path)
		if entry.IsDir() {
			return os.MkdirAll(target, 0700)
		}
		data, err := fs.ReadFile(source, path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0600)
	})
	if err != nil {
		t.Fatal(err)
	}
	return dest
}

func runTestRelay(t *testing.T, dir, keys string) string {
	t.Helper()
	relay, err := newRelay(dir, sampleToken("a"), keys)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(relay)
	t.Cleanup(func() {
		server.Close()
		relay.close()
	})
	return server.URL
}

func request(t *testing.T, origin, method, path, token, body string, status int, want string) {
	t.Helper()
	req, err := http.NewRequest(method, origin+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	got, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != status || string(got) != want || resp.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("%s %s: got %d %s, want %d %s", method, path, resp.StatusCode, got, status, want)
	}
}

func openSocket(t *testing.T, origin, path string, headers http.Header) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(origin, "http")+path, headers)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	return conn
}

func mustMessage(t *testing.T, conn *websocket.Conn) []byte {
	t.Helper()
	kind, frame, err := conn.ReadMessage()
	if err != nil || kind != websocket.TextMessage {
		t.Fatalf("read text message: %v", err)
	}
	return frame
}

func writeText(t *testing.T, conn *websocket.Conn, text string) {
	t.Helper()
	if err := conn.WriteMessage(websocket.TextMessage, []byte(text)); err != nil {
		t.Fatal(err)
	}
}

func auth(value string) http.Header { return http.Header{"Authorization": {"Bearer " + value}} }

func TestMigrateNodeState(t *testing.T) {
	dir := copyNodeState(t)
	origin := runTestRelay(t, dir, filepath.Join(dir, "keys"))
	for _, slot := range []struct{ name, key, owner, phone string }{
		{"default", "a", "b", "c"},
		{"office", "d", "1", "2"},
	} {
		t.Run(slot.name, func(t *testing.T) {
			request(t, origin, "POST", "/claim", sampleToken(slot.key), "", 409, `{"code":"already-claimed"}`)
			host := openSocket(t, origin, "/host", auth(sampleToken(slot.owner)))
			request(t, origin, "GET", "/status", sampleToken(slot.owner), "", 200,
				`{"connected":true,"host":"`+slot.name+`"}`)
			headers := http.Header{"Sec-Websocket-Protocol": {browserProtocol + ", botharness-admission." + sampleToken(slot.phone)}}
			phone := openSocket(t, origin, channelPath, headers)
			if phone.Subprotocol() != browserProtocol {
				t.Fatal("credential protocol was not replaced with the public protocol")
			}
			var open struct{ Type, ID string }
			if json.Unmarshal(mustMessage(t, host), &open) != nil || open.Type != "open" || len(open.ID) != 32 {
				t.Fatal("expected open event")
			}
			writeText(t, phone, "original pairing")
			var event struct{ Type, ID, Data string }
			if json.Unmarshal(mustMessage(t, host), &event) != nil || event.Type != "data" ||
				event.ID != open.ID || event.Data != "original pairing" {
				t.Fatal("existing phone credential did not route to its Host")
			}
			writeText(t, host, `{"type":"data","id":"`+open.ID+`","data":"reply"}`)
			if got := string(mustMessage(t, phone)); got != "reply" {
				t.Fatalf("reply = %q", got)
			}
		})
	}
	request(t, origin, "POST", "/claim", sampleToken("e"), "", 409, `{"code":"already-claimed"}`)
	request(t, origin, "GET", "/status", sampleToken("3"), "", 404, `{"code":"not-found"}`)
}

func TestClaimLimitsAndLiveKeys(t *testing.T) {
	dir := t.TempDir()
	keys := filepath.Join(dir, "hosts", "keys")
	origin := runTestRelay(t, filepath.Join(dir, "relay-data"), keys)
	request(t, origin, "POST", "/claim", sampleToken("d"), "", 403, `{"code":"claim-refused"}`)
	if err := addHost(dir, "office"); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(filepath.Join(dir, "host-office.secret"))
	if err != nil {
		t.Fatal(err)
	}
	token := strings.TrimSpace(string(body))
	request(t, origin, "POST", "/claim", token, strings.Repeat(" ", 1025), 413, `{"code":"body-too-large"}`)
	claim := `{"ownerToken":"` + sampleToken("1") + `","phoneToken":"` + sampleToken("2") + `","ignored":{"extra":true}}`
	request(t, origin, "POST", "/claim", token, claim, 200, `{"claimed":true,"host":"office"}`)
	request(t, origin, "POST", "/claim", sampleToken("a"), claim, 400, `{"code":"claim-invalid"}`)
	request(t, origin, "DELETE", "/claim", sampleToken("1"), "", 200, `{"released":true}`)
	request(t, origin, "POST", "/claim", token, claim, 409, `{"code":"already-claimed"}`)

	for i := range maxHosts + 1 {
		name := "host-" + strconv.Itoa(i)
		if err := addHost(dir, name); err != nil {
			t.Fatal(err)
		}
		key, err := os.ReadFile(filepath.Join(dir, "host-"+name+".secret"))
		if err != nil {
			t.Fatal(err)
		}
		body := `{"ownerToken":"` + digest("owner-"+name) + `","phoneToken":"` + digest("phone-"+name) + `"}`
		if i < maxHosts {
			request(t, origin, "POST", "/claim", strings.TrimSpace(string(key)), body, 200, `{"claimed":true,"host":"`+name+`"}`)
		} else {
			request(t, origin, "POST", "/claim", strings.TrimSpace(string(key)), body, 409, `{"code":"host-limit"}`)
		}
	}
}

func TestAdmissionRefusalsAndFrameLimits(t *testing.T) {
	dir := copyNodeState(t)
	origin := runTestRelay(t, dir, filepath.Join(dir, "keys"))
	host := openSocket(t, origin, "/host", auth(sampleToken("b")))
	for _, headers := range []http.Header{
		{"Authorization": {"Bearer " + sampleToken("c")}, "X-Botharness-Admission": {sampleToken("b")}},
		{"Authorization": {"Bearer " + sampleToken("c")}, "Cookie": {"key=value"}},
	} {
		conn, resp, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(origin, "http")+channelPath, headers)
		if conn != nil {
			conn.Close()
		}
		if err == nil || resp == nil || resp.StatusCode != 403 {
			t.Fatal("expected forbidden upgrade")
		}
		resp.Body.Close()
	}
	phone := openSocket(t, origin, channelPath, auth(sampleToken("c")))
	mustMessage(t, host)
	writeText(t, phone, strings.Repeat("a", maxFrame))
	frame := mustMessage(t, host)
	var event struct{ Type, Data string }
	if json.Unmarshal(frame, &event) != nil || event.Type != "data" || len(event.Data) != maxFrame {
		t.Fatal("maximum phone frame did not reach Host")
	}
	writeText(t, phone, strings.Repeat("a", maxFrame+1))
	if _, _, err := phone.ReadMessage(); err == nil {
		t.Fatal("oversized phone frame did not close phone")
	}
	if json.Unmarshal(mustMessage(t, host), &event) != nil || event.Type != "close" {
		t.Fatal("oversized phone frame did not announce close")
	}
	writeText(t, host, `{"type":"close","id":"`+strings.Repeat("0", 32)+`"}`)
	other := openSocket(t, origin, channelPath, auth(sampleToken("c")))
	mustMessage(t, host)
	writeText(t, host, `{"type":"data","id":"`+strings.Repeat("0", 32)+`"}`)
	if _, _, err := other.ReadMessage(); err == nil {
		t.Fatal("malformed control frame did not close the Host and its phone")
	}
}
