@echo off
echo Iniciando JarvisIA2...
:: Matar cualquier proceso que use el puerto 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo Cerrando proceso anterior en puerto 8000 (PID: %%a)...
    taskkill /F /PID %%a 2>nul
    timeout /t 1 /nobreak >nul
)
cd /d "%~dp0backend"
start "JarvisIA2 Server" python -m uvicorn main:app --host 127.0.0.1 --port 8000
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000"
echo.
echo JarvisIA2 corriendo en http://127.0.0.1:8000
echo Cerrá esta ventana o presioná cualquier tecla para detener.
pause >nul
taskkill /F /FI "WINDOWTITLE eq JarvisIA2 Server*" 2>nul
