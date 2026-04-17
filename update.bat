@echo off
echo Waiting for application to close...
timeout /t 2 /nobreak > nul
echo Copying new version...
copy /Y "C:\Users\Matt-PC\Documents\App Development\Network-Monitor\network-monitor-new.exe" "C:\Users\Matt-PC\Documents\App Development\Network-Monitor\network-monitor.exe"
if %errorlevel% neq 0 (
    echo Update failed! Restoring backup...
    copy /Y "C:\Users\Matt-PC\Documents\App Development\Network-Monitor\network-monitor.exe.backup" "C:\Users\Matt-PC\Documents\App Development\Network-Monitor\network-monitor.exe"
    pause
    exit /b 1
)
del "C:\Users\Matt-PC\Documents\App Development\Network-Monitor\network-monitor-new.exe"
echo Update complete! Starting new version...
start "" "C:\Users\Matt-PC\Documents\App Development\Network-Monitor\network-monitor.exe" server
(goto) 2>nul & del "%~f0"
