@echo off
cd /d C:\Users\tyago\Downloads\clinica-react\clinica-react
start "vite" /b cmd /c "npm run dev > C:\work\vite.log 2>&1"
timeout /t 10 /nobreak >nul
set "PLAYWRIGHT_BROWSERS_PATH=C:\Users\tyago\AppData\Local\ms-playwright"
node shots.cjs C:\work\shots C:\Users\tyago\clinica-psicologica-poc http://localhost:5173
echo EXITCODE=%ERRORLEVEL%
taskkill /f /im node.exe >nul 2>&1
