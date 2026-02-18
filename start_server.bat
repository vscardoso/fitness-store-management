@echo off
cd /d "C:\Users\Victor\Desktop\fitness-store-management\backend"
call ..\venv\Scripts\activate.bat
echo Iniciando servidor na porta 8000...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 2
echo Servidor encerrado com codigo %ERRORLEVEL%
pause
