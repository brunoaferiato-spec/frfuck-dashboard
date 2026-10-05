$ErrorActionPreference = "SilentlyContinue"

# ============================================================
# PERFECT - LOCALIZAR BASE LOCAL / TEMPORARIA
#
# Objetivo:
# localizar arquivos que o CatalogoExpresso pode criar ao abrir
# ou preparar a base, especialmente:
#   CatExpDbLocal.c01
#   CatExpDbLocal.c02
#   aux-db-*
#   aad.tmp
#   NVCatExpC01*
#
# O script e SOMENTE LEITURA.
# Nao altera, renomeia, copia ou apaga nada.
# ============================================================

$saida = "C:\FR-FUCK-CLEAR\perfect-base-local-diagnostico.txt"

$roots = @(
    "C:\ProgramData\CatalogoPerfect",
    $env:TEMP,
    $env:LOCALAPPDATA,
    $env:APPDATA,
    "C:\Users\Public"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$padroes = @(
    "CatExpDbLocal*",
    "aux-db-*",
    "aad.tmp",
    "NVCatExpC01*",
    "CatExpC01-*",
    "CatalogoExpresso.c01",
    "CatalogoExpresso.c02"
)

$linhas = New-Object System.Collections.Generic.List[string]

function Add-Linha([string]$texto = "") {
    $linhas.Add($texto)
    Write-Host $texto
}

function Assinatura-Arquivo([string]$caminho) {
    try {
        $fs = New-Object System.IO.FileStream(
            $caminho,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )

        $buffer = New-Object byte[] 32
        $lidos = $fs.Read($buffer, 0, 32)
        $fs.Close()

        if ($lidos -le 0) {
            return @{
                ASCII = ""
                HEX = ""
                SQLite = $false
            }
        }

        $ascii = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $lidos)
        $hex = ($buffer[0..($lidos - 1)] | ForEach-Object {
            $_.ToString("X2")
        }) -join " "

        return @{
            ASCII = $ascii
            HEX = $hex
            SQLite = $ascii.StartsWith("SQLite format 3")
        }
    }
    catch {
        return @{
            ASCII = "<BLOQUEADO/SEM ACESSO>"
            HEX = ""
            SQLite = $false
        }
    }
}

Add-Linha "============================================================"
Add-Linha " PERFECT - LOCALIZAR BASE LOCAL / TEMPORARIA"
Add-Linha "============================================================"
Add-Linha ""
Add-Linha "Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Add-Linha ""
Add-Linha "IMPORTANTE:"
Add-Linha "Deixe o Catalogo Perfect ABERTO e, se possivel,"
Add-Linha "pesquise BRD0379 antes de executar este script."
Add-Linha ""
Add-Linha "Este script e SOMENTE LEITURA."
Add-Linha ""

$encontrados = New-Object System.Collections.Generic.List[object]

foreach ($root in $roots) {
    Add-Linha "Procurando em: $root"

    foreach ($padrao in $padroes) {
        Get-ChildItem `
            -Path $root `
            -Recurse `
            -Force `
            -File `
            -Filter $padrao `
            -ErrorAction SilentlyContinue |
        ForEach-Object {
            $chave = $_.FullName.ToLowerInvariant()

            if (-not ($encontrados | Where-Object {
                $_.FullName.ToLowerInvariant() -eq $chave
            })) {
                $encontrados.Add($_)
            }
        }
    }

    Add-Linha ""
}

Add-Linha "============================================================"
Add-Linha " ARQUIVOS ENCONTRADOS"
Add-Linha "============================================================"
Add-Linha ""

if ($encontrados.Count -eq 0) {
    Add-Linha "Nenhum arquivo com os nomes esperados foi localizado."
}
else {
    $ordenados = $encontrados |
        Sort-Object LastWriteTime -Descending

    foreach ($arquivo in $ordenados) {
        $sig = Assinatura-Arquivo $arquivo.FullName

        Add-Linha "ARQUIVO : $($arquivo.FullName)"
        Add-Linha "TAMANHO : $($arquivo.Length) bytes"
        Add-Linha "ALTERADO: $($arquivo.LastWriteTime.ToString('dd/MM/yyyy HH:mm:ss'))"
        Add-Linha "SQLITE? : $($sig.SQLite)"
        Add-Linha "ASCII32 : $($sig.ASCII)"
        Add-Linha "HEX32   : $($sig.HEX)"
        Add-Linha ""
    }
}

Add-Linha "============================================================"
Add-Linha " ARQUIVOS RECENTES RELACIONADOS"
Add-Linha "============================================================"
Add-Linha ""

$limiteTempo = (Get-Date).AddMinutes(-30)

foreach ($root in $roots) {
    Add-Linha "Recentes em: $root"

    Get-ChildItem `
        -Path $root `
        -Recurse `
        -Force `
        -File `
        -ErrorAction SilentlyContinue |
    Where-Object {
        $_.LastWriteTime -gt $limiteTempo -and
        (
            $_.Name -match "CatExp|Catalogo|Perfect|aux-db|aad"
        )
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 50 |
    ForEach-Object {
        Add-Linha (
            "$($_.LastWriteTime.ToString('HH:mm:ss')) | " +
            "$($_.Length) bytes | " +
            $_.FullName
        )
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
