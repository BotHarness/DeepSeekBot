package main

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-acme/lego/v4/certificate"
	"github.com/go-acme/lego/v4/challenge/tlsalpn01"
	"github.com/go-acme/lego/v4/lego"
	"github.com/go-acme/lego/v4/registration"
)

const acmeALPN = "acme-tls/1"

type acmeAccount struct {
	Key          []byte                 `json:"key"`
	Registration *registration.Resource `json:"registration,omitempty"`
	privateKey   crypto.PrivateKey
}

func (*acmeAccount) GetEmail() string                          { return "" }
func (a *acmeAccount) GetPrivateKey() crypto.PrivateKey        { return a.privateKey }
func (a *acmeAccount) GetRegistration() *registration.Resource { return a.Registration }

func (a *acmeAccount) save(path string, create bool) error {
	data, err := json.Marshal(a)
	if err != nil {
		return err
	}
	return writeAtomic(path, data, 0600, create)
}

func loadAccount(path string) (*acmeAccount, error) {
	data, err := os.ReadFile(path)
	var account acmeAccount
	if errors.Is(err, os.ErrNotExist) {
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return nil, err
		}
		account.Key, err = x509.MarshalECPrivateKey(key)
		if err != nil {
			return nil, err
		}
		if err := account.save(path, true); err != nil {
			return nil, err
		}
		account.privateKey = key
		return &account, nil
	}
	if err != nil {
		return nil, err
	}
	if json.Unmarshal(data, &account) != nil {
		return nil, errors.New("invalid saved ACME account")
	}
	account.privateKey, err = x509.ParseECPrivateKey(account.Key)
	return &account, err
}

type certificateManager struct {
	identity     string
	directoryURL string
	accountPath  string
	certPath     string
	challenges   *acmeChallenges
	current      atomic.Pointer[tls.Certificate]
}

func newCertificateManager(data, identity, challenge, directory string) (*certificateManager, error) {
	if challenge != "http-01" && challenge != "tls-alpn-01" {
		return nil, errors.New("ACME challenge must be http-01 or tls-alpn-01")
	}
	if directory == "" {
		directory = lego.LEDirectoryProduction
	}
	endpoint, err := url.Parse(directory)
	if err != nil || endpoint.Scheme != "https" || endpoint.Host == "" || endpoint.User != nil {
		return nil, errors.New("ACME directory must be an HTTPS URL without credentials")
	}
	state := filepath.Join(data, "acme", digest(directory))
	if err := os.MkdirAll(state, 0700); err != nil {
		return nil, err
	}
	m := &certificateManager{
		identity: identity, directoryURL: directory,
		accountPath: filepath.Join(state, "account.json"), certPath: filepath.Join(state, digest(identity)+".pem"),
		challenges: &acmeChallenges{identity: identity, mode: challenge},
	}
	pem, err := os.ReadFile(m.certPath)
	if errors.Is(err, os.ErrNotExist) {
		return m, nil
	}
	if err != nil {
		return nil, err
	}
	cert, err := m.parseCertificate(pem)
	if err != nil {
		return nil, err
	}
	m.current.Store(cert)
	return m, nil
}

func (m *certificateManager) parseCertificate(pem []byte) (*tls.Certificate, error) {
	cert, err := tls.X509KeyPair(pem, pem)
	if err != nil {
		return nil, err
	}
	if err := cert.Leaf.VerifyHostname(m.identity); err != nil {
		return nil, err
	}
	return &cert, nil
}

func certificateOrder(identity string) (certificate.ObtainForCSRRequest, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return certificate.ObtainForCSRRequest{}, err
	}
	var template x509.CertificateRequest
	order := certificate.ObtainForCSRRequest{Bundle: true, PrivateKey: key}
	if ip := net.ParseIP(identity); ip != nil {
		template.IPAddresses = []net.IP{ip}
		order.Profile = "shortlived"
	} else {
		template.DNSNames = []string{identity}
	}
	der, err := x509.CreateCertificateRequest(rand.Reader, &template, key)
	if err != nil {
		return order, err
	}
	order.CSR, err = x509.ParseCertificateRequest(der)
	return order, err
}

func (m *certificateManager) obtain() error {
	account, err := loadAccount(m.accountPath)
	if err != nil {
		return err
	}
	config := lego.NewConfig(account)
	config.CADirURL = m.directoryURL
	config.UserAgent = "tobs-relay"
	client, err := lego.NewClient(config)
	if err != nil {
		return err
	}
	if account.Registration == nil {
		account.Registration, err = client.Registration.Register(registration.RegisterOptions{TermsOfServiceAgreed: true})
		if err != nil {
			return err
		}
		if err := account.save(m.accountPath, false); err != nil {
			return err
		}
	}
	if m.challenges.mode == "http-01" {
		err = client.Challenge.SetHTTP01Provider(m.challenges)
	} else {
		err = client.Challenge.SetTLSALPN01Provider(m.challenges)
	}
	if err != nil {
		return err
	}
	order, err := certificateOrder(m.identity)
	if err != nil {
		return err
	}
	resource, err := client.Certificate.ObtainForCSR(order)
	if err != nil {
		return err
	}
	pem := append(resource.Certificate, resource.PrivateKey...)
	cert, err := m.parseCertificate(pem)
	if err != nil {
		return err
	}
	if err := writeAtomic(m.certPath, pem, 0600, false); err != nil {
		return err
	}
	m.current.Store(cert)
	return nil
}

func needsRenewal(cert *tls.Certificate, now time.Time) bool {
	if cert == nil {
		return true
	}
	leaf := cert.Leaf
	return !now.Before(leaf.NotAfter.Add(-leaf.NotAfter.Sub(leaf.NotBefore) / 3))
}

func (m *certificateManager) renew(ctx context.Context) {
	retry := time.Minute
	for {
		wait := time.Hour
		if needsRenewal(m.current.Load(), time.Now()) {
			if err := m.obtain(); err != nil {
				log.Printf("ACME certificate issuance failed, retrying in %s: %v", retry, err)
				wait = retry
				retry = min(2*retry, time.Hour)
			} else {
				log.Printf("ACME certificate ready for %s", m.identity)
				retry = time.Minute
			}
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (m *certificateManager) tlsConfig() *tls.Config {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12, NextProtos: []string{"http/1.1"}}
	cfg.GetCertificate = func(*tls.ClientHelloInfo) (*tls.Certificate, error) {
		cert := m.current.Load()
		if cert == nil || time.Now().After(cert.Leaf.NotAfter) {
			return nil, errors.New("relay certificate unavailable")
		}
		return cert, nil
	}
	cfg.GetConfigForClient = func(hello *tls.ClientHelloInfo) (*tls.Config, error) {
		if !slices.Equal(hello.SupportedProtos, []string{acmeALPN}) {
			return nil, nil
		}
		m.challenges.mu.RLock()
		defer m.challenges.mu.RUnlock()
		cert := m.challenges.alpnCert
		if cert == nil {
			return nil, errors.New("ACME challenge unavailable")
		}
		// RFC 8738 uses reverse-DNS SNI for IP challenges. The proof is bound to the certificate's IP SAN.
		if net.ParseIP(m.identity) == nil && !strings.EqualFold(m.identity, hello.ServerName) {
			return nil, errors.New("ACME challenge for a different name")
		}
		return &tls.Config{MinVersion: tls.VersionTLS12, NextProtos: []string{acmeALPN},
			Certificates: []tls.Certificate{*cert}}, nil
	}
	return cfg
}

type acmeChallenges struct {
	identity      string
	mode          string
	mu            sync.RWMutex
	token         string
	authorization string
	alpnCert      *tls.Certificate
}

func (c *acmeChallenges) Present(domain, token, authorization string) error {
	if domain != c.identity {
		return errors.New("ACME challenge for a different name")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.mode == "tls-alpn-01" {
		cert, err := tlsalpn01.ChallengeCert(domain, authorization)
		if err != nil {
			return err
		}
		c.alpnCert = cert
	}
	c.token = token
	c.authorization = authorization
	return nil
}

func (c *acmeChallenges) CleanUp(_, token, _ string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token == token {
		c.token, c.authorization, c.alpnCert = "", "", nil
	}
	return nil
}

func (c *acmeChallenges) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	host := req.Host
	if address, _, err := net.SplitHostPort(host); err == nil {
		host = address
	}
	host = strings.TrimSuffix(strings.Trim(host, "[]"), ".")
	if req.Method != http.MethodGet || !strings.EqualFold(host, c.identity) || c.token == "" ||
		req.URL.Path != "/.well-known/acme-challenge/"+c.token {
		http.NotFound(w, req)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte(c.authorization))
}
