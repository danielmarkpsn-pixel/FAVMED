@echo off
title FAVMED - Servidor de Rede Local
cd /d "%~dp0"
echo Iniciando servidor local da Clinica Favmed...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-favmed.ps1"
if errorlevel 1 (
  echo.
  echo O servidor foi encerrado com erro. Confira as instrucoes de rede local.
  pause
)
