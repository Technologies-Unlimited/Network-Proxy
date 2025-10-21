.PHONY: build server agent clean test fmt lint build-all docker-build docker-compose-up help

# Build variables
BINARY_SERVER=network-monitor-server
BINARY_AGENT=network-monitor-agent
DIST_DIR=dist

# Build server
server:
	@echo "Building server..."
	go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_SERVER).exe ./cmd/server

# Build agent
agent:
	@echo "Building agent..."
	go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_AGENT).exe ./cmd/agent

# Build both
build: server agent
	@echo "Build complete!"

# Build for all platforms
build-all:
	@echo "Building for all platforms..."
	@mkdir -p $(DIST_DIR)
	# Windows
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_SERVER)-windows-amd64.exe ./cmd/server
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_AGENT)-windows-amd64.exe ./cmd/agent
	# Linux
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_SERVER)-linux-amd64 ./cmd/server
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_AGENT)-linux-amd64 ./cmd/agent
	# macOS (ARM)
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_SERVER)-darwin-arm64 ./cmd/server
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_AGENT)-darwin-arm64 ./cmd/agent
	# macOS (Intel)
	GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_SERVER)-darwin-amd64 ./cmd/server
	GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o $(DIST_DIR)/$(BINARY_AGENT)-darwin-amd64 ./cmd/agent
	@echo "Multi-platform build complete!"

# Run tests
test:
	@echo "Running tests..."
	go test -v ./...

# Format code
fmt:
	@echo "Formatting code..."
	go fmt ./...

# Lint code
lint:
	@echo "Linting code..."
	golangci-lint run

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf $(DIST_DIR)
	go clean

# Docker build
docker-build:
	@echo "Building Docker images..."
	docker build -f Dockerfile.server -t network-monitor-server:latest .
	docker build -f Dockerfile.agent -t network-monitor-agent:latest .

# Docker compose up
docker-compose-up:
	@echo "Starting services with docker-compose..."
	docker-compose up -d

# Show help
help:
	@echo "Available targets:"
	@echo "  build         - Build server and agent for current platform"
	@echo "  server        - Build server only"
	@echo "  agent         - Build agent only"
	@echo "  build-all     - Build for all platforms (Windows, Linux, macOS)"
	@echo "  test          - Run tests"
	@echo "  fmt           - Format code"
	@echo "  lint          - Lint code"
	@echo "  clean         - Clean build artifacts"
	@echo "  docker-build  - Build Docker images"
	@echo "  docker-compose-up - Start services with docker-compose"
	@echo "  help          - Show this help"
