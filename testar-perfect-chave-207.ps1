$ErrorActionPreference = "Stop"

# ============================================================
# PERFECT - TESTE CONTROLADO DA CHAVE DERIVADA DO ID 207
#
# Evidencia do Windows:
# - Catalogo Perfect aparece como CatalogoExpresso207Ideia2001
#
# Objetivo:
# 1) carregar o mesmo motor vbRichClient5 usado pelo Perfect
# 2) abrir SOMENTE a copia CatalogoExpresso.c01 em read-only
# 3) testar apenas poucas chaves derivadas da configuracao encontrada
# 4) validar a chave executando SELECT em sqlite_master
# 5) se funcionar, listar tabelas e procurar BRD0379
#
# NAO altera a base original nem a copia.
# NAO executa INSERT / UPDATE / DELETE.
# ============================================================

$dirPerfect = "C:\ProgramData\CatalogoPerfect\Configuracoes"
$directCom  = Join-Path $dirPerfect "DirectCOM.dll"
$richClient = Join-Path $dirPerfect "vbRichClient5.dll"
$arquivoDb  = "C:\FR-FUCK-CLEAR\perfect-base\CatalogoExpresso.c01"

$codigoEmpresa = "207"
$codigoBusca = "BRD0379"

$candidatos = @(
    "###-DbCipher:$codigoEmpresa",
    $codigoEmpresa,
    "DbCipher:$codigoEmpresa",
    "CatalogoExpresso$codigoEmpresa"
)

function Titulo([string]$texto) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host " $texto"
    Write-Host "============================================================"
    Write-Host ""
}

function Valor-Campo-Index($rs, [int]$indice) {
    try {
        return $rs.Fields.Item($indice).Value
    }
    catch {
        try {
            return $rs.Fields($indice).Value
        }
        catch {
            return $null
        }
    }
}

function Novo-Connection($constructor) {
    $conexao = $constructor.Connection()

    if ($null -eq $conexao) {
        throw "Nao foi possivel criar cConnection."
    }

    return $conexao
}

if ([Environment]::Is64BitProcess) {
    throw "Este script precisa rodar no PowerShell 32 bits (SysWOW64)."
}

foreach ($arquivo in @($directCom, $richClient, $arquivoDb)) {
    if (-not (Test-Path $arquivo)) {
        throw "Arquivo nao encontrado: $arquivo"
    }
}

Titulo "PERFECT - TESTE CONTROLADO DA CHAVE"

Write-Host "Processo 32 bits : True"
Write-Host "Base COPIA       :" $arquivoDb
Write-Host "Codigo empresa   :" $codigoEmpresa
Write-Host "Codigo produto   :" $codigoBusca
Write-Host ""

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

    Write-Host "OK - cConstructor carregado."

    Titulo "TESTANDO CHAVES DERIVADAS DO ID 207"

    $chaveCorreta = $null

    foreach ($chave in $candidatos) {
        Write-Host "Testando:" $chave

        $conexao = Novo-Connection $constructor

        try {
            $abriu = $conexao.OpenDBReadOnly(
                $arquivoDb,
                $chave,
                $true
            )

            if (-not $abriu) {
                Write-Host "  OpenDBReadOnly retornou False."
                try {
                    Write-Host "  LastDBError:" $conexao.LastDBError()
                }
                catch {}
                Write-Host ""
                continue
            }

            try {
                $rs = $conexao.OpenRecordset(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 20",
                    $true
                )

                $nomes = @()

                while (-not $rs.EOF) {
                    $nome = Valor-Campo-Index $rs 0

                    if ($nome) {
                        $nomes += [string]$nome
                    }

                    $rs.MoveNext()
                }

                if ($nomes.Count -gt 0) {
                    Write-Host "  SUCESSO - consulta sqlite_master funcionou."
                    Write-Host "  Tabelas:" ($nomes -join ", ")
                    Write-Host ""

                    $chaveCorreta = $chave
                    break
                }
                else {
                    Write-Host "  Banco abriu, mas nenhuma tabela foi retornada."
                }
            }
            catch {
                Write-Host "  Consulta falhou:" $_.Exception.Message
                try {
                    Write-Host "  LastDBError:" $conexao.LastDBError()
                }
                catch {}
            }
        }
        catch {
            Write-Host "  Falha:" $_.Exception.Message
            try {
                Write-Host "  LastDBError:" $conexao.LastDBError()
            }
            catch {}
        }

        Write-Host ""
    }

    if (-not $chaveCorreta) {
        Titulo "CHAVE AINDA NAO CONFIRMADA"

        Write-Host "Nenhum dos poucos candidatos derivados do ID 207"
        Write-Host "permitiu consultar sqlite_master."
        Write-Host ""
        Write-Host "Nao foi feita tentativa de forca bruta."
        Write-Host "Nenhum arquivo foi alterado."
        exit 3
    }

    Titulo "CHAVE CONFIRMADA"

    Write-Host "Chave que permitiu ler o banco:"
    Write-Host $chaveCorreta
    Write-Host ""

    $conexaoFinal = Novo-Connection $constructor

    $abriuFinal = $conexaoFinal.OpenDBReadOnly(
        $arquivoDb,
        $chaveCorreta,
        $true
    )

    if (-not $abriuFinal) {
        throw "A chave funcionou no teste, mas falhou ao reabrir a base."
    }

    Titulo "TABELAS DA BASE"

    $rsTabelas = $conexaoFinal.OpenRecordset(
        "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name",
        $true
    )

    while (-not $rsTabelas.EOF) {
        $tipo = Valor-Campo-Index $rsTabelas 0
        $nome = Valor-Campo-Index $rsTabelas 1
        $tbl  = Valor-Campo-Index $rsTabelas 2

        Write-Host "$tipo | $nome | $tbl"

        $rsTabelas.MoveNext()
    }

    Titulo "ESTRUTURA DA TABELA PRODUTO"

    $colunasProduto = @()

    try {
        $rsInfo = $conexaoFinal.OpenRecordset(
            "PRAGMA table_info('PRODUTO')",
            $true
        )

        while (-not $rsInfo.EOF) {
            $cid  = Valor-Campo-Index $rsInfo 0
            $nome = Valor-Campo-Index $rsInfo 1
            $tipo = Valor-Campo-Index $rsInfo 2

            Write-Host "$cid | $nome | $tipo"

            if ($nome) {
                $colunasProduto += [string]$nome
            }

            $rsInfo.MoveNext()
        }
    }
    catch {
        Write-Host "Nao foi possivel consultar PRAGMA table_info('PRODUTO')."
        Write-Host $_.Exception.Message
    }

    if ($colunasProduto.Count -gt 0) {
        Titulo "PROCURANDO BRD0379 EM PRODUTO"

        $codigoEscapado = $codigoBusca.Replace("'", "''")
        $condicoes = @()

        foreach ($coluna in $colunasProduto) {
            $colunaSql = '"' + $coluna.Replace('"', '""') + '"'
            $condicoes += "CAST($colunaSql AS TEXT) LIKE '%$codigoEscapado%'"
        }

        $sql =
            "SELECT * FROM PRODUTO WHERE " +
            ($condicoes -join " OR ") +
            " LIMIT 10"

        try {
            $rsProduto = $conexaoFinal.OpenRecordset(
                $sql,
                $true
            )

            $numeroCampos = $rsProduto.Fields.Count
            $nomesCampos = @()

            for ($i = 0; $i -lt $numeroCampos; $i++) {
                try {
                    $nomesCampos += [string]$rsProduto.Fields.Item($i).Name
                }
                catch {
                    $nomesCampos += "COL_$i"
                }
            }

            Write-Host "COLUNAS:" ($nomesCampos -join " | ")
            Write-Host ""

            $linha = 0

            while (-not $rsProduto.EOF -and $linha -lt 10) {
                $valores = @()

                for ($i = 0; $i -lt $numeroCampos; $i++) {
                    $valor = Valor-Campo-Index $rsProduto $i

                    if ($null -eq $valor -or $valor -is [System.DBNull]) {
                        $valor = ""
                    }

                    $valores += ([string]$valor -replace "`r|`n", " ")
                }

                Write-Host ("[" + ($linha + 1) + "] " + ($valores -join " | "))

                $rsProduto.MoveNext()
                $linha++
            }

            if ($linha -eq 0) {
                Write-Host "Nenhum registro BRD0379 encontrado em PRODUTO."
            }
        }
        catch {
            Write-Host "Falha na busca pelo BRD0379:"
            Write-Host $_.Exception.Message
            try {
                Write-Host "LastDBError:" $conexaoFinal.LastDBError()
            }
            catch {}
        }
    }

    Titulo "FIM"

    Write-Host "Nenhum INSERT, UPDATE ou DELETE foi executado."
    Write-Host "A base usada foi exclusivamente a COPIA em perfect-base."
}
finally {
    if ($pDll -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pDll)
    }

    if ($pClasse -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pClasse)
    }
}
