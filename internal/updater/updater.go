package updater

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
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

	"github.com/Technologies-Unlimited/Network-Proxy/internal/envcfg"
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
	CurrentCommitSHA string    `json:"currentCommitSha"`
	LatestVersion    string    `json:"latestVersion"`
	LatestCommitSHA  string    `json:"latestCommitSha"`
	LatestCommitDate time.Time `json:"latestCommitDate"`
	LatestCommitMsg  string    `json:"latestCommitMessage"`
	ReleaseNotes     string    `json:"releaseNotes,omitempty"`
	ReleaseURL       string    `json:"releaseUrl,omitempty"`
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
	TagName         string    `json:"tag_name"`
	Name            string    `json:"name"`
	Body            string    `json:"body"`
	Draft           bool      `json:"draft"`
	Prerelease      bool      `json:"prerelease"`
	PublishedAt     time.Time `json:"published_at"`
	HTMLURL         string    `json:"html_url"`
	TargetCommitish string    `json:"target_commitish"`
	Assets          []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// GitHubTag represents a GitHub tag from the API
type GitHubTag struct {
	Name   string `json:"name"`
	Commit struct {
		SHA string `json:"sha"`
		URL string `json:"url"`
	} `json:"commit"`
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

// CheckForUpdates checks GitHub for the latest version using releases/tags
func (u *Updater) CheckForUpdates() (*VersionInfo, error) {
	log.Info().Msg("Checking for updates from GitHub...")

	// First, try to get the latest release (provides version info)
	latestVersion := ""
	releaseNotes := ""
	releaseURL := ""
	latestTagCommitSHA := ""

	release, err := u.getLatestRelease()
	if err != nil {
		log.Warn().Err(err).Msg("No releases found, falling back to tags")
	} else {
		latestVersion = strings.TrimPrefix(release.TagName, "v")
		releaseNotes = release.Body
		releaseURL = release.HTMLURL
		log.Info().Str("release", release.TagName).Msg("Found latest release")
	}

	// Get the commit SHA for the latest tag/release
	if latestVersion != "" {
		tagSHA, err := u.getTagCommitSHA("v" + latestVersion)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to get tag commit SHA")
		} else {
			latestTagCommitSHA = tagSHA
		}
	}

	// Also get the latest commit on the production branch for comparison
	commit, err := u.getLatestCommit()
	if err != nil {
		return nil, fmt.Errorf("failed to get latest commit: %w", err)
	}

	// Get first line of commit message
	commitMsg := commit.Commit.Message
	if idx := strings.Index(commitMsg, "\n"); idx > 0 {
		commitMsg = commitMsg[:idx]
	}

	// Use the branch commit SHA if no tag was found
	latestCommitSHA := commit.SHA
	if latestTagCommitSHA != "" {
		// If we have a release, check if there are newer commits beyond the release
		if latestTagCommitSHA != commit.SHA {
			log.Info().
				Str("releaseCommit", u.shortSHA(latestTagCommitSHA)).
				Str("branchCommit", u.shortSHA(commit.SHA)).
				Msg("Branch has commits beyond the latest release")
		}
		latestCommitSHA = commit.SHA // Always use the latest branch commit
	}

	// Determine if update is available
	updateAvailable := false

	// First check semantic version
	if latestVersion != "" && u.currentVersion != "" {
		if compareVersions(latestVersion, u.currentVersion) > 0 {
			updateAvailable = true
			log.Info().
				Str("currentVersion", u.currentVersion).
				Str("latestVersion", latestVersion).
				Msg("Newer version available")
		}
	}

	// Also check commit SHA - if versions match but commits differ, there's an update
	if !updateAvailable && u.currentCommitSHA != "" && u.currentCommitSHA != "dev" {
		currentShort := u.shortSHA(u.currentCommitSHA)
		latestShort := u.shortSHA(latestCommitSHA)
		if currentShort != latestShort {
			updateAvailable = true
			log.Info().
				Str("currentCommit", currentShort).
				Str("latestCommit", latestShort).
				Msg("Newer commit available")
		}
	}

	// If no current commit SHA (dev build), always show update available
	if u.currentCommitSHA == "" || u.currentCommitSHA == "dev" {
		updateAvailable = true
	}

	// If no version found from releases, use current version
	if latestVersion == "" {
		latestVersion = u.currentVersion
	}

	info := &VersionInfo{
		CurrentVersion:   u.currentVersion,
		CurrentCommitSHA: u.currentCommitSHA,
		LatestVersion:    latestVersion,
		LatestCommitSHA:  latestCommitSHA,
		LatestCommitDate: commit.Commit.Committer.Date,
		LatestCommitMsg:  commitMsg,
		ReleaseNotes:     releaseNotes,
		ReleaseURL:       releaseURL,
		UpdateAvailable:  updateAvailable,
		LastChecked:      time.Now(),
	}

	u.lastCheck = info

	log.Info().
		Str("currentVersion", u.currentVersion).
		Str("latestVersion", latestVersion).
		Str("latestCommit", u.shortSHA(latestCommitSHA)).
		Str("currentCommit", u.shortSHA(u.currentCommitSHA)).
		Bool("updateAvailable", updateAvailable).
		Msg("Update check complete")

	return info, nil
}

// getLatestRelease fetches the latest release from GitHub
func (u *Updater) getLatestRelease() (*GitHubRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest", GitHubAPI, GitHubOwner, GitHubRepo)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Network-Monitor-Updater")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("no releases found")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}

	return &release, nil
}

// getTagCommitSHA gets the commit SHA for a specific tag
func (u *Updater) getTagCommitSHA(tagName string) (string, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/git/ref/tags/%s", GitHubAPI, GitHubOwner, GitHubRepo, tagName)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Network-Monitor-Updater")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to get tag: status %d", resp.StatusCode)
	}

	var ref struct {
		Object struct {
			SHA  string `json:"sha"`
			Type string `json:"type"`
		} `json:"object"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ref); err != nil {
		return "", err
	}

	// If it's an annotated tag, we need to get the underlying commit
	if ref.Object.Type == "tag" {
		return u.getTagObject(ref.Object.SHA)
	}

	return ref.Object.SHA, nil
}

// getTagObject resolves an annotated tag to its commit SHA
func (u *Updater) getTagObject(tagSHA string) (string, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/git/tags/%s", GitHubAPI, GitHubOwner, GitHubRepo, tagSHA)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Network-Monitor-Updater")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to get tag object: status %d", resp.StatusCode)
	}

	var tag struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tag); err != nil {
		return "", err
	}

	return tag.Object.SHA, nil
}

// getLatestCommit gets the latest commit on the production branch
func (u *Updater) getLatestCommit() (*GitHubCommit, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/commits/%s", GitHubAPI, GitHubOwner, GitHubRepo, Branch)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Network-Monitor-Updater")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var commit GitHubCommit
	if err := json.NewDecoder(resp.Body).Decode(&commit); err != nil {
		return nil, err
	}

	return &commit, nil
}

// compareVersions compares two semantic version strings
// Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
func compareVersions(v1, v2 string) int {
	// Strip 'v' prefix if present
	v1 = strings.TrimPrefix(v1, "v")
	v2 = strings.TrimPrefix(v2, "v")

	parts1 := strings.Split(v1, ".")
	parts2 := strings.Split(v2, ".")

	// Pad shorter version with zeros
	for len(parts1) < 3 {
		parts1 = append(parts1, "0")
	}
	for len(parts2) < 3 {
		parts2 = append(parts2, "0")
	}

	for i := 0; i < 3; i++ {
		n1 := parseVersionPart(parts1[i])
		n2 := parseVersionPart(parts2[i])

		if n1 > n2 {
			return 1
		}
		if n1 < n2 {
			return -1
		}
	}

	return 0
}

// parseVersionPart parses a version part, handling pre-release suffixes
func parseVersionPart(part string) int {
	// Handle pre-release versions like "1-beta"
	if idx := strings.IndexAny(part, "-+"); idx > 0 {
		part = part[:idx]
	}

	var n int
	if _, err := fmt.Sscanf(part, "%d", &n); err != nil {
		return 0 // a non-numeric version part sorts as 0
	}
	return n
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
	defer func() { _ = os.RemoveAll(tempDir) }() // best-effort temp cleanup

	// Download the zip file
	zipPath := filepath.Join(tempDir, "update.zip")
	downloadURL := fmt.Sprintf("https://github.com/%s/%s/archive/refs/heads/%s.zip", GitHubOwner, GitHubRepo, Branch)

	u.updateStatus.Message = "Downloading update from GitHub..."
	u.updateStatus.Progress = 10

	log.Info().Str("url", downloadURL).Msg("Downloading update...")

	if err := u.downloadFile(zipPath, downloadURL); err != nil {
		return u.setError(fmt.Errorf("failed to download update: %w", err))
	}

	// Verify the source archive against the published SHA256SUMS file before
	// extracting. The previous implementation downloaded and immediately
	// executed code with no integrity check, so any GitHub-side compromise
	// (or in-flight tampering) would be applied silently.
	if err := u.verifyArtifact(zipPath, "source.zip"); err != nil {
		return u.setError(fmt.Errorf("source archive integrity check failed: %w", err))
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

	// Get the commit SHA and version to embed in the build
	commitSHA := ""
	latestVersion := ""
	if u.lastCheck != nil {
		if u.lastCheck.LatestCommitSHA != "" {
			commitSHA = u.lastCheck.LatestCommitSHA
		}
		if u.lastCheck.LatestVersion != "" {
			latestVersion = u.lastCheck.LatestVersion
		}
	}

	// Build with ldflags to embed version info
	ldflags := fmt.Sprintf("-X main.commitSHA=%s", commitSHA)
	if latestVersion != "" {
		ldflags += fmt.Sprintf(" -X main.version=%s", latestVersion)
	}
	log.Info().
		Str("commitSHA", commitSHA).
		Str("version", latestVersion).
		Str("ldflags", ldflags).
		Msg("Building with embedded version info")
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

	// Verify the produced binary against the release manifest if one is
	// published for it. The manifest entry is expected to be named after the
	// platform-specific binary (e.g. network-monitor-windows-amd64.exe). If
	// no entry matches we fall back to the source-archive digest already
	// verified above; we never silently accept an unverified binary unless
	// UPDATER_ALLOW_UNVERIFIED was set.
	binaryManifestName := fmt.Sprintf("network-monitor-%s-%s%s",
		runtime.GOOS, runtime.GOARCH,
		map[string]string{"windows": ".exe"}[runtime.GOOS])
	if err := u.verifyBuiltBinary(newBinaryPath, binaryManifestName); err != nil {
		return u.setError(err)
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

		// Remove any stale backup; a real conflict resurfaces at the checked rename below.
		_ = os.Remove(oldExePath)

		// Rename current exe to .old (Windows allows renaming running executables)
		if err := os.Rename(currentExe, oldExePath); err != nil {
			return fmt.Errorf("failed to rename current executable: %w", err)
		}

		// Copy new binary to the original location
		if err := copyFile(newBinaryPath, currentExe); err != nil {
			// Roll back to the old exe. If this rename fails the install is
			// left with no executable at currentExe — surface it loudly.
			if rbErr := os.Rename(oldExePath, currentExe); rbErr != nil {
				log.Error().Err(rbErr).Msg("Rollback rename failed after copy error; manual intervention required")
			}
			return fmt.Errorf("failed to copy new binary: %w", err)
		}

		// Best-effort cleanup of the new-binary temp file.
		_ = os.Remove(newBinaryPath)

		// Start the new process with the same arguments
		log.Info().Msg("Starting new version...")
		cmd := exec.Command(currentExe, "server")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Dir = u.installDir

		if err := cmd.Start(); err != nil {
			// Roll back: drop the just-copied new binary, then restore the old
			// one. A failed restore leaves no executable — surface it loudly.
			if rmErr := os.Remove(currentExe); rmErr != nil {
				log.Error().Err(rmErr).Msg("Could not remove new binary before rollback after start error")
			}
			if rbErr := os.Rename(oldExePath, currentExe); rbErr != nil {
				log.Error().Err(rbErr).Msg("Rollback rename failed after start error; manual intervention required")
			}
			return fmt.Errorf("failed to start new version: %w", err)
		}

		log.Info().Int("newPID", cmd.Process.Pid).Msg("New version started; waiting for ready marker...")

		// Wait until the new process signals it's healthy. If it never
		// does (crash on init, port-bind failure, etc.) we roll back to
		// the old binary and keep the existing process alive instead of
		// exiting into a broken install.
		if err := waitForReadyMarker(u.installDir, 30*time.Second); err != nil {
			log.Error().Err(err).Msg("New version did not become ready; rolling back")
			_ = cmd.Process.Kill()
			// Windows doesn't release the image-file lock immediately on
			// Kill — Remove can fail with "file in use" for a few hundred
			// ms. Retry briefly so the rollback rename has a chance to
			// succeed before we declare manual intervention required.
			if err := removeWithRetry(currentExe, 5, 200*time.Millisecond); err != nil {
				log.Error().Err(err).Msg("Could not remove failed-update binary; rollback may be inconsistent")
			}
			if rollbackErr := os.Rename(oldExePath, currentExe); rollbackErr != nil {
				log.Error().Err(rollbackErr).Msg("Rollback rename failed; manual intervention required")
			}
			u.updateStatus.Status = "error"
			u.updateStatus.Error = "new version failed to start; rolled back"
			return err
		}

		log.Info().Msg("New version is ready; exiting old process")
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

// removeWithRetry tries os.Remove until it succeeds or attempts run out.
// Used by the Windows rollback path because Process.Kill is asynchronous —
// the OS may hold the .exe image lock for several hundred milliseconds
// after the process actually exits, so a single Remove call frequently
// fails with "file in use".
func removeWithRetry(path string, attempts int, backoff time.Duration) error {
	if attempts <= 0 {
		attempts = 1
	}
	var lastErr error
	for i := 0; i < attempts; i++ {
		if err := os.Remove(path); err == nil {
			return nil
		} else {
			lastErr = err
		}
		// Already-gone is success.
		if _, statErr := os.Stat(path); os.IsNotExist(statErr) {
			return nil
		}
		time.Sleep(backoff)
	}
	return lastErr
}

// readyMarkerName is the file the freshly-started server writes once it has
// successfully bound its listener. The old process polls for this file as
// proof that the new binary is healthy, and rolls back if it never appears.
const readyMarkerName = ".update-ready"

// SignalReady drops a marker file so the parent updater knows the new
// process started successfully. The server calls this after Listen()
// succeeds. The marker contains the PID for forensic logging.
func SignalReady(installDir string) error {
	path := filepath.Join(installDir, readyMarkerName)
	return os.WriteFile(path, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
}

// waitForReadyMarker polls for the marker for up to timeout. Returns nil on
// success, or an error if the marker never appears. Removes the marker
// after a successful read so the next update cycle starts clean.
func waitForReadyMarker(installDir string, timeout time.Duration) error {
	path := filepath.Join(installDir, readyMarkerName)
	// Clear any stale marker from a prior aborted update.
	_ = os.Remove(path)

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			_ = os.Remove(path)
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	return fmt.Errorf("ready marker did not appear within %s", timeout)
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
			if err := os.MkdirAll(fpath, os.ModePerm); err != nil {
				return err
			}
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

// verifyBuiltBinary verifies the freshly-built binary against the release
// SHA256SUMS file. If the manifest does not list this binary (because the
// release only ships source) the function logs a warning and returns nil —
// the source archive itself was already verified by verifyArtifact, so there
// is no additional risk surface beyond `go build` itself. If the manifest
// lists it but the digest mismatches, that is a hard failure.
func (u *Updater) verifyBuiltBinary(localPath, manifestName string) error {
	if envcfg.Bool("UPDATER_ALLOW_UNVERIFIED") {
		return nil
	}
	manifest, err := u.fetchSHA256Manifest()
	if err != nil {
		// We already verified the source archive; downgrade to a warning so
		// releases that ship only source still apply.
		log.Warn().Err(err).Msg("Skipping binary verification (no manifest)")
		return nil
	}
	want, ok := manifest[manifestName]
	if !ok {
		log.Warn().
			Str("binary", manifestName).
			Msg("SHA256SUMS does not list this platform binary; relying on source-archive verification")
		return nil
	}
	got, err := sha256File(localPath)
	if err != nil {
		return fmt.Errorf("hash %s: %w", localPath, err)
	}
	if !strings.EqualFold(want, got) {
		return fmt.Errorf("built binary digest mismatch for %s: expected %s, got %s",
			manifestName, want, got)
	}
	log.Info().
		Str("binary", manifestName).
		Str("sha256", got).
		Msg("Built binary integrity verified")
	return nil
}

// verifyArtifact checks the SHA-256 digest of localPath against the entry for
// nameInManifest in the release's SHA256SUMS file. If no such file is
// published (and no override is set), verification is treated as a hard
// failure to prevent silently installing an unverified binary. Operators who
// genuinely cannot publish checksums (e.g. local-only builds) must set
// UPDATER_ALLOW_UNVERIFIED=true to opt in.
func (u *Updater) verifyArtifact(localPath, nameInManifest string) error {
	if envcfg.Bool("UPDATER_ALLOW_UNVERIFIED") {
		log.Warn().Msg("UPDATER_ALLOW_UNVERIFIED=true: skipping integrity check (NOT recommended)")
		return nil
	}

	gotDigest, err := sha256File(localPath)
	if err != nil {
		return fmt.Errorf("hash %s: %w", localPath, err)
	}

	manifest, err := u.fetchSHA256Manifest()
	if err != nil {
		return fmt.Errorf("fetch SHA256SUMS: %w (set UPDATER_ALLOW_UNVERIFIED=true to override)", err)
	}

	wantDigest, ok := manifest[nameInManifest]
	if !ok {
		return fmt.Errorf("SHA256SUMS does not list %q", nameInManifest)
	}
	if !strings.EqualFold(wantDigest, gotDigest) {
		return fmt.Errorf("digest mismatch for %s: expected %s, got %s",
			nameInManifest, wantDigest, gotDigest)
	}
	log.Info().
		Str("artifact", nameInManifest).
		Str("sha256", gotDigest).
		Msg("Update artifact integrity verified")
	return nil
}

// fetchSHA256Manifest downloads and parses the release's SHA256SUMS asset.
// The expected format is one entry per line: "<hex-digest>  <filename>".
func (u *Updater) fetchSHA256Manifest() (map[string]string, error) {
	release, err := u.getLatestRelease()
	if err != nil {
		return nil, err
	}
	var url string
	for _, asset := range release.Assets {
		if strings.EqualFold(asset.Name, "SHA256SUMS") ||
			strings.EqualFold(asset.Name, "checksums.txt") {
			url = asset.BrowserDownloadURL
			break
		}
	}
	if url == "" {
		return nil, fmt.Errorf("release has no SHA256SUMS asset")
	}

	resp, err := u.httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("SHA256SUMS download returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	out := make(map[string]string)
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		// Drop optional "*" prefix that GNU coreutils emits for binary mode.
		name := strings.TrimPrefix(fields[1], "*")
		out[name] = fields[0]
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("SHA256SUMS contained no usable entries")
	}
	return out, nil
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
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
