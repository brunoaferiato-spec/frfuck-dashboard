$ErrorActionPreference = "Stop"

# ============================================================
# PERFECT - TESTE CONTROLADO DE CHAVES EMBUTIDAS/CONFIGURADAS
#
# Objetivo:
# - usar o mesmo vbRichClient5 do Perfect
# - abrir SOMENTE a copia CatalogoExpresso.c01
# - testar um conjunto pequeno de candidatos encontrados
#   no proprio executavel/configuracao
# - validar cada candidato tentando ler sqlite_master
#
# NAO altera a base original nem a copia.
# NAO executa INSERT / UPDATE / DELETE.
# NAO faz forca bruta.
# ============================================================

$dirPerfect = "C:\ProgramData\CatalogoPerfect\Configuracoes"
$directCom  = Join-Path $dirPerfect "DirectCOM.dll"
$richClient = Join-Path $dirPerfect "vbRichClient5.dll"
$arquivoDb  = "C:\FR-FUCK-CLEAR\perfect-base\CatalogoExpresso.c01"

$c05 = Join-Path $dirPerfect "CatalogoExpresso.c05"
$c06 = Join-Path $dirPerfect "CatalogoExpresso.c06"

function Titulo([string]$texto) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host " $texto"
    Write-Host "============================================================"
    Write-Host ""
}

function Novo-Connection($constructor) {
    $conexao = $constructor.Connection()

    if ($null -eq $conexao) {
        throw "Nao foi possivel criar cConnection."
    }

    return $conexao
}

function Testar-Chave($constructor, [string]$rotulo, [string]$chave) {
    Write-Host "------------------------------------------------------------"
    Write-Host "Candidato:" $rotulo
    Write-Host "Tamanho  :" $chave.Length
    Write-Host "------------------------------------------------------------"

    $conexao = Novo-Connection $constructor

    try {
        $abriu = $conexao.OpenDBReadOnly(
            $arquivoDb,
            $chave,
            $true
        )

        if (-not $abriu) {
            Write-Host "OpenDBReadOnly retornou False."
            try {
                Write-Host "LastDBError:" $conexao.LastDBError()
            }
            catch {}
            Write-Host ""
            return $false
        }

        try {
            $rs = $conexao.OpenRecordset(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 25",
                $true
            )

            $nomes = @()

            while (-not $rs.EOF) {
                try {
                    $nome = [string]$rs.Fields.Item(0).Value
                }
                catch {
                    $nome = [string]$rs.Fields(0).Value
                }

                if ($nome) {
                    $nomes += $nome
                }

                $rs.MoveNext()
            }

            if ($nomes.Count -gt 0) {
                Write-Host ""
                Write-Host "*** SUCESSO ***"
                Write-Host "sqlite_master foi lido."
                Write-Host "Tabelas:" ($nomes -join ", ")
                Write-Host ""
                return $true
            }

            Write-Host "A consulta executou, mas nao retornou tabelas."
        }
        catch {
            Write-Host "Consulta falhou:" $_.Exception.Message
            try {
                Write-Host "LastDBError:" $conexao.LastDBError()
            }
            catch {}
        }
    }
    catch {
        Write-Host "Falha:" $_.Exception.Message
        try {
            Write-Host "LastDBError:" $conexao.LastDBError()
        }
        catch {}
    }

    Write-Host ""
    return $false
}

if ([Environment]::Is64BitProcess) {
    throw "Este script precisa rodar no PowerShell 32 bits (SysWOW64)."
}

foreach ($arquivo in @($directCom, $richClient, $arquivoDb, $c05, $c06)) {
    if (-not (Test-Path $arquivo)) {
        throw "Arquivo nao encontrado: $arquivo"
    }
}

$c05Valor = (Get-Content $c05 -Raw).Trim()
$c06Valor = (Get-Content $c06 -Raw).Trim()

# Apenas pistas diretamente encontradas no executavel/configuracao.
# Nao ha geracao massiva de combinacoes.
$candidatos = @(
    @{ Rotulo = "string_embutida_1"; Valor = "-as-xnXu02=`$BicUda" },
    @{ Rotulo = "string_embutida_2"; Valor = "kimojltnmojp" },
    @{ Rotulo = "string_embutida_3"; Valor = "e5FA43B08" },
    @{ Rotulo = "string_embutida_4"; Valor = "admin" },
    @{ Rotulo = "conteudo_c05";      Valor = $c05Valor },
    @{ Rotulo = "conteudo_c06";      Valor = $c06Valor }
)

Titulo "PERFECT - TESTE CONTROLADO DE CHAVES"

Write-Host "Processo 32 bits : True"
Write-Host "Base COPIA       :" $arquivoDb
Write-Host "Candidatos       :" $candidatos.Count
Write-Host ""
Write-Host "Somente leitura. Sem forca bruta."
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

    Titulo "TESTANDO CANDIDATOS"

    $encontrada = $null

    foreach ($item in $candidatos) {
        if (Testar-Chave $constructor $item.Rotulo $item.Valor) {
            $encontrada = $item
            break
        }
    }

    if ($null -eq $encontrada) {
        Titulo "NENHUMA CHAVE CONFIRMADA"

        Write-Host "Nenhum dos candidatos diretamente encontrados"
        Write-Host "no executavel/configuracao liberou sqlite_master."
        Write-Host ""
        Write-Host "Nenhuma tentativa de forca bruta foi feita."
        Write-Host "Nenhum arquivo foi alterado."
        exit 3
    }

    Titulo "CHAVE CONFIRMADA"

    Write-Host "Rotulo:" $encontrada.Rotulo
    Write-Host ""

    $conexaoFinal = Novo-Connection $constructor

    $ok = $conexaoFinal.OpenDBReadOnly(
        $arquivoDb,
        $encontrada.Valor,
        $true
    )

    if (-not $ok) {
        throw "A chave funcionou no teste, mas falhou ao reabrir."
    }

    $rsTabelas = $conexaoFinal.OpenRecordset(
        "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name",
        $true
    )

    Write-Host "Objetos encontrados:"
    Write-Host ""

    while (-not $rsTabelas.EOF) {
        try {
            $tipo = [string]$rsTabelas.Fields.Item(0).Value
            $nome = [string]$rsTabelas.Fields.Item(1).Value
            $tbl  = [string]$rsTabelas.Fields.Item(2).Value
        }
        catch {
            $tipo = [string]$rsTabelas.Fields(0).Value
            $nome = [string]$rsTabelas.Fields(1).Value
            $tbl  = [string]$rsTabelas.Fields(2).Value
        }

        Write-Host "$tipo | $nome | $tbl"
        $rsTabelas.MoveNext()
    }
}
finally {
    if ($pDll -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pDll)
    }

    if ($pClasse -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pClasse)
    }
}

Titulo "FIM"

Write-Host "A base utilizada foi somente a COPIA em perfect-base."
Write-Host "Nenhum INSERT, UPDATE ou DELETE foi executado."
