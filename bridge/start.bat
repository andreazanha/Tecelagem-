@echo off
title Ponte Tecelagem (nao fechar)
cd /d "%~dp0"
echo ============================================
echo   Ponte Tecelagem rodando...
echo   Sincroniza a cada 2 minutos.
echo   Pode MINIMIZAR esta janela. NAO feche.
echo ============================================
:loop
node sync.js --once
timeout /t 120 /nobreak >nul
goto loop
