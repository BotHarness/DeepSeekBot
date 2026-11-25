package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	requestTimeout  = 10 * time.Second
	maxPendingConns = 128
	maxPendingPerIP = 32
)

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

type options struct {
	configDir     string
	dataDir       string
	tlsMode       string
	listen        string
	httpListen    string
	httpsListen   string
	challenge     string
	acmeDirectory string
}

func serverOptions(flags *flag.FlagSet) *options {
	o := new(options)
	flags.StringVar(&o.configDir, "config-dir", envOr("RELAY_CONFIG_DIR", "."), "path containing setup files")
	flags.StringVar(&o.dataDir, "data", envOr("RELAY_DATA", "./relay-data"), "persistent data directory")
	flags.StringVar(&o.tlsMode, "tls", envOr("RELAY_TLS", "acme"), "acme or off")
	flags.StringVar(&o.listen, "listen", envOr("RELAY_LISTEN", "127.0.0.1:8080"), "HTTP listener in TLS-off mode")
	flags.StringVar(&o.httpListen, "http-listen", envOr("RELAY_HTTP_LISTEN", ":80"), "HTTP-01 listener in ACME mode")
	flags.StringVar(&o.httpsListen, "https-listen", envOr("RELAY_HTTPS_LISTEN", ":443"), "HTTPS listener in ACME mode")
	flags.StringVar(&o.challenge, "acme-challenge", envOr("RELAY_ACME_CHALLENGE", "http-01"), "ACME challenge: http-01 or tls-alpn-01")
	flags.StringVar(&o.acmeDirectory, "acme-directory", envOr("RELAY_ACME_DIRECTORY", ""), "override the Let's Encrypt production ACME directory URL")
	return o
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:]); err != nil && !errors.Is(err, flag.ErrHelp) {
		log.Print(err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	command := "serve"
	if len(args) > 0 && len(args[0]) > 0 && args[0][0] != '-' {
		command, args = args[0], args[1:]
	}
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	switch command {
	case "setup", "add-host":
		dir := flags.String("config-dir", envOr("RELAY_CONFIG_DIR", "."), "path containing setup files")
		if err := flags.Parse(args); err != nil {
			return err
		}
		if flags.NArg() != 1 {
			return fmt.Errorf("usage: tobs-relay %s [--config-dir DIR] NAME", command)
		}
		if command == "setup" {
			return setup(*dir, flags.Arg(0))
		}
		return addHost(*dir, flags.Arg(0))
	case "version":
		if len(args) != 0 {
			return errors.New("usage: tobs-relay version")
		}
		if info, ok := debug.ReadBuildInfo(); ok {
			for _, setting := range info.Settings {
				if setting.Key == "vcs.revision" {
					fmt.Printf("tobs-relay %s (%s)\n", info.Main.Version, setting.Value)
					return nil
				}
			}
		}
		fmt.Println("tobs-relay " + version)
		return nil
	case "serve", "health":
		o := serverOptions(flags)
		if err := flags.Parse(args); err != nil {
			return err
		}
		if flags.NArg() != 0 || (o.tlsMode != "acme" && o.tlsMode != "off") {
			return fmt.Errorf("usage: tobs-relay %s [--tls=acme|off] [options]", command)
		}
		if command == "health" {
			return health(ctx, o)
		}
		return serve(ctx, o)
	default:
		return errors.New("usage: tobs-relay [serve|setup|add-host|health|version]")
	}
}

var version = "dev"

func httpServer(handler http.Handler) *http.Server {
	return &http.Server{
		Handler: handler, ReadHeaderTimeout: requestTimeout, ReadTimeout: requestTimeout,
		WriteTimeout: requestTimeout, IdleTimeout: requestTimeout, MaxHeaderBytes: 16 * 1024,
	}
}

func serve(ctx context.Context, o *options) error {
	bootstrap, err := readBootstrap(o.configDir)
	if err != nil {
		return fmt.Errorf("read setup key (run tobs-relay setup first): %w", err)
	}
	keysPath := envOr("RELAY_HOST_KEYS_FILE", filepath.Join(o.configDir, "hosts", "keys"))
	relay, err := newRelay(o.dataDir, bootstrap, keysPath)
	if err != nil {
		return err
	}
	defer relay.close()

	mainAddr := o.listen
	var manager *certificateManager
	var identity string
	var challengeListener net.Listener
	if o.tlsMode == "acme" {
		identity, err = readIdentity(o.configDir)
		if err != nil {
			return err
		}
		manager, err = newCertificateManager(o.dataDir, identity, o.challenge, o.acmeDirectory)
		if err != nil {
			return err
		}
		mainAddr = o.httpsListen
		if o.challenge == "http-01" {
			challengeListener, err = net.Listen("tcp", o.httpListen)
			if err != nil {
				return err
			}
			defer challengeListener.Close()
		}
	}

	listener, err := net.Listen("tcp", mainAddr)
	if err != nil {
		return err
	}
	defer listener.Close()
	listener = newPendingListener(listener)
	if manager != nil {
		listener = tls.NewListener(listener, manager.tlsConfig())
	}
	server := httpServer(relay)
	server.ConnContext = pendingConnectionContext
	defer server.Close()
	failures := make(chan error, 2)
	if challengeListener != nil {
		challenges := httpServer(challengeOrRedirect(identity, manager.challenges))
		defer challenges.Close()
		bounded := newPendingListener(challengeListener)
		go func() { failures <- challenges.Serve(bounded) }()
	}
	go func() { failures <- server.Serve(listener) }()
	if manager != nil {
		go manager.renew(ctx)
	}
	log.Printf("relay listening on %s (%s, %s)", listener.Addr(), protocolV1, protocolV2)
	select {
	case <-ctx.Done():
		return nil
	case err := <-failures:
		return err
	}
}

func challengeOrRedirect(identity string, challenges http.Handler) http.Handler {
	origin := httpsOrigin(identity)
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/.well-known/acme-challenge/") {
			challenges.ServeHTTP(w, req)
			return
		}
		http.Redirect(w, req, origin+req.URL.RequestURI(), http.StatusPermanentRedirect)
	})
}

type pendingListener struct {
	net.Listener
	mu    sync.Mutex
	total int
	byIP  map[string]int
}

func newPendingListener(listener net.Listener) *pendingListener {
	return &pendingListener{Listener: listener, byIP: make(map[string]int)}
}

func (l *pendingListener) Accept() (net.Conn, error) {
	for {
		conn, err := l.Listener.Accept()
		if err != nil {
			return nil, err
		}
		ip, _, _ := net.SplitHostPort(conn.RemoteAddr().String())
		if l.acquire(ip) {
			return &pendingConnection{Conn: conn, release: func() { l.release(ip) }}, nil
		}
		_ = conn.Close()
	}
}

func (l *pendingListener) acquire(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.total >= maxPendingConns || l.byIP[ip] >= maxPendingPerIP {
		return false
	}
	l.total++
	l.byIP[ip]++
	return true
}

func (l *pendingListener) release(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.total--
	l.byIP[ip]--
	if l.byIP[ip] == 0 {
		delete(l.byIP, ip)
	}
}

type pendingConnection struct {
	net.Conn
	release func()
	once    sync.Once
}

func (c *pendingConnection) Close() error {
	err := c.Conn.Close()
	c.once.Do(c.release)
	return err
}

type pendingConnectionKey struct{}

func pendingConnectionContext(ctx context.Context, conn net.Conn) context.Context {
	if tlsConn, ok := conn.(*tls.Conn); ok {
		conn = tlsConn.NetConn()
	}
	if pending, ok := conn.(*pendingConnection); ok {
		return context.WithValue(ctx, pendingConnectionKey{}, pending)
	}
	return ctx
}

func releasePendingConnection(ctx context.Context) {
	if pending, ok := ctx.Value(pendingConnectionKey{}).(*pendingConnection); ok {
		pending.once.Do(pending.release)
	}
}

func health(ctx context.Context, o *options) error {
	scheme, listen := "http", o.listen
	var identity string
	if o.tlsMode == "acme" {
		scheme, listen = "https", o.httpsListen
		var err error
		identity, err = readIdentity(o.configDir)
		if err != nil {
			return err
		}
	}
	address, err := probeAddress(listen)
	if err != nil {
		return err
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{ServerName: identity, MinVersion: tls.VersionTLS12}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 3 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, scheme+"://"+address+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var body struct {
		Protocols []string
	}
	if resp.StatusCode != 200 || json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1024)).Decode(&body) != nil ||
		len(body.Protocols) != 2 || body.Protocols[0] != protocolV1 || body.Protocols[1] != protocolV2 {
		return errors.New("relay health probe failed")
	}
	fmt.Println("healthy")
	return nil
}
