package main

import (
	"crypto/tls"
	"crypto/x509"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestACMEOrderProfileAndSAN(t *testing.T) {
	for _, identity := range []string{"relay.example.com", "198.51.100.7", "2001:db8::7"} {
		t.Run(identity, func(t *testing.T) {
			order, err := certificateOrder(identity)
			if err != nil {
				t.Fatal(err)
			}
			if order.CSR.Subject.CommonName != "" || order.CSR.CheckSignature() != nil || !order.Bundle {
				t.Fatal("expected a signed SAN-only CSR and bundled certificate")
			}
			if _, err := netip.ParseAddr(identity); err == nil {
				if order.Profile != "shortlived" || len(order.CSR.DNSNames) != 0 ||
					len(order.CSR.IPAddresses) != 1 || order.CSR.IPAddresses[0].String() != identity {
					t.Fatal("expected a short-lived IP SAN certificate")
				}
			} else if order.Profile != "" || len(order.CSR.IPAddresses) != 0 ||
				len(order.CSR.DNSNames) != 1 || order.CSR.DNSNames[0] != identity {
				t.Fatal("expected a default-profile DNS SAN certificate")
			}
		})
	}
}

func TestACMEChallengeRouting(t *testing.T) {
	manager, err := newCertificateManager(t.TempDir(), "198.51.100.7", "http-01", "")
	if err != nil {
		t.Fatal(err)
	}
	challenges := manager.challenges
	if err := challenges.Present(manager.identity, "token", "key-authorization"); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/health", "/claim", "/.well-known/acme-challenge/wrong"} {
		reply := httptest.NewRecorder()
		challenges.ServeHTTP(reply, httptest.NewRequest("GET", httpsOrigin(manager.identity)+path, nil))
		if reply.Code != 404 {
			t.Fatalf("unexpected status %d at %s", reply.Code, path)
		}
	}
	request := httptest.NewRequest("GET", httpsOrigin(manager.identity)+"/.well-known/acme-challenge/token", nil)
	reply := httptest.NewRecorder()
	challenges.ServeHTTP(reply, request)
	if reply.Code != 200 || reply.Body.String() != "key-authorization" {
		t.Fatal("HTTP challenge not served")
	}
	challenges.CleanUp(manager.identity, "token", "")
	reply = httptest.NewRecorder()
	challenges.ServeHTTP(reply, request)
	if reply.Code != 404 {
		t.Fatal("HTTP challenge still available after cleanup")
	}

	ipManager, err := newCertificateManager(t.TempDir(), "2001:db8::7", "tls-alpn-01", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := ipManager.challenges.Present(ipManager.identity, "token", "key-authorization"); err != nil {
		t.Fatal(err)
	}
	cfg := ipManager.tlsConfig()
	if _, err := cfg.GetCertificate(nil); err == nil {
		t.Fatal("normal clients received the challenge certificate")
	}
	special, err := cfg.GetConfigForClient(&tls.ClientHelloInfo{SupportedProtos: []string{acmeALPN}})
	if err != nil || special.Certificates[0].Leaf.VerifyHostname(ipManager.identity) != nil {
		t.Fatal("ALPN challenge certificate lacks the IPv6 SAN")
	}
	ipManager.challenges.CleanUp(ipManager.identity, "token", "")
	if _, err := cfg.GetConfigForClient(&tls.ClientHelloInfo{SupportedProtos: []string{acmeALPN}}); err == nil {
		t.Fatal("ALPN challenge still available after cleanup")
	}
}

func TestShortLivedRenewal(t *testing.T) {
	now := time.Now()
	cert := &tls.Certificate{Leaf: &x509.Certificate{NotBefore: now, NotAfter: now.Add(160 * time.Hour)}}
	if !needsRenewal(nil, now) || needsRenewal(cert, now.Add(106*time.Hour)) ||
		!needsRenewal(cert, now.Add(107*time.Hour)) {
		t.Fatal("expected renewal to start with just over two days of validity remaining")
	}
}

func TestSetupPreservesFilesAndPermissions(t *testing.T) {
	dir := t.TempDir()
	if err := setup(dir, "2001:db8::7"); err != nil {
		t.Fatal(err)
	}
	key := filepath.Join(dir, "bootstrap.secret")
	env := filepath.Join(dir, ".env")
	value, err := os.ReadFile(key)
	if err != nil {
		t.Fatal(err)
	}
	dotenv, err := os.ReadFile(env)
	if err != nil {
		t.Fatal(err)
	}
	if !secretPattern.MatchString(strings.TrimSpace(string(value))) ||
		string(dotenv) != "RELAY_DOMAIN=2001:db8::7\nRELAY_BOOTSTRAP="+string(value) {
		t.Fatal("setup files do not match the Compose format")
	}
	if err := setup(dir, "replacement.example.com"); err == nil {
		t.Fatal("second setup unexpectedly succeeded")
	}
	after, err := os.ReadFile(key)
	if err != nil || string(value) != string(after) {
		t.Fatal("repeated setup changed the bootstrap key")
	}
	for _, path := range []string{key, env} {
		info, err := os.Stat(path)
		if err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0600) {
			t.Fatal("setup file is not private")
		}
	}
}
