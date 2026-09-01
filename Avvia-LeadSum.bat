@echo off
title LeadSum Launcher
cd /d "%~dp0"
if exist "LeadSum.exe" (
    start "" "LeadSum.exe"
) else (
    node server.js
)
