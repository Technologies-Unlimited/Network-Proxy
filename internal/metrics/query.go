package metrics

import (
	"fmt"

	dto "github.com/prometheus/client_model/go"
)

// LocalQuerier exposes a tiny "query the registry directly" interface so the
// alerting engine can fetch the latest gauge value for a (device_id) without
// having to stand up an external Prometheus instance.
//
// It implements the alerting.PrometheusMetricSource client contract via
// LookupGauge / LookupCounter helpers — the alerting package only needs a
// `Query(string) (float64, error)`, but routing through typed lookups keeps
// the call sites readable and avoids parsing PromQL.
type LocalQuerier struct {
	reg *Registry
}

// NewLocalQuerier wraps a Registry for direct lookup.
func NewLocalQuerier(reg *Registry) *LocalQuerier {
	return &LocalQuerier{reg: reg}
}

// PingLatency returns the most recent ping latency (ms) for a device.
func (q *LocalQuerier) PingLatency(deviceID, ipAddress string) (float64, error) {
	return gaugeValue(q.reg.PingLatency.WithLabelValues(deviceID, ipAddress))
}

// DeviceStatus returns the most recent device status (1 = up, 0 = down).
func (q *LocalQuerier) DeviceStatus(deviceID, ipAddress string) (float64, error) {
	return gaugeValue(q.reg.DeviceStatus.WithLabelValues(deviceID, ipAddress, ""))
}

// gaugeValue extracts the float value from a Prometheus gauge metric. The
// client_golang API doesn't expose a value reader directly, so we round-trip
// through dto.Metric. Returns ErrNoSample if the gauge has never been set.
func gaugeValue(g interface{ Write(*dto.Metric) error }) (float64, error) {
	var m dto.Metric
	if err := g.Write(&m); err != nil {
		return 0, err
	}
	if m.Gauge == nil || m.Gauge.Value == nil {
		return 0, ErrNoSample
	}
	return *m.Gauge.Value, nil
}

// ErrNoSample is returned when a metric exists but has no recorded sample.
var ErrNoSample = fmt.Errorf("no sample recorded for metric")
