#Requires -Version 5.1
# UTF-8 with BOM. Russian console text for run-api.bat.
# Do not call chcp here: it changes the parent cmd code page and breaks the .bat parser.
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Id,
    [Parameter(Position = 1)]
    [string]$A1 = ''
)

try {
    $Host.UI.RawUI.WindowTitle = 'Карта оптической сети — Portable'
} catch {}

function Show([string[]]$Lines) {
    foreach ($line in $Lines) {
        Write-Host $line
    }
}

function Get-BootstrapLogin {
    $user = 'admin'
    $pass = 'admin123'
    $candidates = @(
        (Join-Path $PSScriptRoot '..\server-config.json'),
        (Join-Path $PSScriptRoot '..\server\config\server-config.example.json')
    )
    foreach ($cfgPath in $candidates) {
        if (-not (Test-Path -LiteralPath $cfgPath)) { continue }
        try {
            $cfg = [System.IO.File]::ReadAllText($cfgPath) | ConvertFrom-Json
            if ($cfg.bootstrapAdminUsername) { $user = [string]$cfg.bootstrapAdminUsername }
            if ($cfg.bootstrapAdminPassword) { $pass = [string]$cfg.bootstrapAdminPassword }
            break
        } catch {}
    }
    return @{ User = $user; Pass = $pass }
}

switch ($Id) {
    'banner' {
        Show @(
            '============================================',
            '  Карта оптической сети — Portable',
            '============================================',
            ''
        )
    }
    'node-local' {
        Show @('[Node] используется локальный runtime: .runtime\node')
    }
    'err-no-node' {
        Show @(
            '[Ошибка] Node.js не найден.',
            'Установите Node.js 20 LTS или новее: https://nodejs.org',
            'После установки закройте и снова откройте этот файл.'
        )
    }
    'err-no-npm' {
        Show @(
            '[Ошибка] npm не найден (обычно ставится вместе с Node.js).',
            'Установите Node.js: https://nodejs.org'
        )
    }
    'err-node-old' {
        Show @("[Ошибка] Нужен Node.js >= 20.9, сейчас v$A1")
    }
    'installing' {
        Show @(
            'Устанавливаем зависимости npm (первый запуск)...',
            'Это может занять несколько минут.',
            ''
        )
    }
    'err-npm-install' {
        Show @(
            '',
            '[Ошибка] Не удалось установить зависимости.',
            'Проверьте интернет и права на запись в эту папку.'
        )
    }
    'deps-ok' {
        Show @(
            'Зависимости npm уже установлены.',
            ''
        )
    }
    'prepare' {
        Show @('Подготовка конфига и папок данных...')
    }
    'starting' {
        $login = Get-BootstrapLogin
        Show @(
            'Запускаем сервер...',
            '',
            '============================================',
            "  Откройте:  http://localhost:$A1",
            "  Логин:     $($login.User)",
            "  Пароль:    $($login.Pass)",
            '  Если пароль уже меняли в программе, вводите новый.',
            '  Остановка: Ctrl+C',
            '============================================',
            ''
        )
    }
    'err-server' {
        Show @(
            "[Ошибка] Сервер завершился с кодом $A1.",
            'Если порт занят — измените "port" в server-config.json или закройте другой процесс.'
        )
    }
    default {
        Write-Host "[warn] unknown message: $Id"
    }
}
