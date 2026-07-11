package api

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/middleware"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/models"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/netutil"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/safego"
	"github.com/Technologies-Unlimited/Network-Proxy/internal/thothos"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// defaultHeartbeatInterval is how often a live session reports liveness to
// ThothOS. It is a package var (not a const) purely so tests can shrink it to
// exercise the loop deterministically; production never overrides it.
var defaultHeartbeatInterval = 60 * time.Second

// configSyncMinInterval/configSyncMaxInterval bound the jittered cadence of the
// config re-pull loop. Jitter spreads load when many proxies reconnect at once.
// They are package vars only so tests can shrink them; production leaves the
// 60-120s window.
var (
	configSyncMinInterval = 60 * time.Second
	configSyncMaxInterval = 120 * time.Second
)

// ThothOSSessionConfig carries everything the session lifecycle needs to
// register the proxy and then run the heartbeat + config-pull loop. It is the
// single input to StartThothOSSession, which is called identically from the
// three entry points that can bring the proxy online: the boot path, the
// MFA-login flow, and the settings-connect flow. Before this existed, only the
// boot path ever started the heartbeat, so a proxy brought up via the wizard
// (login or settings) showed "online" with frozen counts until a restart.
type ThothOSSessionConfig struct {
	Client      *thothos.Client
	DB          *gorm.DB
	ProxyName   string
	Description string
	IPAddress   string
	Port        int
	Version     string

	// HeartbeatInterval overrides defaultHeartbeatInterval when > 0. Only tests
	// set this; the entry points leave it zero.
	HeartbeatInterval time.Duration
}

// thothosSession owns the single cancelable context under which the live
// heartbeat + config-pull loop runs. Every entry point routes through the one
// package-level instance (sessionManager) so there is ever only ONE liveness
// loop, and disconnect/logout can cancel it. A generation counter guarantees a
// superseded loop's cleanup can never clobber the state of a newer loop.
type thothosSession struct {
	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}
	gen    uint64
	active bool
}

var sessionManager = &thothosSession{}

// start cancels any prior loop and runs action under a fresh cancelable
// context in its own goroutine. Non-blocking: the caller does not wait for a
// prior loop to drain (a heartbeat is idempotent, so a brief overlap is
// harmless).
func (s *thothosSession) start(action func(ctx context.Context)) {
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	s.cancel = cancel
	s.done = done
	s.gen++
	myGen := s.gen
	s.active = true
	s.mu.Unlock()

	safego.Go("thothos-session", func() {
		defer func() {
			s.mu.Lock()
			// Only clear state if we are still the current generation; a
			// newer start()/stop() bumped gen and owns the state now.
			if s.gen == myGen {
				s.active = false
				s.cancel = nil
			}
			s.mu.Unlock()
			close(done)
		}()
		action(ctx)
	})
}

// waitStopped blocks until the currently-tracked loop goroutine has fully
// exited (including any in-flight heartbeat) or timeout elapses. Used for
// deterministic teardown in tests and could back a future graceful-shutdown
// wait; production StopThothOSSession stays non-blocking.
func (s *thothosSession) waitStopped(timeout time.Duration) {
	s.mu.Lock()
	done := s.done
	s.mu.Unlock()
	if done == nil {
		return
	}
	select {
	case <-done:
	case <-time.After(timeout):
	}
}

// stop cancels the running loop (if any) and marks the session inactive
// immediately. Safe to call when nothing is running.
func (s *thothosSession) stop() {
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.active = false
	s.gen++
	s.mu.Unlock()
}

func (s *thothosSession) isActive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.active
}

// StartThothOSSession registers (or re-registers) the proxy with ThothOS and,
// on success, launches the initial config pull and the heartbeat loop under a
// single cancelable context owned by the session manager. Any previously
// running session is cancelled first, so exactly one heartbeat loop is ever
// live. It returns the registered proxy config so the caller can log/inspect
// the proxy ID. On registration failure it returns the error and starts nothing.
func StartThothOSSession(cfg ThothOSSessionConfig) (*thothos.ProxyConfig, error) {
	proxyConfig, err := cfg.Client.RegisterProxy(thothos.ProxyRegistrationInput{
		ProxyName:   cfg.ProxyName,
		Description: cfg.Description,
		SupernetID:  "default",
		SubnetID:    "default",
		IPAddress:   cfg.IPAddress,
		Port:        cfg.Port,
		// No callback URL: the webhook push channel is removed; config reaches
		// the proxy via the pull-apply loop instead.
		CallbackURL: "",
		Version:     cfg.Version,
	})
	if err != nil {
		return nil, err
	}

	// Publish the proxy ID everywhere liveness needs it: the in-memory auth
	// context (used by the heartbeat client) and, when an install persists a
	// ProxyConfig row (the MFA-login flow), the row itself.
	middleware.UpdateProxyID(proxyConfig.ID)
	persistProxyRegistration(cfg.DB, proxyConfig.ID)

	interval := cfg.HeartbeatInterval
	if interval <= 0 {
		interval = defaultHeartbeatInterval
	}

	sessionManager.start(func(ctx context.Context) {
		// Apply the initial config concurrently so a slow ThothOS cannot delay
		// the first heartbeat. Unlike the old write-only ConfigCache pull, this
		// PERSISTS templates/OIDs into SQLite and retunes the live collectors.
		safego.Go("thothos-initial-config", func() {
			res := applyConfigFromClient(cfg.DB, cfg.Client)
			logApplyResult("initial", res)
		})
		// Re-pull + re-apply the config on a jittered 60-120s cadence. This is
		// the pull-based replacement for the removed webhook push channel: any
		// ThothOS-side template/OID change reaches the proxy within one cycle,
		// and the proxy keeps a persisted local copy for offline capability.
		safego.Go("thothos-config-sync", func() {
			runConfigSyncLoop(ctx, cfg)
		})
		// Report poller results (device up/down + latency + loss) UP to ThothOS
		// on a fixed cadence. This is the results-up channel — without it a down
		// router on the buyer's LAN is invisible in ThothOS; the only NM->ThothOS
		// data was the 5-scalar heartbeat.
		startResultsReporter(ctx, cfg)
		runHeartbeatLoop(ctx, cfg, interval)
	})

	return proxyConfig, nil
}

// runConfigSyncLoop re-pulls and re-applies the ThothOS config on a jittered
// cadence until ctx is cancelled (disconnect/logout/shutdown stops it cleanly).
func runConfigSyncLoop(ctx context.Context, cfg ThothOSSessionConfig) {
	log.Info().
		Dur("min", configSyncMinInterval).
		Dur("max", configSyncMaxInterval).
		Msg("ThothOS config-sync loop started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("ThothOS config-sync loop stopped")
			return
		case <-time.After(nextConfigSyncDelay()):
			res := applyConfigFromClient(cfg.DB, cfg.Client)
			logApplyResult("periodic", res)
		}
	}
}

// nextConfigSyncDelay returns a jittered delay in [min, max).
func nextConfigSyncDelay() time.Duration {
	span := configSyncMaxInterval - configSyncMinInterval
	if span <= 0 {
		return configSyncMinInterval
	}
	return configSyncMinInterval + time.Duration(rand.Int63n(int64(span)))
}

// StopThothOSSession cancels the live heartbeat + config-pull loop. Used by the
// disconnect/logout teardown and by graceful shutdown. Safe to call when no
// session is running.
func StopThothOSSession() {
	sessionManager.stop()
}

// ThothOSSessionActive reports whether a heartbeat loop is currently running.
func ThothOSSessionActive() bool {
	return sessionManager.isActive()
}

// persistProxyRegistration records the registered proxy ID and validation time
// on the persisted ProxyConfig row when one exists (the MFA-login flow). The
// settings-connect flow persists to the Settings table instead and has no
// ProxyConfig row, so this is a no-op there.
func persistProxyRegistration(db *gorm.DB, proxyID string) {
	if db == nil {
		return
	}
	var config models.ProxyConfig
	if err := db.First(&config).Error; err != nil {
		return
	}
	if err := db.Model(&config).Updates(map[string]interface{}{
		"proxy_id":       proxyID,
		"last_validated": time.Now(),
	}).Error; err != nil {
		log.Error().Err(err).Msg("Failed to persist proxy registration")
	}
}

// runHeartbeatLoop sends a heartbeat every interval until ctx is cancelled.
// This is the ONE liveness loop; cancelling ctx (disconnect/logout/shutdown)
// stops it cleanly.
func runHeartbeatLoop(ctx context.Context, cfg ThothOSSessionConfig, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Info().Dur("interval", interval).Msg("ThothOS heartbeat loop started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("ThothOS heartbeat loop stopped")
			return
		case <-ticker.C:
			sendHeartbeat(cfg)
		}
	}
}

// sendHeartbeat reports current node/device counts to ThothOS and, on success,
// stamps the local ProxyConfig.LastHeartbeat so the proxy's own /auth/status
// view is not permanently stale.
func sendHeartbeat(cfg ThothOSSessionConfig) {
	var nodeCount int64
	var deviceCount int64

	if err := cfg.DB.Model(&models.Node{}).Count(&nodeCount).Error; err != nil {
		log.Error().Err(err).Msg("Failed to count nodes for heartbeat")
	}
	if err := cfg.DB.Model(&models.Device{}).Count(&deviceCount).Error; err != nil {
		log.Error().Err(err).Msg("Failed to count devices for heartbeat")
	}

	_, err := cfg.Client.SendHeartbeat(thothos.HeartbeatStatus{
		IPAddress:   netutil.OutboundIP(),
		Port:        cfg.Port,
		Version:     cfg.Version,
		AgentCount:  int(nodeCount),
		DeviceCount: int(deviceCount),
	})
	if err != nil {
		log.Warn().Err(err).Msg("Failed to send heartbeat to ThothOS")
		return
	}

	stampLastHeartbeat(cfg.DB)
	log.Debug().
		Int64("nodes", nodeCount).
		Int64("devices", deviceCount).
		Msg("Heartbeat sent to ThothOS")
}

// stampLastHeartbeat best-effort records the heartbeat time on the persisted
// ProxyConfig row (MFA-login installs). No-op when no row exists.
func stampLastHeartbeat(db *gorm.DB) {
	if db == nil {
		return
	}
	var config models.ProxyConfig
	if err := db.First(&config).Error; err != nil {
		return
	}
	now := time.Now()
	if err := db.Model(&config).Update("last_heartbeat", now).Error; err != nil {
		log.Debug().Err(err).Msg("Failed to stamp last heartbeat on ProxyConfig")
	}
}

// teardownThothOSSession stops the live session and removes every persisted
// fallback a restart could use to silently reconnect, then flips the process
// into standalone mode. Shared by the settings "disconnect" and the login
// "logout" paths so both are coherent: no cosmetic-only disconnect, no
// heartbeat surviving a disconnect, no restart auto-reconnect, and — because
// standalone bypasses RequireAuth — the login and settings-reconnect endpoints
// stay reachable after logout instead of 401-bricking.
//
// It returns a non-nil error if EITHER persisted fallback failed to delete. The
// live session is still stopped and the process still flips to standalone (so
// the box stays usable), but a returned error means saved credentials may have
// SURVIVED on disk and could auto-reconnect on the next boot — the caller MUST
// surface that instead of reporting a clean "standalone mode".
func teardownThothOSSession(db *gorm.DB) error {
	// 1. Stop the heartbeat + config-pull loop.
	StopThothOSSession()

	// 2. Drop the in-memory auth state.
	middleware.SetGlobalAuthContext(nil)

	// 3. Delete BOTH persisted fallbacks. main.go's boot reads the Settings
	//    config (GetThothOSConfig) first and falls back to the ProxyConfig row
	//    (LoadConfigOnStartup); either surviving would auto-reconnect on the
	//    next boot, which is exactly the cosmetic-disconnect bug. Collect (not
	//    swallow) each error so a failed delete can be surfaced to the operator.
	var errs []error
	if err := models.ClearThothOSConfig(db); err != nil {
		log.Error().Err(err).Msg("Failed to clear ThothOS settings on teardown")
		errs = append(errs, err)
	}
	if err := db.Unscoped().Where("id > ?", 0).Delete(&models.ProxyConfig{}).Error; err != nil {
		log.Error().Err(err).Msg("Failed to clear ProxyConfig on teardown")
		errs = append(errs, fmt.Errorf("clearing ProxyConfig: %w", err))
	}

	// 4. Flip to standalone so the box stays usable and reconnect/login remain
	//    reachable, even if a persisted row could not be removed.
	middleware.SetStandaloneMode(true)

	return errors.Join(errs...)
}
