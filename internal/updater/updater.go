package updater

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

const (
	GitHubOwner = "Technologies-Unlimited"
	GitHubRepo  = "Network-Monitor"
	GitHubAPI   = "https://api.github.com"
	Branch      = "production"
)

// VersionInfo contains version information
type VersionInfo struct {
	CurrentVersion   string    `json:"currentVersion"`
	LatestVersion    string    `json:"latestVersion"`
	LatestCommitSHA  string    `json:"latestCommitSha"`
	LatestCommitDate time.Time `json:"latestCommitDate"`
	LatestCommitMsg  string    `json:"latestCommitMessage"`
	UpdateAvailable  bool      `json:"updateAvailable"`
	LastChecked      time.Time `json:"lastChecked"`
}

// GitHubCommit represents a GitHub commit from the API
type GitHubCommit struct {
	SHA    string `json:"sha"`
	Commit struct {
		Message string `json:"message"`
		Author  struct {
			Name  string    `json:"name"`
			Email string    `json:"email"`
			Date  time.Time `json:"date"`
		} `json:"author"`
		Committer struct {
			Name  string    `json:"name"`
			Email string    `json:"email"`
			Date  time.Time `json:"date"`
		} `json:"committer"`
	} `json:"commit"`
	HTMLURL string `json:"html_url"`
}

// GitHubRelease represents a GitHub release from the API
type GitHubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	Draft       bool      `json:"draft"`
	Prerelease  bool      `json:"prerelease"`
	PublishedAt time.Time `json:"published_at"`
	HTMLURL     string    `json:"html_url"`
	Assets      []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// UpdateStatus represents the status of an update operation
type UpdateStatus struct {
	Status       string    `json:"status"` // "idle", "checking", "downloading", "extracting", "building", "complete", "error"
	Progress     int       `json:"progress"`
	Message      string    `json:"message"`
	Error        string    `json:"error,omitempty"`
	StartedAt    time.Time `json:"startedAt,omitempty"`
	CompletedAt  time.Time `json:"completedAt,omitempty"`
}

// Updater handles version checking and updates
type Updater struct {
	currentVersion  string
	currentCommitSHA string
	installDir      string
	httpClient      *http.Client
	lastCheck       *VersionInfo
	updateStatus    *UpdateStatus
}

// New creates a new Updater instance
func New(currentVersion, commitSHA string) *Updater {
	// Get the executable directory
	execPath, err := os.Executable()
	if err != nil {
		execPath = "."
	}
	installDir := filepath.Dir(execPath)

	return &Updater{
		currentVersion:   currentVersion,
		currentCommitSHA: commitSHA,
		installDir:       installDir,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		updateStatus: &UpdateStatus{Status: "idle"},
	}
}

// CheckForUpdates checks GitHub for the latest version
func (u *Updater) CheckForUpdates() (*VersionInfo, error) {
	log.Info().Msg("Checking for updates from GitHub...")

	// Get the latest commit on the production branch
	url := fmt.Sprintf("%s/repos/%s/%s/commits/%s", GitHubAPI, GitHubOwner, GitHubRepo, Branch)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Network-Monitor-Updater")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch latest commit: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var commit GitHubCommit
	if err := json.NewDecoder(resp.Body).Decode(&commit); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Get first line of commit message
	commitMsg := commit.Commit.Message
	if idx := strings.Index(commitMsg, "\n"); idx > 0 {
		commitMsg = commitMsg[:idx]
	}

	// Compare SHAs to determine if update is available
	updateAvailable := u.currentCommitSHA != "" && commit.SHA != u.currentCommitSHA

	// If no current commit SHA, check if the commit is newer than a reasonable build date
	if u.currentCommitSHA == "" {
		// Always show as update available if we don't have a commit SHA
		updateAvailable = true
	}

	info := &VersionInfo{
		CurrentVersion:   u.currentVersion,
		LatestVersion:    u.currentVersion, // We use commit-based versioning
		LatestCommitSHA:  commit.SHA,
		LatestCommitDate: commit.Commit.Committer.Date,
		LatestCommitMsg:  commitMsg,
		UpdateAvailable:  updateAvailable,
		LastChecked:      time.Now(),
	}

	u.lastCheck = info

	log.Info().
		Str("latestCommit", commit.SHA[:8]).
		Str("currentCommit", u.shortSHA(u.currentCommitSHA)).
		Bool("updateAvailable", updateAvailable).
		Msg("Update check complete")

	return info, nil
}

// GetLastCheck returns the last version check result
func (u *Updater) GetLastCheck() *VersionInfo {
	return u.lastCheck
}

// GetUpdateStatus returns the current update status
func (u *Updater) GetUpdateStatus() *UpdateStatus {
	return u.updateStatus
}

// DownloadAndUpdate downloads the latest code and rebuilds
func (u *Updater) DownloadAndUpdate() error {
	u.updateStatus = &UpdateStatus{
		Status:    "downloading",
		Progress:  0,
		Message:   "Starting download...",
		StartedAt: time.Now(),
	}

	log.Info().Msg("Starting update process...")

	// Create temp directory for download
	tempDir, err := os.MkdirTemp("", "network-monitor-update-*")
	if err != nil {
		return u.setError(fmt.Errorf("failed to create temp directory: %w", err))
	}
	defer os.RemoveAll(tempDir)

	// Download the zip file
	zipPath := filepath.Join(tempDir, "update.zip")
	downloadURL := fmt.Sprintf("https://github.com/%s/%s/archive/refs/heads/%s.zip", GitHubOwner, GitHubRepo, Branch)

	u.updateStatus.Message = "Downloading update from GitHub..."
	u.updateStatus.Progress = 10

	log.Info().Str("url", downloadURL).Msg("Downloading update...")

	if err := u.downloadFile(zipPath, downloadURL); err != nil {
		return u.setError(fmt.Errorf("failed to download update: %w", err))
	}

	u.updateStatus.Status = "extracting"
	u.updateStatus.Message = "Extracting update..."
	u.updateStatus.Progress = 40

	// Extract the zip
	extractDir := filepath.Join(tempDir, "extracted")
	if err := u.extractZip(zipPath, extractDir); err != nil {
		return u.setError(fmt.Errorf("failed to extract update: %w", err))
	}

	// Find the extracted directory (GitHub adds a suffix like "Network-Monitor-production")
	entries, err := os.ReadDir(extractDir)
	if err != nil {
		return u.setError(fmt.Errorf("failed to read extracted directory: %w", err))
	}

	if len(entries) == 0 {
		return u.setError(fmt.Errorf("no files found in extracted archive"))
	}

	sourceDir := filepath.Join(extractDir, entries[0].Name())

	u.updateStatus.Status = "building"
	u.updateStatus.Message = "Building new version..."
	u.updateStatus.Progress = 60

	log.Info().Str("sourceDir", sourceDir).Msg("Building updated application...")

	// Build the new binary in the source directory
	newBinaryName := "network-monitor-new"
	if runtime.GOOS == "windows" {
		newBinaryName += ".exe"
	}
	newBinaryPath := filepath.Join(sourceDir, newBinaryName)

	// Get the commit SHA to embed in the build
	commitSHA := ""
	if u.lastCheck != nil && u.lastCheck.LatestCommitSHA != "" {
		commitSHA = u.lastCheck.LatestCommitSHA
	}

	// Build with ldflags to embed version info
	ldflags := fmt.Sprintf("-X main.commitSHA=%s", commitSHA)
	log.Info().Str("commitSHA", commitSHA).Str("ldflags", ldflags).Msg("Building with embedded commit SHA")
	cmd := exec.Command("go", "build", "-ldflags", ldflags, "-o", newBinaryName, ".")
	cmd.Dir = sourceDir
	cmd.Env = append(os.Environ(),
		"CGO_ENABLED=0",
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Error().Err(err).Str("output", string(output)).Msg("Build failed")
		return u.setError(fmt.Errorf("build failed: %s", string(output)))
	}

	u.updateStatus.Message = "Installing update..."
	u.updateStatus.Progress = 80

	// Get the current executable path
	currentExe, err := os.Executable()
	if err != nil {
		return u.setError(fmt.Errorf("failed to get current executable: %w", err))
	}

	// Create backup of current executable
	backupPath := currentExe + ".backup"
	if err := copyFile(currentExe, backupPath); err != nil {
		log.Warn().Err(err).Msg("Failed to create backup of current executable")
	}

	// Copy new binary to install location
	// On Windows, we can't replace a running executable, so we use a different approach
	if runtime.GOOS == "windows" {
		// Create an update script that will run after the application exits
		updateScript := filepath.Join(tempDir, "update.bat")
		scriptContent := fmt.Sprintf(`@echo off
echo Waiting for application to close...
timeout /t 2 /nobreak > nul
echo Copying new version...
copy /Y "%s" "%s"
if %%errorlevel%% neq 0 (
    echo Update failed! Restoring backup...
    copy /Y "%s" "%s"
    pause
    exit /b 1
)
echo Update complete! Starting new version...
start "" "%s" server
del "%s"
`, newBinaryPath, currentExe, backupPath, currentExe, currentExe, updateScript)

		if err := os.WriteFile(updateScript, []byte(scriptContent), 0755); err != nil {
			return u.setError(fmt.Errorf("failed to create update script: %w", err))
		}

		// Copy the update script to a location that won't be cleaned up
		persistentScript := filepath.Join(u.installDir, "update.bat")
		persistentNewBinary := filepath.Join(u.installDir, newBinaryName)

		if err := copyFile(updateScript, persistentScript); err != nil {
			return u.setError(fmt.Errorf("failed to copy update script: %w", err))
		}
		if err := copyFile(newBinaryPath, persistentNewBinary); err != nil {
			return u.setError(fmt.Errorf("failed to copy new binary: %w", err))
		}

		// Update the script to use the persistent paths
		scriptContent = fmt.Sprintf(`@echo off
echo Waiting for application to close...
timeout /t 2 /nobreak > nul
echo Copying new version...
copy /Y "%s" "%s"
if %%errorlevel%% neq 0 (
    echo Update failed! Restoring backup...
    copy /Y "%s" "%s"
    pause
    exit /b 1
)
del "%s"
echo Update complete! Starting new version...
start "" "%s" server
(goto) 2>nul & del "%%~f0"
`, persistentNewBinary, currentExe, backupPath, currentExe, persistentNewBinary, currentExe)

		if err := os.WriteFile(persistentScript, []byte(scriptContent), 0755); err != nil {
			return u.setError(fmt.Errorf("failed to update script: %w", err))
		}

		u.updateStatus.Status = "complete"
		u.updateStatus.Message = "Update downloaded and ready. Click 'Apply Update' to automatically restart with the new version."
		u.updateStatus.Progress = 100
		u.updateStatus.CompletedAt = time.Now()

		log.Info().Msg("Update prepared. Ready for live update.")
		return nil
	}

	// On Unix systems, we can do an in-place replacement
	if err := os.Rename(newBinaryPath, currentExe); err != nil {
		// Try copy instead
		if err := copyFile(newBinaryPath, currentExe); err != nil {
			return u.setError(fmt.Errorf("failed to install update: %w", err))
		}
	}

	u.updateStatus.Status = "complete"
	u.updateStatus.Message = "Update installed successfully! Please restart the application."
	u.updateStatus.Progress = 100
	u.updateStatus.CompletedAt = time.Now()

	log.Info().Msg("Update installed successfully")
	return nil
}

// ApplyUpdate applies the update and restarts the application automatically
func (u *Updater) ApplyUpdate() error {
	currentExe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get current executable: %w", err)
	}

	newBinaryName := "network-monitor-new"
	if runtime.GOOS == "windows" {
		newBinaryName += ".exe"
	}
	newBinaryPath := filepath.Join(u.installDir, newBinaryName)

	// Check if update binary exists
	if _, err := os.Stat(newBinaryPath); os.IsNotExist(err) {
		return fmt.Errorf("no update prepared - new binary not found")
	}

	log.Info().
		Str("currentExe", currentExe).
		Str("newBinary", newBinaryPath).
		Msg("Applying live update...")

	if runtime.GOOS == "windows" {
		// On Windows: rename current exe, copy new one, start new process, exit
		oldExePath := currentExe + ".old"

		// Remove old backup if exists
		os.Remove(oldExePath)

		// Rename current exe to .old (Windows allows renaming running executables)
		if err := os.Rename(currentExe, oldExePath); err != nil {
			return fmt.Errorf("failed to rename current executable: %w", err)
		}

		// Copy new binary to the original location
		if err := copyFile(newBinaryPath, currentExe); err != nil {
			// Restore old exe
			os.Rename(oldExePath, currentExe)
			return fmt.Errorf("failed to copy new binary: %w", err)
		}

		// Clean up the new binary temp file
		os.Remove(newBinaryPath)

		// Start the new process with the same arguments
		log.Info().Msg("Starting new version...")
		cmd := exec.Command(currentExe, "server")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Dir = u.installDir

		if err := cmd.Start(); err != nil {
			// Restore old exe
			os.Remove(currentExe)
			os.Rename(oldExePath, currentExe)
			return fmt.Errorf("failed to start new version: %w", err)
		}

		log.Info().Int("newPID", cmd.Process.Pid).Msg("New version started, exiting old process...")

		// Give the new process a moment to start
		time.Sleep(500 * time.Millisecond)

		// Exit the current process
		os.Exit(0)
	}

	// On Unix: we can do in-place replacement
	backupPath := currentExe + ".backup"
	if err := copyFile(currentExe, backupPath); err != nil {
		log.Warn().Err(err).Msg("Failed to create backup")
	}

	if err := os.Rename(newBinaryPath, currentExe); err != nil {
		if err := copyFile(newBinaryPath, currentExe); err != nil {
			return fmt.Errorf("failed to install update: %w", err)
		}
	}

	// Start new process
	cmd := exec.Command(currentExe, "server")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start new version: %w", err)
	}

	log.Info().Int("newPID", cmd.Process.Pid).Msg("New version started, exiting old process...")
	os.Exit(0)

	return nil
}

// Helper functions

func (u *Updater) shortSHA(sha string) string {
	if len(sha) > 8 {
		return sha[:8]
	}
	return sha
}

func (u *Updater) setError(err error) error {
	u.updateStatus.Status = "error"
	u.updateStatus.Error = err.Error()
	u.updateStatus.Message = "Update failed"
	log.Error().Err(err).Msg("Update failed")
	return err
}

func (u *Updater) downloadFile(filepath string, url string) error {
	resp, err := u.httpClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func (u *Updater) extractZip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}

	for _, f := range r.File {
		fpath := filepath.Join(dest, f.Name)

		// Check for ZipSlip vulnerability
		if !strings.HasPrefix(fpath, filepath.Clean(dest)+string(os.PathSeparator)) {
			return fmt.Errorf("invalid file path: %s", fpath)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, os.ModePerm)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()

		if err != nil {
			return err
		}
	}

	return nil
}

func copyFile(src, dst string) error {
	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}
