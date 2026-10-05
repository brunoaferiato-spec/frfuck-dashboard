$ErrorActionPreference = "Stop"

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
    throw "Este teste precisa rodar no PowerShell 32 bits."
}

if (-not (Test-Path $directCom)) {
    throw "DirectCOM.dll nao encontrado: $directCom"
}

if (-not (Test-Path $richClient)) {
    throw "vbRichClient5.dll nao encontrado: $richClient"
}

if (-not (Test-Path $arquivoDb)) {
    throw "Copia do CatalogoExpresso.c01 nao encontrada: $arquivoDb"
}

Write-Host "Arquivos encontrados:"
Write-Host "DirectCOM :" $directCom
Write-Host "RichClient:" $richClient
Write-Host "Base COPIA:" $arquivoDb
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

$pDll = [Runtime.InteropServices.Marshal]::StringToBSTR($richClient)
$pClasse = [Runtime.InteropServices.Marshal]::StringToBSTR("cConstructor")

[IntPtr]$argDll = $pDll
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
                    Write-Host "Nao foi possivel converter o erro do DirectCOM."
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
        throw "Nao foi possivel criar o objeto cConstructor."
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

    Write-Host "============================================================"
    Write-Host " TESTANDO A COPIA c01 EM SOMENTE LEITURA"
    Write-Host "============================================================"
    Write-Host ""

    Write-Host "Arquivo:"
    Write-Host $arquivoDb
    Write-Host ""

    try {

        $abriu = $conexao.OpenDBReadOnly(
            $arquivoDb,
            "",
            $true
        )

        Write-Host "Retorno OpenDBReadOnly:" $abriu
        Write-Host ""

        if ($abriu) {

            Write-Host "============================================================"
            Write-Host " OK - BANCO ABERTO EM SOMENTE LEITURA"
            Write-Host "============================================================"
            Write-Host ""

            Write-Host "DBHdl:" $conexao.DBHdl
            Write-Host ""
            Write-Host "Nenhuma alteracao foi feita."
            Write-Host "Proximo passo: listar tabelas e procurar BRD0379."

        }
        else {

            Write-Host "============================================================"
            Write-Host " BANCO NAO ABRIU"
            Write-Host "============================================================"
            Write-Host ""

            Write-Host "LastDBError:"

            try {
                Write-Host $conexao.LastDBError()
            }
            catch {
                Write-Host "Nao foi possivel ler LastDBError."
            }
        }

    }
    catch {

        Write-Host ""
        Write-Host "============================================================"
        Write-Host " ERRO AO ABRIR A COPIA"
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