package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestConnectCodeExpiryReissueAndReplaySurviveRestart(t *testing.T) {
	dir := t.TempDir()
	// The standalone container shares /data for configuration and claim state.
	data, keys := dir, filepath.Join(dir, "hosts", "keys")
	const name = "office"
	const address = "relay.example.test"
	before, err := mintConnectCode(keys, address, name, -time.Second, false)
	if err != nil {
		t.Fatal(err)
	}
	_, oldKey, _ := strings.Cut(before, "#")
	_, token, _ := splitConnectCredential(oldKey)
	stored, err := os.ReadFile(connectCodePath(filepath.Dir(keys), name))
	if err != nil || strings.Contains(string(stored), token) || !strings.Contains(string(stored), digest(token)) {
		t.Fatal("expected only a hash in the stored code record")
	}

	origin := runTestRelay(t, data, keys)
	claim := `{"ownerToken":"` + sampleToken("1") + `","phoneToken":"` + sampleToken("2") + `"}`
	request(t, origin, "POST", "/claim", oldKey, claim, 410, `{"code":"connect-code-expired"}`)
	origin = runTestRelay(t, data, keys)
	request(t, origin, "POST", "/claim", oldKey, claim, 410, `{"code":"connect-code-expired"}`)
	after, err := mintConnectCode(keys, address, name, 15*time.Minute, true)
	if err != nil {
		t.Fatal(err)
	}
	_, freshKey, _ := strings.Cut(after, "#")
	request(t, origin, "POST", "/claim", oldKey, claim, 403, `{"code":"connect-code-refused"}`)
	request(t, origin, "POST", "/claim", freshKey, claim, 200, `{"claimed":true,"host":"office"}`)
	origin = runTestRelay(t, data, keys)
	request(t, origin, "POST", "/claim", freshKey, claim, 409, `{"code":"connect-code-used"}`)
	request(t, origin, "DELETE", "/claim", sampleToken("1"), "", 200, `{"released":true}`)
	origin = runTestRelay(t, data, keys)
	request(t, origin, "POST", "/claim", freshKey, claim, 409, `{"code":"connect-code-used"}`)
	t.Setenv("RELAY_DOMAIN", address)
	if _, err := addHost(dir, data, name, time.Minute, true); err == nil {
		t.Fatal("reissue accepted for a released Host")
	}
}
