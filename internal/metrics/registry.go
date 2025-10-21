package metrics

import (
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

// RecordDeviceStatus records device up/down status
func (r *Registry) RecordDeviceStatus(deviceID, ipAddress string, status float64) {
	r.DeviceStatus.WithLabelValues(deviceID, ipAddress, "").Set(status)
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
