package metrics

import (
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Registry holds all Prometheus metrics
type Registry struct {
	// Device status metrics
	DeviceStatus *prometheus.GaugeVec

	// ICMP metrics
	PingLatency *prometheus.GaugeVec
	PingSuccess *prometheus.CounterVec
	PingFailure *prometheus.CounterVec
	// PacketLoss is the per-poll ICMP packet-loss percentage (0-100). Before
	// this series existed the poller discarded stats.PacketLoss entirely and a
	// 75%-loss device read as fully "up" — this makes loss a first-class,
	// alertable metric.
	PacketLoss *prometheus.GaugeVec

	// sampledMu guards sampledStatus, the set of device IDs that have had a
	// real device-status sample recorded. It exists to make ErrNoSample
	// reachable: prometheus GaugeVec.WithLabelValues auto-creates a child at
	// value 0 on first access, so a never-polled device otherwise reads as a
	// legitimate "0" (down) and fires false Device Down alerts. Callers ask
	// HasStatusSample first and treat "not sampled" as UNKNOWN, not down.
	sampledMu     sync.RWMutex
	sampledStatus map[string]struct{}

	// SNMP metrics
	SNMPValue   *prometheus.GaugeVec
	SNMPSuccess *prometheus.CounterVec
	SNMPFailure *prometheus.CounterVec

	// Agent metrics
	AgentUp          *prometheus.GaugeVec
	DevicesMonitored *prometheus.GaugeVec
	PollDuration     *prometheus.HistogramVec
}

// NewRegistry creates and registers all Prometheus metrics
func NewRegistry() *Registry {
	return &Registry{
		sampledStatus: make(map[string]struct{}),

		DeviceStatus: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "network_device_status",
				Help: "Device status (1=up, 0=down)",
			},
			[]string{"device_id", "ip_address", "hostname"},
		),

		PingLatency: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "network_ping_latency_milliseconds",
				Help: "ICMP ping latency in milliseconds",
			},
			[]string{"device_id", "ip_address"},
		),

		PingSuccess: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "network_ping_success_total",
				Help: "Total number of successful pings",
			},
			[]string{"device_id", "ip_address"},
		),

		PingFailure: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "network_ping_failure_total",
				Help: "Total number of failed pings",
			},
			[]string{"device_id", "ip_address"},
		),

		PacketLoss: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "network_packet_loss_percent",
				Help: "ICMP packet loss percentage (0-100) from the most recent poll",
			},
			[]string{"device_id", "ip_address"},
		),

		SNMPValue: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "network_snmp_value",
				Help: "SNMP OID value",
			},
			[]string{"device_id", "ip_address", "oid_name"},
		),

		SNMPSuccess: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "network_snmp_success_total",
				Help: "Total number of successful SNMP queries",
			},
			[]string{"device_id", "ip_address"},
		),

		SNMPFailure: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Name: "network_snmp_failure_total",
				Help: "Total number of failed SNMP queries",
			},
			[]string{"device_id", "ip_address"},
		),

		AgentUp: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "network_agent_up",
				Help: "Agent status (1=up, 0=down)",
			},
			[]string{"agent_id", "agent_name"},
		),

		DevicesMonitored: promauto.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "network_devices_monitored",
				Help: "Number of devices being monitored",
			},
			[]string{"agent_id", "type"},
		),

		PollDuration: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "network_poll_duration_seconds",
				Help:    "Duration of polling operations",
				Buckets: prometheus.DefBuckets,
			},
			[]string{"agent_id", "type"},
		),
	}
}

// RecordDeviceStatus records device up/down status. It also marks the device
// as having a real sample so HasStatusSample can distinguish "polled and down"
// (a genuine 0) from "never polled" (no sample → treated as unknown).
func (r *Registry) RecordDeviceStatus(deviceID, ipAddress string, status float64) {
	r.DeviceStatus.WithLabelValues(deviceID, ipAddress, "").Set(status)
	r.sampledMu.Lock()
	r.sampledStatus[deviceID] = struct{}{}
	r.sampledMu.Unlock()
}

// HasStatusSample reports whether a real device-status sample has ever been
// recorded for the device. Used by the local querier to return ErrNoSample for
// never-polled devices instead of the auto-created gauge's phantom 0.
func (r *Registry) HasStatusSample(deviceID string) bool {
	r.sampledMu.RLock()
	defer r.sampledMu.RUnlock()
	_, ok := r.sampledStatus[deviceID]
	return ok
}

// RecordPacketLoss records the ICMP packet-loss percentage (0-100) for a device.
func (r *Registry) RecordPacketLoss(deviceID, ipAddress string, loss float64) {
	r.PacketLoss.WithLabelValues(deviceID, ipAddress).Set(loss)
}

// RecordPingSuccess records a successful ping
func (r *Registry) RecordPingSuccess(deviceID, ipAddress string, latency float64) {
	r.PingSuccess.WithLabelValues(deviceID, ipAddress).Inc()
	r.PingLatency.WithLabelValues(deviceID, ipAddress).Set(latency)
}

// RecordPingFailure records a failed ping
func (r *Registry) RecordPingFailure(deviceID, ipAddress string) {
	r.PingFailure.WithLabelValues(deviceID, ipAddress).Inc()
}

// RecordSNMPValue records an SNMP value
func (r *Registry) RecordSNMPValue(deviceID, ipAddress, oidName string, value interface{}) {
	// Try to convert value to float64
	var floatValue float64
	switch v := value.(type) {
	case int:
		floatValue = float64(v)
	case int64:
		floatValue = float64(v)
	case float64:
		floatValue = v
	case uint:
		floatValue = float64(v)
	case uint64:
		floatValue = float64(v)
	default:
		// Non-numeric values can't be stored as gauge
		return
	}

	r.SNMPValue.WithLabelValues(deviceID, ipAddress, oidName).Set(floatValue)
	r.SNMPSuccess.WithLabelValues(deviceID, ipAddress).Inc()
}

// RecordSNMPFailure records a failed SNMP query
func (r *Registry) RecordSNMPFailure(deviceID, ipAddress string) {
	r.SNMPFailure.WithLabelValues(deviceID, ipAddress).Inc()
}

// RecordAgentStatus records agent up/down status
func (r *Registry) RecordAgentStatus(agentID, agentName string, status float64) {
	r.AgentUp.WithLabelValues(agentID, agentName).Set(status)
}

// RecordDevicesMonitored records the number of devices being monitored
func (r *Registry) RecordDevicesMonitored(agentID, monitorType string, count float64) {
	r.DevicesMonitored.WithLabelValues(agentID, monitorType).Set(count)
}

// ForgetDevice removes every per-device metric series for the given device, plus
// its sampledStatus entry. It is the single drain point that keeps /metrics (and
// process RSS) from growing without bound as devices churn: promauto Vecs
// auto-create a child the first time a device is polled and NEVER remove it, so
// without this a removed device — or a device whose ip_address/hostname changed
// on edit (a fresh label set = a fresh, orphaned child) — leaves stale series
// that promhttp re-serializes on every scrape forever.
//
// It deletes by DeletePartialMatch on device_id alone (every per-device Vec has
// device_id as its first label), so it also reaps children orphaned by an
// ip_address/hostname/oid_name change, not just the current label set. Idempotent
// and safe to call for a device that has no recorded series. It intentionally
// does NOT touch the per-agent Vecs (AgentUp / DevicesMonitored / PollDuration),
// which are keyed by agent_id, not device_id.
//
// NOTE for future maintainers: any NEW per-device *Vec (one whose labels include
// device_id) MUST be drained here — the reflection-driven gate in
// registry_lifecycle_test.go enumerates the Registry and fails if a per-device
// Vec is left un-drained.
func (r *Registry) ForgetDevice(deviceID string) {
	sel := prometheus.Labels{"device_id": deviceID}
	r.DeviceStatus.DeletePartialMatch(sel)
	r.PingLatency.DeletePartialMatch(sel)
	r.PingSuccess.DeletePartialMatch(sel)
	r.PingFailure.DeletePartialMatch(sel)
	r.PacketLoss.DeletePartialMatch(sel)
	r.SNMPValue.DeletePartialMatch(sel)
	r.SNMPSuccess.DeletePartialMatch(sel)
	r.SNMPFailure.DeletePartialMatch(sel)

	r.sampledMu.Lock()
	delete(r.sampledStatus, deviceID)
	r.sampledMu.Unlock()
}
