@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Finger Magic Lite - Starting Server
echo ========================================
echo.

set PORT=4173

python -c "import http.server" 2>nul
if %errorlevel% equ 0 (
    echo Starting HTTP server (Python)...
    echo Open browser: http://localhost:%PORT%/
    echo Press Ctrl+C to stop
    echo.
    start http://localhost:%PORT%/
    python -m http.server %PORT%
    exit /b
)

python3 -c "import http.server" 2>nul
if %errorlevel% equ 0 (
    echo Starting HTTP server (Python3)...
    echo Open browser: http://localhost:%PORT%/
    echo Press Ctrl+C to stop
    echo.
    start http://localhost:%PORT%/
    python3 -m http.server %PORT%
    exit /b
)

node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Python not found, trying Node.js...
    
    if not exist node_modules (
        echo Installing dependencies (first run)...
        call npm install
        if %errorlevel% neq 0 (
            echo.
            echo Install failed. Check network.
            pause
            exit /b 1
        )
    )
    
    echo Starting HTTP server (Node.js)...
    echo Open browser: http://localhost:%PORT%/
    echo Press Ctrl+C to stop
    echo.
    start http://localhost:%PORT%/
    npx http-server . -p %PORT% -c-1
    exit /b
)

echo.
echo Error: Python or Node.js not found
echo Please install from:
echo   Python: https://www.python.org/downloads/
echo   Node.js: https://nodejs.org/
echo.
pause
