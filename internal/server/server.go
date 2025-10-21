package server

import (
	"gorm.io/gorm"
)

// Server holds the application state
type Server struct {
	DB *gorm.DB
}

// New creates a new server instance
func New(db *gorm.DB) *Server {
	return &Server{
		DB: db,
	}
}
