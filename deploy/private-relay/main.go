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
	"sync"
	"syscall"
	"time"
)

const requestTimeout = 10 * time.Second
const maxConnections = 256

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
	var challengeListener net.Listener
	if o.tlsMode == "acme" {
		identity, err := readIdentity(o.configDir)
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
	listener = &limitedListener{Listener: listener, permits: make(chan struct{}, maxConnections)}
	if manager != nil {
		listener = tls.NewListener(listener, manager.tlsConfig())
	}
	server := httpServer(relay)
	defer server.Close()
	failures := make(chan error, 2)
	if challengeListener != nil {
		challenges := httpServer(manager.challenges)
		defer challenges.Close()
		bounded := &limitedListener{Listener: challengeListener, permits: make(chan struct{}, maxConnections)}
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

type limitedListener struct {
	net.Listener
	permits chan struct{}
}

func (l *limitedListener) Accept() (net.Conn, error) {
	for {
		conn, err := l.Listener.Accept()
		if err != nil {
			return nil, err
		}
		select {
		case l.permits <- struct{}{}:
			return &limitedConnection{Conn: conn, release: func() { <-l.permits }}, nil
		default:
			_ = conn.Close()
		}
	}
}

type limitedConnection struct {
	net.Conn
	release func()
	once    sync.Once
}

func (c *limitedConnection) Close() error {
	err := c.Conn.Close()
	c.once.Do(c.release)
	return err
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
