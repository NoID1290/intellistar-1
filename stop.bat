@echo off
setlocal enabledelayedexpansion

set PORT=%1
if "%PORT%"=="" set PORT=7070

set FOUND=0
rem Match only the local address column so a remote/client port never matches.
for /f "tokens=2,5" %%a in ('netstat -ano -p TCP ^| findstr /r /c:"LISTENING"') do (
    for /f "tokens=2 delims=:" %%p in ("%%a") do (
        if "%%p"=="%PORT%" (
            echo Stopping server on port %PORT% ^(PID %%b^)...
            taskkill /PID %%b /F >nul 2>&1
            if errorlevel 1 (
                echo   Failed to stop PID %%b. Try running this as Administrator.
            ) else (
                echo   Stopped.
                set FOUND=1
            )
        )
    )
)

if "!FOUND!"=="0" (
    echo No server listening on port %PORT%.
) else (
    echo Port %PORT% is now free.
)

endlocal
