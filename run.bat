@echo off
title Secrets Vault — خزنة الأسرار
chcp 65001 > nul
cls

echo ========================================================
echo          خزنة الأسرار — Secrets Vault v2.0
echo ========================================================
echo.
echo [1/2] جارٍ التحقق من بيئة التشغيل...

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [خطأ] لم يتم العثور على Python في مسار النظام PATH!
    echo يرجى تثبيت Python وتفعيله في PATH.
    pause
    exit /b 1
)

echo [2/2] بدء تشغيل الخادم المحلي الآمن (http://127.0.0.1:8000)...
echo.
echo فتح المتصفح تلقائياً...
start http://127.0.0.1:8000

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

if %errorlevel% neq 0 (
    echo.
    echo [تنبيه] توقف الخادم عن العمل أو حدث خطأ أثناء التشغيل.
    pause
)
