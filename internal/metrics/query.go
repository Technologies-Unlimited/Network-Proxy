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

// PingLatency returns the most recent ping latency (ms) for a device. Returns
// ErrNoSample if the device has never been polled.
func (q *LocalQuerier) PingLatency(deviceID, ipAddress string) (float64, error) {
	if !q.reg.HasStatusSample(deviceID) {
		return 0, ErrNoSample
	}
	return gaugeValue(q.reg.PingLatency.WithLabelValues(deviceID, ipAddress))
}

// DeviceStatus returns the most recent device status (1 = up, 0 = down).
//
// It returns ErrNoSample for a device that has never been polled. Without this
// guard, GaugeVec.WithLabelValues auto-creates the series at 0 on first read, so
// a never-polled device would look exactly like a polled-and-down device and the
// alert engine would fire a false Device Down alert for it.
func (q *LocalQuerier) DeviceStatus(deviceID, ipAddress string) (float64, error) {
	if !q.reg.HasStatusSample(deviceID) {
		return 0, ErrNoSample
	}
	return gaugeValue(q.reg.DeviceStatus.WithLabelValues(deviceID, ipAddress, ""))
}

// PacketLoss returns the most recent ICMP packet-loss percentage (0-100) for a
// device. Returns ErrNoSample if the device has never been polled.
func (q *LocalQuerier) PacketLoss(deviceID, ipAddress string) (float64, error) {
	if !q.reg.HasStatusSample(deviceID) {
		return 0, ErrNoSample
	}
	return gaugeValue(q.reg.PacketLoss.WithLabelValues(deviceID, ipAddress))
}

// PingCounts returns the cumulative successful and failed ping counts recorded
// for a device this process lifetime. It is the real basis for an availability
// (uptime) figure: uptime% = success / (success + failure) * 100 — a genuine
// measured ratio, never a hardcoded constant.
//
// It returns ErrNoSample for a device that has never been polled (guarded by
// HasStatusSample BEFORE touching the counter Vecs, so a never-polled device
// does not auto-create phantom 0 children). A polled-but-always-down device
// legitimately returns success=0, failure=N (0% uptime) — that is real, not a
// missing sample, because the poller records a status sample on every poll.
func (q *LocalQuerier) PingCounts(deviceID, ipAddress string) (success, failure float64, err error) {
	if !q.reg.HasStatusSample(deviceID) {
		return 0, 0, ErrNoSample
	}
	success, err = counterValue(q.reg.PingSuccess.WithLabelValues(deviceID, ipAddress))
	if err != nil {
		return 0, 0, err
	}
	failure, err = counterValue(q.reg.PingFailure.WithLabelValues(deviceID, ipAddress))
	if err != nil {
		return 0, 0, err
	}
	return success, failure, nil
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

// counterValue extracts the float value from a Prometheus counter metric. Like
// gaugeValue it round-trips through dto.Metric because client_golang exposes no
// direct value reader. Returns ErrNoSample if the counter has never been set.
func counterValue(counter interface{ Write(*dto.Metric) error }) (float64, error) {
	var m dto.Metric
	if err := counter.Write(&m); err != nil {
		return 0, err
	}
	if m.Counter == nil || m.Counter.Value == nil {
		return 0, ErrNoSample
	}
	return *m.Counter.Value, nil
}

// ErrNoSample is returned when a metric exists but has no recorded sample.
var ErrNoSample = fmt.Errorf("no sample recorded for metric")
