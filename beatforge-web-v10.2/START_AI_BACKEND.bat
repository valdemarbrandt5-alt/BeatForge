@echo off
call conda activate beatforge
cd /d "%~dp0backend"
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8000
pause
