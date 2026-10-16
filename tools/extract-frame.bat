@echo off
rem Extracts frames from a video as PNG, named <video name>_frame###.png, next to the video.
rem
rem   extract-frame.bat gopro5_reprojection_comparison.mp4 130
rem   extract-frame.bat gopro5_reprojection_comparison.mp4 10 130 250
rem
rem Frame numbers count from 0 (ffmpeg's numbering).

setlocal EnableDelayedExpansion

if "%~2"=="" (
    echo Usage: %~nx0 video.mp4 frame [more frames...]
    exit /b 1
)

where ffmpeg >nul 2>nul || (
    echo ffmpeg wasn't found. Install it and make sure it's on your PATH.
    exit /b 1
)

if not exist "%~f1" (
    echo Video not found: %~f1
    exit /b 1
)

set "video=%~f1"
set "dir=%~dp1"
set "name=%~n1"
shift

:loop
if "%~1"=="" goto :eof
set "f=%~1"

rem Pad to 3 digits: 5 -> 005, 130 -> 130, 1200 stays 1200
set "pad=00!f!"
set "pad=!pad:~-3!"
if !f! GEQ 1000 set "pad=!f!"

set "out=!dir!!name!_frame!pad!.png"
if exist "!out!" del "!out!"

ffmpeg -hide_banner -loglevel error -y -i "!video!" -vf "select=eq(n\,!f!)" -fps_mode passthrough -frames:v 1 "!out!"

if exist "!out!" (
    echo Saved !out!
) else (
    echo Frame !f! wasn't saved. The video may have fewer frames.
)

shift
goto loop
