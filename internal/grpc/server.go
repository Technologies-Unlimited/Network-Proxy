package grpc

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	pb "github.com/Technologies-Unlimited/Network-Proxy/internal/grpc/pb/node"

	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Server represents the gRPC server for node communication
type Server struct {
	pb.UnimplementedNodeServiceServer
	pb.UnimplementedBandwidthServiceServer

	nodeID     string
	nodeName   string
	hostname   string
	ipAddress  string
	grpcPort   int
	version    string
	startTime  time.Time
	serverAddr string // Central server address for registration

	grpcServer *grpc.Server
	listener   net.Listener

	// Peer connections
	peers     map[string]*PeerConnection
	peersLock sync.RWMutex

	// Active bandwidth tests
	tests     map[string]*BandwidthTest
	testsLock sync.RWMutex

	// Callbacks
	onHeartbeat    func(nodeID string, status string)
	onPeerConnect  func(peerID, peerName string)
	onTestComplete func(testID string, results *pb.TestResults)

	// Security posture loaded from env at Start time. Reused for outbound
	// peer connections so client and server hold consistent expectations.
	security SecurityConfig
}

// PeerConnection represents a connection to another node
type PeerConnection struct {
	NodeID    string
	Name      string
	IPAddress string
	Port      int
	Status    string
	LatencyUs int64
	Conn      *grpc.ClientConn
	Client    pb.NodeServiceClient
	BwClient  pb.BandwidthServiceClient
	LastPing  time.Time
}

// BandwidthTest represents an active bandwidth test
type BandwidthTest struct {
	ID            string
	SourceNodeID  string
	TargetNodeID  string
	TestType      pb.TestType
	Duration      int32
	StartTime     time.Time
	State         pb.TestState
	BytesSent     int64
	BytesReceived int64
	Latencies     []int64
	Cancel        context.CancelFunc
}

// ServerConfig holds configuration for the gRPC server
type ServerConfig struct {
	NodeID     string
	NodeName   string
	Hostname   string
	IPAddress  string
	GRPCPort   int
	Version    string
	ServerAddr string
}

// NewServer creates a new gRPC server
func NewServer(cfg ServerConfig) *Server {
	return &Server{
		nodeID:     cfg.NodeID,
		nodeName:   cfg.NodeName,
		hostname:   cfg.Hostname,
		ipAddress:  cfg.IPAddress,
		grpcPort:   cfg.GRPCPort,
		version:    cfg.Version,
		serverAddr: cfg.ServerAddr,
		startTime:  time.Now(),
		peers:      make(map[string]*PeerConnection),
		tests:      make(map[string]*BandwidthTest),
	}
}

// Start starts the gRPC server. TLS and bearer-token auth are required by
// default; see SecurityConfig for the env-var contract and the explicit
// NODE_GRPC_ALLOW_INSECURE escape hatch for trusted environments.
func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.grpcPort)
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}
	s.listener = lis

	s.security = LoadSecurityConfigFromEnv()
	authOpts, err := s.security.ServerOptions()
	if err != nil {
		lis.Close()
		return err
	}

	opts := append([]grpc.ServerOption{
		grpc.MaxRecvMsgSize(GRPCMaxMsgSize),
		grpc.MaxSendMsgSize(GRPCMaxMsgSize),
		grpc.WriteBufferSize(GRPCWriteBufferSize),
		grpc.ReadBufferSize(GRPCReadBufferSize),
		grpc.InitialWindowSize(int32(GRPCInitWindowSize)),
		grpc.InitialConnWindowSize(int32(GRPCConnWindowSize)),
	}, authOpts...)

	s.grpcServer = grpc.NewServer(opts...)
	pb.RegisterNodeServiceServer(s.grpcServer, s)
	pb.RegisterBandwidthServiceServer(s.grpcServer, s)

	log.Printf("gRPC server starting on %s", addr)
	go func() {
		if err := s.grpcServer.Serve(lis); err != nil {
			log.Printf("gRPC server error: %v", err)
		}
	}()

	return nil
}

// Stop stops the gRPC server
func (s *Server) Stop() {
	if s.grpcServer != nil {
		s.grpcServer.GracefulStop()
	}
	if s.listener != nil {
		s.listener.Close()
	}

	// Close all peer connections
	s.peersLock.Lock()
	for _, peer := range s.peers {
		if peer.Conn != nil {
			peer.Conn.Close()
		}
	}
	s.peersLock.Unlock()
}

// ConnectToPeer establishes a connection to another node
func (s *Server) ConnectToPeer(nodeID, name, ipAddress string, port int) error {
	addr := fmt.Sprintf("%s:%d", ipAddress, port)

	authOpts, err := s.security.DialOptions()
	if err != nil {
		return fmt.Errorf("connect to peer %s: %w", addr, err)
	}

	dialOpts := append([]grpc.DialOption{
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(GRPCMaxMsgSize),
			grpc.MaxCallSendMsgSize(GRPCMaxMsgSize),
		),
		grpc.WithWriteBufferSize(GRPCWriteBufferSize),
		grpc.WithReadBufferSize(GRPCReadBufferSize),
		grpc.WithInitialWindowSize(int32(GRPCInitWindowSize)),
		grpc.WithInitialConnWindowSize(int32(GRPCConnWindowSize)),
	}, authOpts...)

	conn, err := grpc.NewClient(addr, dialOpts...)
	if err != nil {
		return fmt.Errorf("failed to connect to peer %s: %w", addr, err)
	}

	client := pb.NewNodeServiceClient(conn)
	bwClient := pb.NewBandwidthServiceClient(conn)

	// Send connect request
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := client.Connect(ctx, &pb.ConnectRequest{
		RequesterId:   s.nodeID,
		RequesterName: s.nodeName,
		RequesterIp:   s.ipAddress,
		RequesterPort: int32(s.grpcPort),
	})
	if err != nil {
		conn.Close()
		return fmt.Errorf("connect request failed: %w", err)
	}

	if !resp.Success {
		conn.Close()
		return fmt.Errorf("peer rejected connection: %s", resp.Message)
	}

	// Measure initial latency
	latency := s.measureLatency(client)

	peer := &PeerConnection{
		NodeID:    nodeID,
		Name:      name,
		IPAddress: ipAddress,
		Port:      port,
		Status:    "connected",
		LatencyUs: latency,
		Conn:      conn,
		Client:    client,
		BwClient:  bwClient,
		LastPing:  time.Now(),
	}

	s.peersLock.Lock()
	s.peers[nodeID] = peer
	s.peersLock.Unlock()

	if s.onPeerConnect != nil {
		s.onPeerConnect(nodeID, name)
	}

	log.Printf("Connected to peer %s (%s:%d) with latency %dus", name, ipAddress, port, latency)
	return nil
}

// DisconnectFromPeer closes connection to a peer
func (s *Server) DisconnectFromPeer(nodeID string) error {
	s.peersLock.Lock()
	defer s.peersLock.Unlock()

	peer, ok := s.peers[nodeID]
	if !ok {
		return fmt.Errorf("peer %s not found", nodeID)
	}

	if peer.Client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if _, err := peer.Client.Disconnect(ctx, &pb.DisconnectRequest{
			RequesterId: s.nodeID,
			Reason:      "user requested disconnect",
		}); err != nil {
			log.Printf("best-effort disconnect from peer %s failed: %v", nodeID, err)
		}
	}

	if peer.Conn != nil {
		peer.Conn.Close()
	}

	delete(s.peers, nodeID)
	return nil
}

// GetPeer returns a peer connection by ID
func (s *Server) GetPeer(nodeID string) (*PeerConnection, bool) {
	s.peersLock.RLock()
	defer s.peersLock.RUnlock()
	peer, ok := s.peers[nodeID]
	return peer, ok
}

// GetAllPeers returns all connected peers
func (s *Server) GetAllPeers() []*PeerConnection {
	s.peersLock.RLock()
	defer s.peersLock.RUnlock()

	peers := make([]*PeerConnection, 0, len(s.peers))
	for _, p := range s.peers {
		peers = append(peers, p)
	}
	return peers
}

// measureLatency sends ping requests and measures RTT
func (s *Server) measureLatency(client pb.NodeServiceClient) int64 {
	var totalLatency int64
	pings := 3

	for i := 0; i < pings; i++ {
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, err := client.Ping(ctx, &pb.PingRequest{
			RequesterId: s.nodeID,
			Sequence:    int64(i),
			SentAt:      timestamppb.Now(),
		})
		cancel()

		if err == nil {
			totalLatency += time.Since(start).Microseconds()
		}
	}

	if pings > 0 {
		return totalLatency / int64(pings)
	}
	return 0
}

// RefreshPeerLatency updates the latency measurement for a peer
func (s *Server) RefreshPeerLatency(nodeID string) (int64, error) {
	s.peersLock.RLock()
	peer, ok := s.peers[nodeID]
	s.peersLock.RUnlock()

	if !ok {
		return 0, fmt.Errorf("peer %s not found", nodeID)
	}

	latency := s.measureLatency(peer.Client)

	s.peersLock.Lock()
	if p, ok := s.peers[nodeID]; ok {
		p.LatencyUs = latency
		p.LastPing = time.Now()
	}
	s.peersLock.Unlock()

	return latency, nil
}

// NodeService implementations

// Heartbeat handles heartbeat requests from peers
func (s *Server) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	log.Printf("Received heartbeat from node %s", req.NodeId)

	if s.onHeartbeat != nil {
		s.onHeartbeat(req.NodeId, req.Status)
	}

	return &pb.HeartbeatResponse{
		Success:    true,
		Message:    "OK",
		ServerTime: timestamppb.Now(),
	}, nil
}

// GetNodeInfo returns information about this node
func (s *Server) GetNodeInfo(ctx context.Context, req *pb.GetNodeInfoRequest) (*pb.NodeInfo, error) {
	return &pb.NodeInfo{
		Id:        s.nodeID,
		Name:      s.nodeName,
		Hostname:  s.hostname,
		IpAddress: s.ipAddress,
		GrpcPort:  int32(s.grpcPort),
		Version:   s.version,
		Status:    "online",
		Capabilities: &pb.NodeCapabilities{
			SupportsIcmp:      true,
			SupportsSnmp:      true,
			SupportsDiscovery: true,
			SupportsBandwidth: true,
		},
		LastSeen: timestamppb.Now(),
	}, nil
}

// Ping handles ping requests for latency measurement
func (s *Server) Ping(ctx context.Context, req *pb.PingRequest) (*pb.PingResponse, error) {
	now := time.Now()
	var latencyUs int64
	if req.SentAt != nil {
		latencyUs = now.Sub(req.SentAt.AsTime()).Microseconds()
	}

	return &pb.PingResponse{
		Sequence:   req.Sequence,
		SentAt:     req.SentAt,
		ReceivedAt: timestamppb.New(now),
		LatencyUs:  latencyUs,
	}, nil
}

// DiscoverPeers returns list of known peers
func (s *Server) DiscoverPeers(ctx context.Context, req *pb.DiscoverPeersRequest) (*pb.DiscoverPeersResponse, error) {
	s.peersLock.RLock()
	defer s.peersLock.RUnlock()

	peers := make([]*pb.PeerInfo, 0, len(s.peers))
	for _, p := range s.peers {
		peers = append(peers, &pb.PeerInfo{
			NodeId:    p.NodeID,
			Name:      p.Name,
			IpAddress: p.IPAddress,
			GrpcPort:  int32(p.Port),
			Status:    p.Status,
			LatencyUs: p.LatencyUs,
		})
	}

	return &pb.DiscoverPeersResponse{
		Peers: peers,
	}, nil
}

// Connect handles incoming peer connection requests
func (s *Server) Connect(ctx context.Context, req *pb.ConnectRequest) (*pb.ConnectResponse, error) {
	log.Printf("Received connect request from %s (%s:%d)", req.RequesterName, req.RequesterIp, req.RequesterPort)

	// Store the incoming peer connection
	s.peersLock.Lock()
	s.peers[req.RequesterId] = &PeerConnection{
		NodeID:    req.RequesterId,
		Name:      req.RequesterName,
		IPAddress: req.RequesterIp,
		Port:      int(req.RequesterPort),
		Status:    "connected",
		LastPing:  time.Now(),
	}
	s.peersLock.Unlock()

	if s.onPeerConnect != nil {
		s.onPeerConnect(req.RequesterId, req.RequesterName)
	}

	return &pb.ConnectResponse{
		Success: true,
		Message: "Connection accepted",
		PeerId:  s.nodeID,
	}, nil
}

// Disconnect handles peer disconnection requests
func (s *Server) Disconnect(ctx context.Context, req *pb.DisconnectRequest) (*pb.DisconnectResponse, error) {
	log.Printf("Received disconnect request from %s: %s", req.RequesterId, req.Reason)

	s.peersLock.Lock()
	delete(s.peers, req.RequesterId)
	s.peersLock.Unlock()

	return &pb.DisconnectResponse{
		Success: true,
		Message: "Disconnected",
	}, nil
}

// SetHeartbeatCallback sets the heartbeat callback
func (s *Server) SetHeartbeatCallback(cb func(nodeID string, status string)) {
	s.onHeartbeat = cb
}

// SetPeerConnectCallback sets the peer connect callback
func (s *Server) SetPeerConnectCallback(cb func(peerID, peerName string)) {
	s.onPeerConnect = cb
}

// SetTestCompleteCallback sets the test complete callback
func (s *Server) SetTestCompleteCallback(cb func(testID string, results *pb.TestResults)) {
	s.onTestComplete = cb
}
