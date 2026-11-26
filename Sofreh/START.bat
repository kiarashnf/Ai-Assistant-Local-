@echo off
chcp 65001 >nul
title Sofreh
set STAFF_PIN=1234
start "" http://localhost:3000
node server.js
pause
