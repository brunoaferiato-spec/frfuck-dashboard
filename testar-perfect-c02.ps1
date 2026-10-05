$ErrorActionPreference = "Stop"

# ============================================================
# PERFECT - TESTE DA BASE c02
#
# Objetivo:
# 1) carregar o mesmo motor vbRichClient5 usado pelo Perfect
# 2) abrir SOMENTE a copia CatalogoExpresso.c02 em read-only
# 3) testar se c02 e um SQLite legivel sem chave
# 4) se abrir, listar tabelas/views
# 5) procurar tabelas/valores de configuracao como PARAMS e UMREGISTRO
#
# NAO altera a base original nem a copia.
# NAO executa INSERT / UPDATE / DELETE.
# ============================================================

$dirPerfect = "C:\ProgramData\CatalogoPerfect\Configuracoes"
$directCom  = Join-Path $dirPerfect "DirectCOM.dll"
$richClient = Join-Path $dirPerfect "vbRichClient5.dll"
$arquivoDb  = "C:\FR-FUCK-CLEAR\perfect-base\CatalogoExpresso.c02"

function Titulo([string]$texto) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host " $texto"
    Write-Host "============================================================"
    Write-Host ""
}

function Valor-Campo($rs, [int]$indice) {
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

function Mostrar-Recordset($rs, [int]$limite = 100) {
    if ($null -eq $rs) {
        Write-Host "(recordset nulo)"
        return
    }

    $qtdCampos = $rs.Fields.Count
    $nomes = @()

    for ($i = 0; $i -lt $qtdCampos; $i++) {
        try {
            $nomes += [string]$rs.Fields.Item($i).Name
        }
        catch {
            $nomes += "COL_$i"
        }
    }

    Write-Host "COLUNAS:" ($nomes -join " | ")
    Write-Host ""

    $linha = 0

    while (-not $rs.EOF -and $linha -lt $limite) {
        $valores = @()

        for ($i = 0; $i -lt $qtdCampos; $i++) {
            $valor = Valor-Campo $rs $i

            if ($null -eq $valor -or $valor -is [System.DBNull]) {
                $valor = ""
            }

            $texto = ([string]$valor) -replace "`r|`n", " "

            if ($texto.Length -gt 500) {
                $texto = $texto.Substring(0, 500) + "..."
            }

            $valores += $texto
        }

        Write-Host ("[" + ($linha + 1) + "] " + ($valores -join " | "))

        $rs.MoveNext()
        $linha++
    }

    if ($linha -eq 0) {
        Write-Host "(nenhum registro)"
    }
}

if ([Environment]::Is64BitProcess) {
    throw "Este script precisa rodar no PowerShell 32 bits (SysWOW64)."
}

foreach ($arquivo in @($directCom, $richClient, $arquivoDb)) {
    if (-not (Test-Path $arquivo)) {
        throw "Arquivo nao encontrado: $arquivo"
    }
}

Titulo "PERFECT - TESTE DA COPIA c02"

Write-Host "Processo 32 bits: True"
Write-Host "Base COPIA      :" $arquivoDb
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

    $conexao = $constructor.Connection()

    if ($null -eq $conexao) {
        throw "Nao foi possivel criar cConnection."
    }

    Write-Host "OK - cConstructor carregado."
    Write-Host "OK - cConnection criada."

    Titulo "ABRINDO c02 EM SOMENTE LEITURA"

    $abriu = $conexao.OpenDBReadOnly(
        $arquivoDb,
        "",
        $true
    )

    Write-Host "Retorno OpenDBReadOnly:" $abriu
    Write-Host ""

    if (-not $abriu) {
        Write-Host "BANCO c02 NAO ABRIU."
        Write-Host "LastDBError:"
        Write-Host $conexao.LastDBError()
        exit 2
    }

    Write-Host "OK - c02 abriu em read-only."
    Write-Host "DBHdl:" $conexao.DBHdl

    Titulo "TESTANDO sqlite_master"

    try {
        $rs = $conexao.OpenRecordset(
            "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name",
            $true
        )

        Mostrar-Recordset $rs 300
    }
    catch {
        Write-Host "A conexao abriu, mas sqlite_master nao pode ser lido."
        Write-Host "Mensagem:"
        Write-Host $_.Exception.Message
        Write-Host ""
        Write-Host "LastDBError:"
        try {
            Write-Host $conexao.LastDBError()
        }
        catch {}

        exit 3
    }

    # ------------------------------------------------------------
    # PARAMS
    # ------------------------------------------------------------
    Titulo "TABELA PARAMS"

    try {
        $rsParams = $conexao.OpenRecordset(
            "SELECT * FROM PARAMS LIMIT 300",
            $true
        )

        Mostrar-Recordset $rsParams 300
    }
    catch {
        Write-Host "PARAMS nao existe ou nao pode ser consultada."
        Write-Host $_.Exception.Message
    }

    # ------------------------------------------------------------
    # UMREGISTRO
    # ------------------------------------------------------------
    Titulo "TABELA UMREGISTRO"

    try {
        $rsUm = $conexao.OpenRecordset(
            "SELECT * FROM UMREGISTRO LIMIT 50",
            $true
        )

        Mostrar-Recordset $rsUm 50
    }
    catch {
        Write-Host "UMREGISTRO nao existe ou nao pode ser consultada."
        Write-Host $_.Exception.Message
    }

    # ------------------------------------------------------------
    # Busca ampla de nomes de tabelas/colunas relacionadas a config
    # ------------------------------------------------------------
    Titulo "OBJETOS RELACIONADOS A CONFIGURACAO"

    try {
        $rsCfg = $conexao.OpenRecordset(
            "SELECT type, name, sql FROM sqlite_master " +
            "WHERE UPPER(name) LIKE '%PARAM%' " +
            "OR UPPER(name) LIKE '%CONFIG%' " +
            "OR UPPER(name) LIKE '%EMPRESA%' " +
            "OR UPPER(name) LIKE '%REGISTRO%' " +
            "ORDER BY name",
            $true
        )

        Mostrar-Recordset $rsCfg 200
    }
    catch {
        Write-Host "Nao foi possivel consultar objetos de configuracao."
        Write-Host $_.Exception.Message
    }

    Titulo "FIM"

    Write-Host "Nenhum INSERT, UPDATE ou DELETE foi executado."
    Write-Host "A base usada foi exclusivamente a COPIA c02 em perfect-base."
}
finally {
    if ($pDll -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pDll)
    }

    if ($pClasse -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeBSTR($pClasse)
    }
}
