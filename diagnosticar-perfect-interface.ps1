$ErrorActionPreference = "Stop"

# ============================================================
# PERFECT - DIAGNOSTICO DE INTERFACE (UI AUTOMATION)
#
# Objetivo:
# - ler SOMENTE a interface do CatalogoExpresso aberto
# - descobrir se codigo, descricao, aplicacao, modelo e ano
#   aparecem como controles acessiveis pelo Windows
#
# Como usar:
# 1) abra o Catalogo Perfect
# 2) pesquise BRD0379 e deixe o resultado na tela
# 3) execute este script no PowerShell normal
#
# O script NAO clica, NAO digita, NAO altera arquivos e NAO fecha o programa.
# ============================================================

$saida = "C:\FR-FUCK-CLEAR\perfect-ui-diagnostico.txt"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$processos = Get-Process CatalogoExpresso -ErrorAction SilentlyContinue

if (-not $processos) {
    throw "CatalogoExpresso nao esta aberto. Abra o Perfect, pesquise BRD0379 e rode novamente."
}

$proc = $processos |
    Sort-Object StartTime -Descending |
    Select-Object -First 1

Write-Host ""
Write-Host "============================================================"
Write-Host " PERFECT - DIAGNOSTICO DE INTERFACE"
Write-Host "============================================================"
Write-Host ""
Write-Host "Processo:" $proc.ProcessName
Write-Host "PID     :" $proc.Id
Write-Host ""

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
    throw "Nao consegui localizar a janela principal do CatalogoExpresso via UI Automation."
}

$linhas = New-Object System.Collections.Generic.List[string]

function Add-Linha([string]$texto = "") {
    $linhas.Add($texto)
    Write-Host $texto
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
Add-Linha " PERFECT - DIAGNOSTICO DE INTERFACE"
Add-Linha "============================================================"
Add-Linha ""
Add-Linha ("Data: " + (Get-Date -Format "dd/MM/yyyy HH:mm:ss"))
Add-Linha ("PID : " + $proc.Id)
Add-Linha ("Janela: " + $janela.Current.Name)
Add-Linha ""
Add-Linha "IMPORTANTE: este script e SOMENTE LEITURA."
Add-Linha ""

$elementos = $janela.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
)

Add-Linha ("Controles encontrados: " + $elementos.Count)
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
    $legacyNome = ""
    $legacyValor = ""

    try { $nome = [string]$el.Current.Name } catch {}
    try { $autoId = [string]$el.Current.AutomationId } catch {}
    try { $tipo = [string]$el.Current.ControlType.ProgrammaticName } catch {}
    try { $classe = [string]$el.Current.ClassName } catch {}
    try { $help = [string]$el.Current.HelpText } catch {}

    $vp = Tenta-Pattern $el ([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp) {
        try { $valor = [string]$vp.Current.Value } catch {}
    }

    $legacy = Tenta-Pattern $el ([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern)
    if ($legacy) {
        try { $legacyNome = [string]$legacy.Current.Name } catch {}
        try { $legacyValor = [string]$legacy.Current.Value } catch {}
    }

    # Mantem somente controles que tenham alguma informacao util
    # ou sejam tipos relevantes para leitura/automacao.
    $relevante =
        $nome -or
        $autoId -or
        $valor -or
        $legacyNome -or
        $legacyValor -or
        $tipo -match "Edit|Text|DataItem|ListItem|Table|List|Pane|Document|Button"

    if (-not $relevante) {
        continue
    }

    Add-Linha ("[" + $indice + "]")
    Add-Linha ("  TYPE       : " + $tipo)
    Add-Linha ("  NAME       : " + ($nome -replace "`r|`n", " "))
    Add-Linha ("  AUTOMATION : " + $autoId)
    Add-Linha ("  CLASS      : " + $classe)

    if ($valor) {
        Add-Linha ("  VALUE      : " + ($valor -replace "`r|`n", " "))
    }

    if ($legacyNome -and $legacyNome -ne $nome) {
        Add-Linha ("  LEGACY NAME: " + ($legacyNome -replace "`r|`n", " "))
    }

    if ($legacyValor -and $legacyValor -ne $valor) {
        Add-Linha ("  LEGACY VAL : " + ($legacyValor -replace "`r|`n", " "))
    }

    if ($help) {
        Add-Linha ("  HELP       : " + ($help -replace "`r|`n", " "))
    }

    Add-Linha ""
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
