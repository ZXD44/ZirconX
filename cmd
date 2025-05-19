@echo off
title File Renamer by ZirconX
color c
setlocal enabledelayedexpansion
set "folder=C:\path\to\your\folder"
set /a count=1

:: Clear screen and show header with slower display
cls
echo.
echo  _______________________________________________________
timeout /t 1 >nul
echo ^|                                                      ^|
timeout /t 1 >nul
echo ^|             FILE RENAMER by ZIRCONX                  ^|
timeout /t 1 >nul
echo ^|______________________________________________________^|
timeout /t 1 >nul
echo.

:: Processing animation
echo Processing files in: %folder%
echo.
timeout /t 2 >nul

cd /d "%folder%"
for %%f in (*) do (
    if not "%%f"=="%~nx0" (
        set "original=%%f"
        set "new=!count!%%~xf"
        
        :: Show animation for each file
        echo Renaming: !original!
        timeout /t 1 >nul
        echo       to: !new!
        echo.
        timeout /t 1 >nul
        
        ren "%%f" "!new!"
        set /a count+=1
    )
)

:: Cool completion animation with slower display
cls
echo.
timeout /t 1 >nul
echo  _______________________________________________________
timeout /t 1 >nul
echo ^|                                                      ^|
timeout /t 1 >nul
echo ^|                  PROCESS COMPLETE!                    ^|
timeout /t 1 >nul
echo ^|______________________________________________________^|
timeout /t 1 >nul
echo.

:: Slower dot animation
for /l %%i in (1,1,10) do (
    set "dots="
    for /l %%j in (1,1,%%i) do set "dots=!dots!."
    echo Files successfully renamed! !dots!
    timeout /t 1 >nul
    if %%i neq 10 cls
)

:: Final message with count
set /a total=count-1
echo.
timeout /t 1 >nul
echo Total files renamed: %total%
echo.
timeout /t 1 >nul
echo Thank you for using File Renamer by ZirconX
echo.
timeout /t 1 >nul

:: Launch browser after delay
echo Launching bunny.online in 3 seconds...
timeout /t 3 >nul
start "" "https://www.bunnytown.online/"

:: Auto-close after delay
echo.
echo Closing in 3 seconds...
timeout /t 3 >nul
exit