@echo off
title Secrets Vault
cd /d "%~dp0"

:: Check if Python is installed
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python was not found in your system PATH.
    echo Please install Python 3.10 or higher from https://www.python.org/
    pause
    exit /b 1
)

:: Launch the native desktop application
where pythonw >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    start "" pythonw desktop.py
) else (
    python desktop.py
)
