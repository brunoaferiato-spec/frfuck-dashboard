$ErrorActionPreference = "Stop"

# ============================================================
# PERFECT - DIAGNOSTICO DE INTERFACE V2
#
# Objetivo:
# - ler SOMENTE a interface do CatalogoExpresso aberto
# - tentar localizar codigo, descricao, aplicacao, modelo e ano
# - usar duas fontes:
#     1) UI Automation
#     2) janelas/controles Win32 nativos
#
# Como usar:
# 1) abra o Catalogo Perfect
# 2) pesquise BRD0379 e deixe o resultado na tela
# 3) execute este script no PowerShell normal
#
# O script NAO clica, NAO digita, NAO altera arquivos e NAO fecha o programa.
# ============================================================

$saida = "C:\FR-FUCK-CLEAR\perfect-ui-diagnostico-v2.txt"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$codigoCSharp = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public static class Win32UiReader
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(
        IntPtr hWndParent,
        EnumWindowsProc lpEnumFunc,
        IntPtr lParam
    );

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder lpString,
        int nMaxCount
    );

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(
        IntPtr hWnd,
        StringBuilder lpClassName,
        int nMaxCount
    );

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetDlgCtrlID(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(
        IntPtr hWnd,
        uint Msg,
        IntPtr wParam,
        StringBuilder lParam
    );

    public const uint WM_GETTEXT = 0x000D;
    public const uint WM_GETTEXTLENGTH = 0x000E;

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(
        IntPtr hWnd,
        uint Msg,
        IntPtr wParam,
        IntPtr lParam
    );

    public static string ReadWindowText(IntPtr hWnd)
    {
        try
        {
            int len = (int)SendMessage(
                hWnd,
                WM_GETTEXTLENGTH,
                IntPtr.Zero,
                IntPtr.Zero
            );

            if (len < 0) len = 0;
            if (len > 20000) len = 20000;

            var sb = new StringBuilder(len + 2);
            SendMessage(
                hWnd,
                WM_GETTEXT,
                (IntPtr)sb.Capacity,
                sb
            );

            if (sb.Length > 0)
                return sb.ToString();

            sb = new StringBuilder(4096);
            GetWindowText(hWnd, sb, sb.Capacity);
            return sb.ToString();
        }
        catch
        {
            return "";
        }
    }

    public static string ReadClass(IntPtr hWnd)
    {
        try
        {
            var sb = new StringBuilder(512);
            GetClassName(hWnd, sb, sb.Capacity);
            return sb.ToString();
        }
        catch
        {
            return "";
        }
    }
}
"@

Add-Type -TypeDefinition $codigoCSharp

$processos = Get-Process CatalogoExpresso -ErrorAction SilentlyContinue

if (-not $processos) {
    throw "CatalogoExpresso nao esta aberto. Abra o Perfect, pesquise BRD0379 e rode novamente."
}

$proc = $processos |
    Sort-Object StartTime -Descending |
    Select-Object -First 1

if ($proc.MainWindowHandle -eq 0) {
    throw "O processo CatalogoExpresso foi encontrado, mas a janela principal nao esta disponivel."
}

$linhas = New-Object System.Collections.Generic.List[string]

function Add-Linha([string]$texto = "") {
    $linhas.Add($texto)
    Write-Host $texto
}

function Limpar-Texto([string]$texto) {
    if ($null -eq $texto) {
        return ""
    }

    $texto = $texto -replace "`r", " "
    $texto = $texto -replace "`n", " "
    $texto = $texto -replace "\s+", " "
    return $texto.Trim()
}

function Tenta-Pattern($elemento, $pattern) {
    try {
        return $elemento.GetCurrentPattern($pattern)
    }
    catch {
        return $null
    }
}

Add-Linha "============================================================"
Add-Linha " PERFECT - DIAGNOSTICO DE INTERFACE V2"
Add-Linha "============================================================"
Add-Linha ""
Add-Linha ("Data: " + (Get-Date -Format "dd/MM/yyyy HH:mm:ss"))
Add-Linha ("Processo: " + $proc.ProcessName)
Add-Linha ("PID: " + $proc.Id)
Add-Linha ("MainWindowHandle: " + $proc.MainWindowHandle)
Add-Linha ("Titulo da janela: " + $proc.MainWindowTitle)
Add-Linha ""
Add-Linha "IMPORTANTE: este script e SOMENTE LEITURA."
Add-Linha ""

# ============================================================
# 1) UI AUTOMATION
# ============================================================

Add-Linha "============================================================"
Add-Linha " 1) UI AUTOMATION"
Add-Linha "============================================================"
Add-Linha ""

try {
    $root = [System.Windows.Automation.AutomationElement]::RootElement

    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
        $proc.Id
    )

    $janela = $root.FindFirst(
        [System.Windows.Automation.TreeScope]::Children,
        $cond
    )

    if ($null -eq $janela) {
        Add-Linha "Nao consegui localizar a janela principal via UI Automation."
    }
    else {
        Add-Linha ("Janela UIA: " + (Limpar-Texto $janela.Current.Name))
        Add-Linha ""

        $elementos = $janela.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )

        Add-Linha ("Controles encontrados por UI Automation: " + $elementos.Count)
        Add-Linha ""

        $indice = 0

        foreach ($el in $elementos) {
            $indice++

            $nome = ""
            $autoId = ""
            $tipo = ""
            $classe = ""
            $help = ""
            $valor = ""
            $textoDocumento = ""

            try { $nome = [string]$el.Current.Name } catch {}
            try { $autoId = [string]$el.Current.AutomationId } catch {}
            try { $tipo = [string]$el.Current.ControlType.ProgrammaticName } catch {}
            try { $classe = [string]$el.Current.ClassName } catch {}
            try { $help = [string]$el.Current.HelpText } catch {}

            $vp = Tenta-Pattern $el ([System.Windows.Automation.ValuePattern]::Pattern)
            if ($vp) {
                try {
                    $valor = [string]$vp.Current.Value
                }
                catch {}
            }

            $tp = Tenta-Pattern $el ([System.Windows.Automation.TextPattern]::Pattern)
            if ($tp) {
                try {
                    $textoDocumento = [string]$tp.DocumentRange.GetText(-1)
                }
                catch {}
            }

            $nome = Limpar-Texto $nome
            $autoId = Limpar-Texto $autoId
            $tipo = Limpar-Texto $tipo
            $classe = Limpar-Texto $classe
            $help = Limpar-Texto $help
            $valor = Limpar-Texto $valor
            $textoDocumento = Limpar-Texto $textoDocumento

            $relevante =
                $nome -or
                $autoId -or
                $valor -or
                $textoDocumento -or
                $tipo -match "Edit|Text|DataItem|ListItem|Table|List|Pane|Document|Button"

            if (-not $relevante) {
                continue
            }

            Add-Linha ("[" + $indice + "]")
            Add-Linha ("  TYPE       : " + $tipo)
            Add-Linha ("  NAME       : " + $nome)
            Add-Linha ("  AUTOMATION : " + $autoId)
            Add-Linha ("  CLASS      : " + $classe)

            if ($valor) {
                Add-Linha ("  VALUE      : " + $valor)
            }

            if ($textoDocumento) {
                Add-Linha ("  TEXT       : " + $textoDocumento)
            }

            if ($help) {
                Add-Linha ("  HELP       : " + $help)
            }

            Add-Linha ""
        }
    }
}
catch {
    Add-Linha "ERRO NA LEITURA UI AUTOMATION:"
    Add-Linha $_.Exception.Message
    Add-Linha ""
}

# ============================================================
# 2) CONTROLES WIN32 NATIVOS
# ============================================================

Add-Linha "============================================================"
Add-Linha " 2) CONTROLES WIN32 NATIVOS"
Add-Linha "============================================================"
Add-Linha ""

$controles = New-Object System.Collections.Generic.List[object]

$callback = [Win32UiReader+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)

    try {
        $classe = [Win32UiReader]::ReadClass($hWnd)
        $texto = [Win32UiReader]::ReadWindowText($hWnd)
        $visivel = [Win32UiReader]::IsWindowVisible($hWnd)
        $ctrlId = [Win32UiReader]::GetDlgCtrlID($hWnd)

        $controles.Add(
            [PSCustomObject]@{
                Handle = $hWnd
                Class = $classe
                Text = $texto
                Visible = $visivel
                CtrlId = $ctrlId
            }
        )
    }
    catch {}

    return $true
}

[Win32UiReader]::EnumChildWindows(
    [IntPtr]$proc.MainWindowHandle,
    $callback,
    [IntPtr]::Zero
) | Out-Null

Add-Linha ("Controles Win32 encontrados: " + $controles.Count)
Add-Linha ""

$idx = 0

foreach ($controle in $controles) {
    $idx++

    $classe = Limpar-Texto ([string]$controle.Class)
    $texto = Limpar-Texto ([string]$controle.Text)

    Add-Linha ("[" + $idx + "]")
    Add-Linha ("  HANDLE  : " + $controle.Handle)
    Add-Linha ("  CLASS   : " + $classe)
    Add-Linha ("  CTRL_ID : " + $controle.CtrlId)
    Add-Linha ("  VISIBLE : " + $controle.Visible)
    Add-Linha ("  TEXT    : " + $texto)
    Add-Linha ""
}

# ============================================================
# 3) RESUMO DE TERMOS IMPORTANTES
# ============================================================

Add-Linha "============================================================"
Add-Linha " 3) RESUMO / TERMOS ENCONTRADOS"
Add-Linha "============================================================"
Add-Linha ""

$termos = @(
    "BRD0379",
    "AXIAL",
    "DIRECAO",
    "DIREÇÃO",
    "CHEVROLET",
    "EQUINOX",
    "2018",
    "2021",
    "APLICACAO",
    "APLICAÇÃO"
)

$textoCompleto = $linhas -join "`n"

foreach ($termo in $termos) {
    if ($textoCompleto.IndexOf(
        $termo,
        [System.StringComparison]::OrdinalIgnoreCase
    ) -ge 0) {
        Add-Linha ("ENCONTRADO: " + $termo)
    }
    else {
        Add-Linha ("NAO ENCONTRADO: " + $termo)
    }
}

[System.IO.File]::WriteAllLines(
    $saida,
    $linhas,
    [System.Text.Encoding]::UTF8
)

Write-Host ""
Write-Host "============================================================"
Write-Host " DIAGNOSTICO CONCLUIDO"
Write-Host "============================================================"
Write-Host ""
Write-Host "Arquivo gerado:"
Write-Host $saida
Write-Host ""
