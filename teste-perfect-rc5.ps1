$ErrorActionPreference = "Stop"

# ============================================================
# PERFECT / vbRichClient5 - TESTE COMPLETO
# Objetivo:
# 1) carregar DirectCOM.dll
# 2) carregar vbRichClient5.cConstructor
# 3) criar cConnection
# 4) abrir SOMENTE A COPIA CatalogoExpresso.c01 em modo read-only
#
# Este script NAO abre nem altera o arquivo original da Perfect.
# Ele usa exclusivamente:
# C:\FR-FUCK-CLEAR\perfect-base\CatalogoExpresso.c01
# ============================================================

$dirPerfect = "C:\ProgramData\CatalogoPerfect\Configuracoes"
$directCom  = Join-Path $dirPerfect "DirectCOM.dll"
$richClient = Join-Path $dirPerfect "vbRichClient5.dll"

$arquivoDb = "C:\FR-FUCK-CLEAR\perfect-base\CatalogoExpresso.c01"

Write-Host ""
Write-Host "============================================================"
Write-Host " Perfect / vbRichClient5 - teste completo"
Write-Host "============================================================"
Write-Host ""

Write-Host "Processo 32 bits:" (-not [Environment]::Is64BitProcess)
Write-Host ""

if ([Environment]::Is64BitProcess) {
    throw "Este teste precisa rodar no PowerShell 32 bits (SysWOW64)."
}

if (-not (Test-Path $directCom)) {
    throw "DirectCOM.dll nao encontrado em: $directCom"
}

if (-not (Test-Path $richClient)) {
    throw "vbRichClient5.dll nao encontrado em: $richClient"
}

if (-not (Test-Path $arquivoDb)) {
    throw "A copia CatalogoExpresso.c01 nao foi encontrada em: $arquivoDb"
}

Write-Host "Arquivos encontrados:"
Write-Host "  DirectCOM :" $directCom
Write-Host "  RichClient:" $richClient
Write-Host "  Base COPIA:" $arquivoDb
Write-Host ""

$codigo = @"
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

    [DllImport(
        @"C:\ProgramData\CatalogoPerfect\Configuracoes\DirectCOM.dll",
        EntryPoint = "GETINSTANCELASTERROR",
        CallingConvention = CallingConvention.StdCall
    )]
    public static extern IntPtr GetInstanceLastError();
}
"@

Add-Type -TypeDefinition $codigo

[DirectComBridge]::CoInitialize([IntPtr]::Zero) | Out-Null

Write-Host "Carregando DirectCOM.dll..."

$hDirect = [DirectComBridge]::LoadLibraryW($directCom)

if ($hDirect -eq [IntPtr]::Zero) {
    throw "Nao foi possivel carregar DirectCOM.dll."
}

Write-Host "OK - DirectCOM.dll carregado."
Write-Host ""

# BSTR: compatível com o StrPtr usado pelo VB6.
$pDll    = [Runtime.InteropServices.Marshal]::StringToBSTR($richClient)
$pClasse = [Runtime.InteropServices.Marshal]::StringToBSTR("cConstructor")

[IntPtr]$argDll    = $pDll
[IntPtr]$argClasse = $pClasse

$constructor = $null
$conexao = $null

try {
    Write-Host "Carregando cConstructor..."

    $ponteiro = [DirectComBridge]::GetInstanceEx(
        [ref]$argDll,
        [ref]$argClasse,
        $true
    )

    if ($ponteiro -eq [IntPtr]::Zero) {

        Write-Host ""
        Write-Host "GetInstanceEx retornou ponteiro nulo."

        try {
            $pErro = [DirectComBridge]::GetInstanceLastError()

            if ($pErro -ne [IntPtr]::Zero) {
                try {
                    $erroDirectCom =
                        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pErro)

                    Write-Host ""
                    Write-Host "ERRO INFORMADO PELO DIRECTCOM:"
                    Write-Host $erroDirectCom
                }
                catch {
                    Write-Host "O DirectCOM retornou um erro, mas o texto nao pode ser convertido."
                }
            }
        }
        catch {}

        throw "Nao foi possivel carregar cConstructor."
    }

    Write-Host "OK - ponteiro COM recebido."

    $constructor =
        [Runtime.InteropServices.Marshal]::GetObjectForIUnknown($ponteiro)

    [Runtime.InteropServices.Marshal]::Release($ponteiro) | Out-Null

    if ($null -eq $constructor) {
        throw "Nao foi possivel converter o ponteiro em objeto COM."
    }

    Write-Host "OK - cConstructor carregado."
    Write-Host ""

    Write-Host "Criando cConnection..."

    $conexao = $constructor.Connection()

    if ($null -eq $conexao) {
        throw "Connection retornou objeto vazio."
    }

    Write-Host "OK - cConnection criada."
    Write-Host ""

    Write-Host "Assinaturas confirmadas:"
    Write-Host "  OpenDBReadOnly : bool OpenDBReadOnly (string, string, bool)"
    Write-Host "  OpenDB         : bool OpenDB (string, string, bool)"
    Write-Host "  OpenRecordset  : _cRecordset OpenRecordset (string, bool)"
    Write-Host "  LastDBError    : string LastDBError ()"
    Write-Host ""

    Write-Host "============================================================"
    Write-Host " TESTANDO ABERTURA DA COPIA c01 EM SOMENTE LEITURA"
    Write-Host "============================================================"
    Write-Host ""
    Write-Host "Arquivo:" $arquivoDb
    Write-Host ""

    try {
        # IMPORTANTE:
        # - arquivoDb = COPIA em C:\FR-FUCK-CLEAR\perfect-base
        # - segundo parametro vazio = teste sem chave
        # - terceiro parametro = True
        # - metodo usado = OpenDBReadOnly
        $abriu = $conexao.OpenDBReadOnly(
            $arquivoDb,
            "",
            $true
        )

        Write-Host "Retorno OpenDBReadOnly:" $abriu
        Write-Host ""

        if ($abriu) {
            Write-Host "============================================================"
            Write-Host " OK - BANCO ABERTO EM SOMENTE LEITURA."
            Write-Host "============================================================"
            Write-Host ""
            Write-Host "DBHdl:" $conexao.DBHdl
            Write-Host ""
            Write-Host "NAO FIZEMOS NENHUMA ALTERACAO NO BANCO."
            Write-Host "O proximo passo sera listar as tabelas e consultar BRD0379."
        }
        else {
            Write-Host "============================================================"
            Write-Host " BANCO NAO ABRIU."
            Write-Host "============================================================"
            Write-Host ""

            try {
                Write-Host "LastDBError:"
                Write-Host $conexao.LastDBError()
            }
            catch {
                Write-Host "Nao foi possivel obter LastDBError."
            }
        }
    }
    catch {
        Write-Host ""
        Write-Host "============================================================"
        Write-Host " ERRO AO ABRIR A COPIA."
        Write-Host "============================================================"
        Write-Host ""
        Write-Host "Mensagem:"
        Write-Host $_.Exception.Message

        try {
            Write-Host ""
            Write-Host "LastDBError:"
            Write-Host $conexao.LastDBError()
        }
        catch {}
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

Write-Host ""
Write-Host "============================================================"
Write-Host " FIM DO TESTE"
Write-Host "============================================================"
Write-Host ""
