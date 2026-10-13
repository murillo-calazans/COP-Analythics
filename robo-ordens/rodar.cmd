@echo off
rem Roda o robo uma vez; le as senhas de C:\cop-robo\.env; log em C:\cop-robo\robo.log
cd /d "%~dp0"
node --env-file=C:\cop-robo\.env robo.js >> C:\cop-robo\robo.log 2>&1
