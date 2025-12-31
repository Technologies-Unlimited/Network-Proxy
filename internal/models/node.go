package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Node represents a monitoring node (renamed from Agent)
type Node struct {
	ID        string `gorm:"primaryKey" json:"id"`
	CompanyID string `gorm:"not null;index" json:"company_id"`
	Name      string `gorm:"not null;index" json:"name"`
	Hostname  string `gorm:"not null" json:"hostname"`
	IPAddress string `gorm:"not null" json:"ip_address"`
	Version   string `json:"version"`
	Status    string `gorm:"default:'offline'" json:"status"` // online, offline, connecting
	LastSeen  *time.Time `json:"last_seen"`
	CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// gRPC Configuration
	GRPCPort    int  `gorm:"default:50051" json:"grpc_port"`
	GRPCEnabled bool `gorm:"default:true" json:"grpc_enabled"`

	// Capabilities
	SupportsICMP      bool `gorm:"default:true" json:"supports_icmp"`
	SupportsSNMP      bool `gorm:"default:true" json:"supports_snmp"`
	SupportsDiscovery bool `gorm:"default:true" json:"supports_discovery"`
	SupportsBandwidth bool `gorm:"default:true" json:"supports_bandwidth"`

	// Relationships
	Devices     []Device    `gorm:"foreignKey:NodeID" json:"devices,omitempty"`
	SourcePeers []NodePeer  `gorm:"foreignKey:SourceNodeID" json:"source_peers,omitempty"`
	TargetPeers []NodePeer  `gorm:"foreignKey:TargetNodeID" json:"target_peers,omitempty"`
}

// BeforeCreate generates UUID for new nodes
func (n *Node) BeforeCreate(tx *gorm.DB) error {
	if n.ID == "" {
		n.ID = uuid.New().String()
	}
	return nil
}

// NodePeer represents a peer connection between two nodes
type NodePeer struct {
	ID           string `gorm:"primaryKey"`
	SourceNodeID string `gorm:"not null;index"`
	TargetNodeID string `gorm:"not null;index"`
	Status       string `gorm:"default:'disconnected'"` // connected, disconnected, connecting
	Latency      int64  // microseconds
	LastPing     *time.Time
	CreatedAt    time.Time      `gorm:"autoCreateTime"`
	UpdatedAt    time.Time      `gorm:"autoUpdateTime"`
	DeletedAt    gorm.DeletedAt `gorm:"index"`

	// Relationships
	SourceNode Node `gorm:"foreignKey:SourceNodeID"`
	TargetNode Node `gorm:"foreignKey:TargetNodeID"`
}

// BeforeCreate generates UUID for new node peers
func (np *NodePeer) BeforeCreate(tx *gorm.DB) error {
	if np.ID == "" {
		np.ID = uuid.New().String()
	}
	return nil
}

// BandwidthTestResult stores the result of a bandwidth test between nodes
type BandwidthTestResult struct {
	ID            string `gorm:"primaryKey"`
	SourceNodeID  string `gorm:"not null;index"`
	TargetNodeID  string `gorm:"not null;index"`
	TestType      string // "upload", "download", "bidirectional"
	StartTime     time.Time
	EndTime       *time.Time
	Duration      int64   // milliseconds
	BytesSent     int64
	BytesReceived int64
	UploadSpeed   float64 // Mbps
	DownloadSpeed float64 // Mbps
	AvgLatency    int64   // microseconds
	MinLatency    int64   // microseconds
	MaxLatency    int64   // microseconds
	PacketLoss    float64 // percentage
	Status        string  // running, completed, failed, cancelled
	ErrorMessage  string
	// Time-series data for charting (stored as JSON)
	LatencySamples string `gorm:"type:text" json:"latency_samples"` // JSON array of latency values in microseconds

	// Network path configuration
	TestMode            string `gorm:"default:'direct'" json:"test_mode"`       // "direct", "local", "gateway"
	GatewayAddress      string `json:"gateway_address,omitempty"`               // Gateway IP:port when test_mode is "gateway"
	ActualTargetAddress string `json:"actual_target_address,omitempty"`         // The actual IP:port used for the test

	CreatedAt time.Time      `gorm:"autoCreateTime"`
	DeletedAt gorm.DeletedAt `gorm:"index"`

	// Relationships
	SourceNode Node `gorm:"foreignKey:SourceNodeID"`
	TargetNode Node `gorm:"foreignKey:TargetNodeID"`
}

// BeforeCreate generates UUID for new bandwidth test results
func (btr *BandwidthTestResult) BeforeCreate(tx *gorm.DB) error {
	if btr.ID == "" {
		btr.ID = uuid.New().String()
	}
	return nil
}

// ScheduledTest represents a recurring bandwidth test between nodes
type ScheduledTest struct {
	ID           string `gorm:"primaryKey"`
	SourceNodeID string `gorm:"not null;index"`
	TargetNodeID string `gorm:"not null;index"`
	Name         string `gorm:"not null"`
	CronSchedule string // e.g., "0 */6 * * *" for every 6 hours
	TestType     string `gorm:"default:'bidirectional'"` // upload, download, bidirectional
	Duration     int    `gorm:"default:30"`              // seconds
	Enabled      bool   `gorm:"default:true"`
	LastRun      *time.Time
	NextRun      *time.Time
	CreatedAt    time.Time      `gorm:"autoCreateTime"`
	UpdatedAt    time.Time      `gorm:"autoUpdateTime"`
	DeletedAt    gorm.DeletedAt `gorm:"index"`

	// Relationships
	SourceNode Node `gorm:"foreignKey:SourceNodeID"`
	TargetNode Node `gorm:"foreignKey:TargetNodeID"`
}

// BeforeCreate generates UUID for new scheduled tests
func (st *ScheduledTest) BeforeCreate(tx *gorm.DB) error {
	if st.ID == "" {
		st.ID = uuid.New().String()
	}
	return nil
}
