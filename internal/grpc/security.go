package grpc

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/envcfg"
	"github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// SecurityConfig describes the auth/TLS posture for the node-to-node gRPC
// surface. Configuration is read from environment variables so operators can
// enable hardening without code changes:
//
//	NODE_GRPC_SHARED_SECRET   bearer token required on every RPC
//	NODE_GRPC_TLS_CERT        path to PEM-encoded server certificate
//	NODE_GRPC_TLS_KEY         path to PEM-encoded server key
//	NODE_GRPC_TLS_CLIENT_CA   path to PEM-encoded CA used to verify peers
//	NODE_GRPC_ALLOW_INSECURE  if "true", explicitly opt in to plaintext +
//	                          missing token (default: refuse to start)
type SecurityConfig struct {
	SharedSecret string
	ServerCert   string
	ServerKey    string
	ClientCA     string
	AllowInsecure bool

	// AllowInsecureNoAuth must be explicitly set to true (via env var
	// NODE_GRPC_INSECURE_NO_AUTH_OK) to start the server with both
	// plaintext transport AND no shared-secret auth. Without this, the
	// AllowInsecure path still requires a SharedSecret. The previous code
	// silently allowed wide-open peer-to-peer with one env var.
	AllowInsecureNoAuth bool
}

// LoadSecurityConfigFromEnv reads the SecurityConfig from process env.
func LoadSecurityConfigFromEnv() SecurityConfig {
	return SecurityConfig{
		SharedSecret:  os.Getenv("NODE_GRPC_SHARED_SECRET"),
		ServerCert:    os.Getenv("NODE_GRPC_TLS_CERT"),
		ServerKey:     os.Getenv("NODE_GRPC_TLS_KEY"),
		ClientCA:      os.Getenv("NODE_GRPC_TLS_CLIENT_CA"),
		AllowInsecure:    envcfg.Bool("NODE_GRPC_ALLOW_INSECURE"),
		// AllowInsecureNoAuth is the explicit opt-in required when an
		// operator wants plaintext AND no shared-secret auth. Without this,
		// the AllowInsecure path still requires NODE_GRPC_SHARED_SECRET so
		// peer-to-peer can't be silently world-open by setting one env.
		AllowInsecureNoAuth: envcfg.Bool("NODE_GRPC_INSECURE_NO_AUTH_OK"),
	}
}

// ServerOptions returns the gRPC ServerOptions implied by this config:
// TLS credentials when cert/key are provided, plus a unary/stream interceptor
// pair that enforces the shared-secret bearer token. If the config is empty
// and AllowInsecure is false, an error is returned so the operator can't
// silently start an unauthenticated, plaintext server.
func (c SecurityConfig) ServerOptions() ([]grpc.ServerOption, error) {
	var opts []grpc.ServerOption

	switch {
	case c.ServerCert != "" && c.ServerKey != "":
		creds, err := loadServerTLS(c.ServerCert, c.ServerKey, c.ClientCA)
		if err != nil {
			return nil, err
		}
		opts = append(opts, grpc.Creds(creds))
	case c.AllowInsecure:
		opts = append(opts, grpc.Creds(insecure.NewCredentials()))
	default:
		return nil, errors.New(
			"gRPC TLS not configured: set NODE_GRPC_TLS_CERT/NODE_GRPC_TLS_KEY " +
				"(and optionally NODE_GRPC_TLS_CLIENT_CA), or set " +
				"NODE_GRPC_ALLOW_INSECURE=true to explicitly opt in to plaintext")
	}

	// Auth posture. Three valid states:
	//   1. SharedSecret set         -> bearer-token interceptors installed
	//   2. SharedSecret empty + AllowInsecureNoAuth=true -> no auth, log Warn
	//   3. anything else            -> refuse to start
	//
	// pathValidationUnary/Stream run FIRST in both cases. This is defense
	// in depth against CVE-2026-33186 (gRPC-Go authz bypass via malformed
	// :path) — the advisory recommends an outermost interceptor that
	// rejects any method name that doesn't start with "/", because
	// authorization logic downstream may key on the raw string.
	switch {
	case c.SharedSecret != "":
		opts = append(opts,
			grpc.ChainUnaryInterceptor(pathValidationUnary, unaryAuthInterceptor(c.SharedSecret)),
			grpc.ChainStreamInterceptor(pathValidationStream, streamAuthInterceptor(c.SharedSecret)),
		)
	case c.AllowInsecureNoAuth:
		log.Warn().Msg(
			"NODE_GRPC_INSECURE_NO_AUTH_OK=true and no NODE_GRPC_SHARED_SECRET: " +
				"gRPC peer surface is OPEN — anyone reachable can run bandwidth tests / peer ops")
		opts = append(opts,
			grpc.UnaryInterceptor(pathValidationUnary),
			grpc.StreamInterceptor(pathValidationStream),
		)
	default:
		return nil, errors.New(
			"gRPC shared secret not configured: set NODE_GRPC_SHARED_SECRET, " +
				"or set NODE_GRPC_INSECURE_NO_AUTH_OK=true to explicitly accept an unauthenticated server")
	}

	return opts, nil
}

// pathValidationUnary rejects any request whose FullMethod does not start
// with a leading "/". The gRPC HTTP/2 spec requires the :path pseudo-header
// to be canonical ("/Service/Method"). Before v1.79.3, the gRPC-Go server
// accepted malformed paths and routed them correctly but passed the raw
// non-canonical string to authorization interceptors, which could match
// "deny" rules only against canonical paths — bypassing the policy.
// This interceptor is the "outermost validating interceptor" the advisory
// recommends as defense in depth, independent of the upstream patch.
func pathValidationUnary(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	if info.FullMethod == "" || info.FullMethod[0] != '/' {
		return nil, status.Error(codes.Unimplemented, "malformed method name")
	}
	return handler(ctx, req)
}

// pathValidationStream is the streaming counterpart to pathValidationUnary.
func pathValidationStream(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
	if info.FullMethod == "" || info.FullMethod[0] != '/' {
		return status.Error(codes.Unimplemented, "malformed method name")
	}
	return handler(srv, ss)
}

// DialOptions returns the client-side dial options consistent with this
// config: matching TLS credentials and per-RPC bearer-token credentials.
func (c SecurityConfig) DialOptions() ([]grpc.DialOption, error) {
	var opts []grpc.DialOption

	switch {
	case c.ServerCert != "" || c.ClientCA != "":
		creds, err := loadClientTLS(c.ClientCA)
		if err != nil {
			return nil, err
		}
		opts = append(opts, grpc.WithTransportCredentials(creds))
	case c.AllowInsecure:
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	default:
		return nil, errors.New(
			"gRPC client TLS not configured: provide NODE_GRPC_TLS_CLIENT_CA or " +
				"set NODE_GRPC_ALLOW_INSECURE=true")
	}

	if c.SharedSecret != "" {
		opts = append(opts, grpc.WithPerRPCCredentials(bearerToken{token: c.SharedSecret}))
	}

	return opts, nil
}

func loadServerTLS(certPath, keyPath, clientCAPath string) (credentials.TransportCredentials, error) {
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("load TLS keypair: %w", err)
	}
	cfg := &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{cert},
	}
	if clientCAPath != "" {
		caPEM, err := os.ReadFile(clientCAPath)
		if err != nil {
			return nil, fmt.Errorf("read client CA: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caPEM) {
			return nil, fmt.Errorf("client CA file %q contained no usable certs", clientCAPath)
		}
		cfg.ClientAuth = tls.RequireAndVerifyClientCert
		cfg.ClientCAs = pool
	}
	return credentials.NewTLS(cfg), nil
}

func loadClientTLS(caPath string) (credentials.TransportCredentials, error) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if caPath != "" {
		caPEM, err := os.ReadFile(caPath)
		if err != nil {
			return nil, fmt.Errorf("read CA: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caPEM) {
			return nil, fmt.Errorf("CA file %q contained no usable certs", caPath)
		}
		cfg.RootCAs = pool
	}
	return credentials.NewTLS(cfg), nil
}

// bearerToken is a per-RPC credential type that adds an Authorization header.
type bearerToken struct{ token string }

func (b bearerToken) GetRequestMetadata(_ context.Context, _ ...string) (map[string]string, error) {
	return map[string]string{"authorization": "Bearer " + b.token}, nil
}

func (b bearerToken) RequireTransportSecurity() bool {
	// Don't allow bearer tokens to leak over plaintext connections.
	return true
}

func unaryAuthInterceptor(secret string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		if err := verifyBearer(ctx, secret); err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

func streamAuthInterceptor(secret string) grpc.StreamServerInterceptor {
	return func(srv interface{}, ss grpc.ServerStream, _ *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		if err := verifyBearer(ss.Context(), secret); err != nil {
			return err
		}
		return handler(srv, ss)
	}
}

func verifyBearer(ctx context.Context, secret string) error {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return status.Error(codes.Unauthenticated, "missing metadata")
	}
	values := md.Get("authorization")
	if len(values) == 0 {
		return status.Error(codes.Unauthenticated, "missing authorization")
	}
	const prefix = "Bearer "
	got := values[0]
	if !strings.HasPrefix(got, prefix) || !subtleEqual(got[len(prefix):], secret) {
		return status.Error(codes.Unauthenticated, "invalid bearer token")
	}
	return nil
}

// subtleEqual compares two strings in constant time.
func subtleEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := 0; i < len(a); i++ {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}
