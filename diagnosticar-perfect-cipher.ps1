$ErrorActionPreference = "Stop"

$raizPerfect = "C:\ProgramData\CatalogoPerfect"
$saida = "C:\FR-FUCK-CLEAR\perfect-cipher-diagnostico.txt"

$padroes = @(
    "###-DbCipher",
    "DbCipher",
    "Db-Ci--pher",
    "gIsDbCipher",
    "gCodigoEmpresa",
    "CodigoEmpresa",
    "CodEmp",
    "IdCatalogo"
)

$extIgnoradas = @(
    ".exe", ".dll", ".ocx", ".gif", ".jpg", ".jpeg",
    ".png", ".pdf", ".chm", ".c01", ".c02", ".c07"
)

$linhas = New-Object System.Collections.Generic.List[string]

function Add-Linha([string]$texto) {
    $linhas.Add($texto)
    Write-Host $texto
}

Add-Linha "============================================================"
Add-Linha " PERFECT - DIAGNOSTICO DE CONFIGURACAO / CIPHER"
Add-Linha "============================================================"
Add-Linha ""
Add-Linha "Raiz: $raizPerfect"
Add-Linha "Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Add-Linha ""
Add-Linha "Este script e SOMENTE LEITURA."
Add-Linha "Ele nao altera nenhum arquivo do Perfect."
Add-Linha ""

$arquivos = Get-ChildItem $raizPerfect -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Length -le 8MB -and
        $extIgnoradas -notcontains $_.Extension.ToLowerInvariant()
    }

Add-Linha "Arquivos examinados: $($arquivos.Count)"
Add-Linha ""

$totalAchados = 0

foreach ($arquivo in $arquivos) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($arquivo.FullName)

        $representacoes = @(
            @{
                Nome = "ANSI/UTF8"
                Texto = [System.Text.Encoding]::UTF8.GetString($bytes)
            },
            @{
                Nome = "UTF16-LE"
                Texto = [System.Text.Encoding]::Unicode.GetString($bytes)
            }
        )

        $achadosArquivo = New-Object System.Collections.Generic.List[string]

        foreach ($rep in $representacoes) {
            $texto = $rep.Texto

            foreach ($padrao in $padroes) {
                $inicio = 0

                while ($true) {
                    $indice = $texto.IndexOf(
                        $padrao,
                        $inicio,
                        [System.StringComparison]::OrdinalIgnoreCase
                    )

                    if ($indice -lt 0) {
                        break
                    }

                    $antes = [Math]::Max(0, $indice - 180)
                    $tamanho = [Math]::Min(
                        500,
                        $texto.Length - $antes
                    )

                    $trecho = $texto.Substring($antes, $tamanho)
                    $trecho = $trecho -replace "[\x00-\x08\x0B\x0C\x0E-\x1F]", " "
                    $trecho = $trecho -replace "`r", " "
                    $trecho = $trecho -replace "`n", " "
                    $trecho = $trecho -replace "\s+", " "
                    $trecho = $trecho.Trim()

                    $achadosArquivo.Add(
                        "[$($rep.Nome)] PADRAO=$padrao :: $trecho"
                    )

                    $inicio = $indice + $padrao.Length
                }
            }
        }

        if ($achadosArquivo.Count -gt 0) {
            Add-Linha "------------------------------------------------------------"
            Add-Linha "ARQUIVO: $($arquivo.FullName)"
            Add-Linha "TAMANHO: $($arquivo.Length) bytes"
            Add-Linha ""

            foreach ($achado in ($achadosArquivo | Select-Object -Unique)) {
                Add-Linha $achado
                Add-Linha ""
                $totalAchados++
            }
        }
    }
    catch {
        # Apenas ignora arquivos que nao possam ser lidos.
    }
}

Add-Linha "============================================================"
Add-Linha " RESULTADO"
Add-Linha "============================================================"
Add-Linha ""
Add-Linha "Ocorrencias encontradas: $totalAchados"
Add-Linha ""

if ($totalAchados -eq 0) {
    Add-Linha "Nenhuma configuracao textual foi localizada."
    Add-Linha "Nesse caso, o proximo passo sera observar como o CatalogoExpresso"
    Add-Linha "gera a chave em memoria, sem alterar a instalacao."
}
else {
    Add-Linha "Envie o conteudo deste arquivo para analise:"
    Add-Linha $saida
}

[System.IO.File]::WriteAllLines(
    $saida,
    $linhas,
    [System.Text.Encoding]::UTF8
)

Write-Host ""
Write-Host "Arquivo gerado:"
Write-Host $saida
Write-Host ""
