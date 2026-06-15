@echo off
chcp 65001 >nul
start "" python -m http.server 8888 -d "%~dp0..\src"
start "" "https://study.neusoft.edu.cn/index"
echo HTTP服务已启动 (端口8888)
echo 进入答题页面后，点书签栏的「召唤答题」
pause
