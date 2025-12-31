package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// visualizePage renders the visualization dashboard
func visualizePage(c *gin.Context) {
	c.HTML(http.StatusOK, "visualize.html", gin.H{
		"title": "Visualize - Network Monitor",
	})
}
