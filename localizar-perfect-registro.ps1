$ErrorActionPreference = "SilentlyContinue"

# ============================================================
# PERFECT - DIAGNOSTICO DE REGISTRO
#
# SOMENTE LEITURA.
# Procura configuracoes do CatalogoExpresso / Ideia2001 / Perfect
# no Registro do Windows, principalmente configuracoes legadas VB6.
# Nao altera nenhuma chave ou valor.
# ============================================================

$saida = "C:\FR-FUCK-CLEAR\perfect-registro-diagnostico.txt"

$linhas = New-Object System.Collections.Generic.List[string]

function Add-Linha([string]$texto = "") {
    $linhas.Add($texto)
    Write-Host $texto
}

function Dump-Chave([string]$caminho) {
    if (-not (Test-Path $caminho)) {
        Add-Linha "NAO EXISTE: $caminho"
        Add-Linha ""
        return
    }

    Add-Linha "============================================================"
    Add-Linha " CHAVE: $caminho"
    Add-Linha "============================================================"
    Add-Linha ""

    Get-ChildItem $caminho -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object {
        $chave = $_

        try {
            $props = Get-ItemProperty $chave.PSPath -ErrorAction Stop
            $nomes = $props.PSObject.Properties |
                Where-Object {
                    $_.Name -notmatch "^PS(Path|ParentPath|ChildName|Drive|Provider)$"
                }

            if ($nomes.Count -gt 0) {
                Add-Linha "[$($chave.Name)]"

                foreach ($prop in $nomes) {
                    $valor = [string]$prop.Value
                    $valor = $valor -replace "`r", " "
                    $valor = $valor -replace "`n", " "

                    Add-Linha ("  {0} = {1}" -f $prop.Name, $valor)
                }

                Add-Linha ""
            }
        }
        catch {}
    }
}

function Reg-Busca([string]$raiz, [string]$termo) {
    Add-Linha "------------------------------------------------------------"
    Add-Linha "BUSCA: $raiz  |  termo: $termo"
    Add-Linha "------------------------------------------------------------"

    try {
        $resultado = & reg.exe query $raiz /f $termo /s 2>$null

        if ($LASTEXITCODE -eq 0 -and $resultado) {
            foreach ($linha in $resultado) {
                Add-Linha ([string]$linha)
            }
        }
        else {
            Add-Linha "(nenhum resultado)"
        }
    }
    catch {
        Add-Linha "(erro/sem resultado)"
    }

    Add-Linha ""
}

Add-Linha "============================================================"
Add-Linha " PERFECT - DIAGNOSTICO DE REGISTRO"
Add-Linha "============================================================"
Add-Linha ""
Add-Linha "Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Add-Linha ""
Add-Linha "Este script e SOMENTE LEITURA."
Add-Linha "Nenhuma chave ou valor sera alterado."
Add-Linha ""

# 1) Local mais provavel para aplicacoes VB6 usando SaveSetting/GetSetting.
Dump-Chave "Registry::HKEY_CURRENT_USER\Software\VB and VBA Program Settings"

# 2) VirtualStore pode receber configuracoes de programas 32-bit antigos.
Dump-Chave "Registry::HKEY_CURRENT_USER\Software\Classes\VirtualStore\MACHINE\SOFTWARE"

# 3) Buscas direcionadas, sem despejar o Registro inteiro.
$buscas = @(
    "CatalogoExpresso",
    "Catalogo Expresso",
    "Ideia2001",
    "Perfect",
    "CatExp",
    "CodigoEmpresa",
    "DbCipher",
    "gIsDbCipher"
)

$raizes = @(
    "HKCU\Software",
    "HKLM\SOFTWARE\WOW6432Node"
)

Add-Linha "============================================================"
Add-Linha " BUSCAS DIRECIONADAS"
Add-Linha "============================================================"
Add-Linha ""

foreach ($raiz in $raizes) {
    foreach ($termo in $buscas) {
        Reg-Busca $raiz $termo
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
