$ErrorActionPreference = "Stop"

# ============================================================
# PERFECT / vbRichClient5 - LEITOR DA BASE LOCAL
# Objetivo:
# 1) carregar DirectCOM + vbRichClient5
# 2) abrir SOMENTE a copia CatalogoExpresso.c01 em read-only
# 3) listar tabelas/views
# 4) mostrar estrutura das tabelas principais
# 5) procurar BRD0379 na tabela PRODUTO
#
# NAO altera a base original nem a copia.
# ============================================================

$dirPerfect = "C:\ProgramData\CatalogoPerfect\Configuracoes"
$directCom  = Join-Path $dirPerfect "DirectCOM.dll"
$richClient = Join-Path $dirPerfect "vbRichClient5.dll"
$arquivoDb  = "C:\FR-FUCK-CLEAR\perfect-base\CatalogoExpresso.c01"
$codigoBusca = "BRD0379"

function Titulo([string]$texto) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host " $texto"
    Write-Host "============================================================"
    Write-Host ""
}

function Campo-Valor($rs, [string]$nome) {
    try {
        return $rs.Fields.Item($nome).Value
    }
    catch {
        try {
            return $rs.Fields($nome).Value
        }
        catch {
            return $null
        }
    }
}

function Imprimir-Recordset($rs, [int]$limite = 100) {
    if ($null -eq $rs) {
        Write-Host "(recordset vazio/nulo)"
        return
    }

    try {
        $count = $rs.Fields.Count
    }
    catch {
        Write-Host "Nao foi possivel ler os campos do recordset."
        return
    }

    $colunas = @()

    for ($i = 0; $i -lt $count; $i++) {
        try {
            $campo = $rs.Fields.Item($i)

            $nome = $null

            foreach ($prop in @("Name", "OriginalColumnName")) {
                try {
                    $valorNome = $campo.$prop
                    if ($valorNome) {
                        $nome = [string]$valorNome
                        break
                    }
                }
                catch {}
            }

            if (-not $nome) {
                $nome = "COL_$i"
            }

            $colunas += $nome
        }
        catch {
            $colunas += "COL_$i"
        }
    }

    Write-Host ("COLUNAS: " + ($colunas -join " | "))
    Write-Host ""

    $linha = 0

    while (-not $rs.EOF -and $linha -lt $limite) {
        $valores = @()

        for ($i = 0; $i -lt $count; $i++) {
            try {
                $campo = $rs.Fields.Item($i)
                $valor = $campo.Value

                if ($null -eq $valor -or $valor -is [System.DBNull]) {
                    $valor = ""
                }

                $texto = [string]$valor
                $texto = $texto -replace "`r", " "
                $texto = $texto -replace "`n", " "
                $texto = $texto.Trim()

                if ($texto.Length -gt 240) {
                    $texto = $texto.Substring(0, 240) + "..."
                }

                $valores += $texto
            }
            catch {
                $valores += ""
            }
        }

        Write-Host ("[" + ($linha + 1) + "] " + ($valores -join " | "))

        try {
            $rs.MoveNext()
        }
        catch {
            break
        }

        $linha++
    }

    if ($linha -eq 0) {
        Write-Host "(nenhum registro)"
    }
}

if ([Environment]::Is64BitProcess) {
    throw "Este teste precisa rodar no PowerShell 32 bits (SysWOW64)."
}

foreach ($arquivo in @($directCom, $richClient, $arquivoDb)) {
    if (-not (Test-Path $arquivo)) {
        throw "Arquivo nao encontrado: $arquivo"
    }
}

Titulo "PERFECT / LEITOR LOCAL - TESTE"

Write-Host "Processo 32 bits: True"
Write-Host "Base COPIA      :" $arquivoDb
Write-Host "Codigo de teste :" $codigoBusca

$codigoCSharp = @"
using System;
using System.Runtime.InteropServices;

public static class DirectComBridge
{
    [DllImport(
        "kernel32.dll",
        CharSet = CharSet.Unicode,
        SetLastError = true
    )]
    public static extern IntPtr LoadLibraryW(string lpFileName);

    [DllImport("ole32.dll")]
    public static extern int CoInitialize(IntPtr pvReserved);

    [DllImport(
        @"C:\ProgramData\CatalogoPerfect\Configuracoes\DirectCOM.dll",
        EntryPoint = "GetInstanceEx",
        CallingConvention = CallingConvention.StdCall
    )]
    public static extern IntPtr GetInstanceEx(
        ref IntPtr strPtrFName,
        ref IntPtr strPtrClassName,
        [MarshalAs(UnmanagedType.VariantBool)] bool useAlteredSearchPath
    );
}
"@

Add-Type -TypeDefinition $codigoCSharp
[DirectComBridge]::CoInitialize([IntPtr]::Zero) | Out-Null

$hDirect = [DirectComBridge]::LoadLibraryW($directCom)

if ($hDirect -eq [IntPtr]::Zero) {
    throw "Nao foi possivel carregar DirectCOM.dll."
}

$pDll = [Runtime.InteropServices.Marshal]::StringToBSTR($richClient)
$pClasse = [Runtime.InteropServices.Marshal]::StringToBSTR("cConstructor")

[IntPtr]$argDll = $pDll
[IntPtr]$argClasse = $pClasse

$constructor = $null
$conexao = $null

try {
    Titulo "CARREGANDO MOTOR DO PERFECT"

    $ponteiro = [DirectComBridge]::GetInstanceEx(
        [ref]$argDll,
        [ref]$argClasse,
        $true
    )

    if ($ponteiro -eq [IntPtr]::Zero) {
        throw "GetInstanceEx retornou ponteiro nulo."
    }

    $constructor =
        [Runtime.InteropServices.Marshal]::GetObjectForIUnknown($ponteiro)

    [Runtime.InteropServices.Marshal]::Release($ponteiro) | Out-Null

    if ($null -eq $constructor) {
        throw "Nao foi possivel criar cConstructor."
    }

    $conexao = $constructor.Connection()

    if ($null -eq $conexao) {
        throw "Nao foi possivel criar cConnection."
    }

    Write-Host "OK - cConstructor carregado."
    Write-Host "OK - cConnection criada."

    Titulo "ABRINDO COPIA EM SOMENTE LEITURA"

    $abriu = $conexao.OpenDBReadOnly(
        $arquivoDb,
        "",
        $true
    )

    if (-not $abriu) {
        Write-Host "BANCO NAO ABRIU."
        Write-Host "LastDBError:"
        Write-Host $conexao.LastDBError()
        exit 2
    }

    Write-Host "OK - banco aberto em read-only."
    Write-Host "DBHdl:" $conexao.DBHdl

    # ------------------------------------------------------------
    # 1) LISTAR TABELAS E VIEWS
    # ------------------------------------------------------------
    Titulo "TABELAS E VIEWS DA BASE"

    try {
        $rsSchema = $conexao.OpenRecordset(
            "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name",
            $true
        )

        Imprimir-Recordset $rsSchema 300
    }
    catch {
        Write-Host "Falha ao consultar sqlite_master:"
        Write-Host $_.Exception.Message
        Write-Host "LastDBError:" $conexao.LastDBError()
    }

    # ------------------------------------------------------------
    # 2) ESTRUTURA DAS TABELAS PRINCIPAIS
    # ------------------------------------------------------------
    $tabelasPrincipais = @(
        "PRODUTO",
        "APLICACAO",
        "PRODUTO_APLICACAO",
        "REFERENCIACRUZADA",
        "GRUPOPRODUTO"
    )

    foreach ($tabela in $tabelasPrincipais) {
        Titulo "COLUNAS: $tabela"

        try {
            $rsColunas = $conexao.OpenRecordset(
                "PRAGMA table_info('$tabela')",
                $true
            )

            Imprimir-Recordset $rsColunas 200
        }
        catch {
            Write-Host "Nao foi possivel consultar a estrutura de ${tabela}."
            Write-Host $_.Exception.Message
            try {
                Write-Host "LastDBError:" $conexao.LastDBError()
            }
            catch {}
        }
    }

    # ------------------------------------------------------------
    # 3) DESCOBRIR COLUNAS DE PRODUTO
    # ------------------------------------------------------------
    Titulo "PROCURANDO $codigoBusca NA TABELA PRODUTO"

    $colunasProduto = @()

    try {
        $rsInfoProduto = $conexao.OpenRecordset(
            "PRAGMA table_info('PRODUTO')",
            $true
        )

        while (-not $rsInfoProduto.EOF) {
            $nomeColuna = Campo-Valor $rsInfoProduto "name"

            if ($nomeColuna) {
                $colunasProduto += [string]$nomeColuna
            }

            $rsInfoProduto.MoveNext()
        }
    }
    catch {
        Write-Host "Nao foi possivel obter as colunas de PRODUTO:"
        Write-Host $_.Exception.Message
    }

    if ($colunasProduto.Count -eq 0) {
        Write-Host "Nenhuma coluna de PRODUTO foi identificada."
    }
    else {
        Write-Host "Colunas identificadas em PRODUTO:"
        Write-Host ($colunasProduto -join ", ")
        Write-Host ""

        $codigoEscapado = $codigoBusca.Replace("'", "''")

        $condicoes = @()

        foreach ($coluna in $colunasProduto) {
            $colunaSql = '"' + $coluna.Replace('"', '""') + '"'

            $condicoes +=
                "CAST($colunaSql AS TEXT) LIKE '%$codigoEscapado%'"
        }

        $sqlBusca =
            "SELECT * FROM PRODUTO WHERE " +
            ($condicoes -join " OR ") +
            " LIMIT 20"

        Write-Host "Executando busca na PRODUTO..."
        Write-Host ""

        try {
            $rsProduto = $conexao.OpenRecordset(
                $sqlBusca,
                $true
            )

            Imprimir-Recordset $rsProduto 20
        }
        catch {
            Write-Host "Falha na busca por ${codigoBusca}:"
            Write-Host $_.Exception.Message
            try {
                Write-Host "LastDBError:" $conexao.LastDBError()
            }
            catch {}
        }
    }

    Titulo "FIM DO DIAGNOSTICO"

    Write-Host "Nenhum INSERT, UPDATE ou DELETE foi executado."
    Write-Host "A base foi aberta exclusivamente com OpenDBReadOnly."
}
finally {
    if ($pDll -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pDll)
    }

    if ($pClasse -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pClasse)
    }
}
