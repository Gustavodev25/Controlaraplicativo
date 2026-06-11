@echo off
cd /d "%~dp0"
echo === Adicionando todos os arquivos modificados ===
git add -A
echo.
echo === Status antes do commit ===
git status --short
echo.
echo === Fazendo commit ===
git commit -m "fix: corrige IAP, travamento Meu Plano e fix Sandbox re-link"
echo.
echo === Enviando para o GitHub ===
git push origin main
echo.
echo === Concluido! ===
pause
