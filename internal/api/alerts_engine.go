package api

import (
	"net/http"
	"sync"

	"github.com/Technologies-Unlimited/Network-Proxy/internal/alerting"
)

var (
	alertEngineMu sync.RWMutex
	alertEngine   *alerting.Engine

	metricsHandlerMu sync.RWMutex
	metricsHandler   http.Handler
)

// SetAlertEngine wires the alerting engine into the API package so handlers
// (acknowledge, resolve, snapshot) can talk to the same in-memory state the
// background evaluator is mutating.
func SetAlertEngine(e *alerting.Engine) {
	alertEngineMu.Lock()
	defer alertEngineMu.Unlock()
	alertEngine = e
}

// GetAlertEngine returns the registered engine, or nil if none has been set.
func GetAlertEngine() *alerting.Engine {
	alertEngineMu.RLock()
	defer alertEngineMu.RUnlock()
	return alertEngine
}

// SetMetricsHandler installs the Prometheus collector handler. The router
// then mounts it at /api/v1/metrics inside the auth-gated group, so device
// inventory isn't world-readable. Operators can opt out (mount publicly)
// by setting METRICS_PUBLIC=true at startup.
func SetMetricsHandler(h http.Handler) {
	metricsHandlerMu.Lock()
	defer metricsHandlerMu.Unlock()
	metricsHandler = h
}

// GetMetricsHandler returns the registered handler, or nil if METRICS_PUBLIC
// is set (in which case main.go mounts the handler directly on the root).
func GetMetricsHandler() http.Handler {
	metricsHandlerMu.RLock()
	defer metricsHandlerMu.RUnlock()
	return metricsHandler
}
