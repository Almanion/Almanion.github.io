@echo off
cd /d "%~dp0"
echo Phone mode requires Python 3. Keep this window open.
echo Use only a trusted private network. No router port forwarding.
where py >nul 2>nul
if %errorlevel%==0 (py -3 start_server.py --lan) else (python start_server.py --lan)
pause
