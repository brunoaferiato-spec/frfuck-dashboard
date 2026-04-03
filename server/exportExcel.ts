import * as XLSX from 'xlsx';

interface FolhaExcelData {
  funcionario: string;
  funcao: string;
  semana1?: number;
  pct1?: number;
  semana2?: number;
  pct2?: number;
  semana3?: number;
  pct3?: number;
  semana4?: number;
  pct4?: number;
  totalLiquidez?: number;
  totalComissao?: number;
  premiacao?: number;
  vale?: number;
  aluguel?: number;
  inss?: number;
  adiantamento?: number;
  holerite?: number;
  boleto?: number;
  observacoes?: string;
  carros?: number;
  valorPorCarro?: number;
  fixo?: number;
}

export function generateFolhaExcel(
  dados: FolhaExcelData[],
  cidade: string,
  ano: number,
  mes: number,
  secao: 'comissao' | 'recepcionista' | 'fixo'
): Buffer {
  const workbook = XLSX.utils.book_new();

  // Preparar dados para a planilha
  const wsData: any[] = [];

  // Título
  wsData.push([`Folha de Pagamento - ${cidade}`]);
  wsData.push([`Período: ${mes}/${ano}`]);
  wsData.push([`Seção: ${secao === 'comissao' ? 'Comissão' : secao === 'recepcionista' ? 'Recepcionista' : 'Funções Fixas'}`]);
  wsData.push([]);

  // Cabeçalhos
  if (secao === 'comissao') {
    wsData.push([
      'Funcionário',
      'Função',
      'Sem 1',
      '% Sem 1',
      'Sem 2',
      '% Sem 2',
      'Sem 3',
      '% Sem 3',
      'Sem 4',
      '% Sem 4',
      'Total Liquidez',
      'Total Comissão',
      'Premiação',
      'Vale',
      'Aluguel',
      'INSS',
      'Adiantamento',
      'Holerite',
      'Boleto',
      'Observações',
    ]);

    // Dados
    dados.forEach(d => {
      wsData.push([
        d.funcionario,
        d.funcao,
        d.semana1 || 0,
        d.pct1 || 0,
        d.semana2 || 0,
        d.pct2 || 0,
        d.semana3 || 0,
        d.pct3 || 0,
        d.semana4 || 0,
        d.pct4 || 0,
        d.totalLiquidez || 0,
        d.totalComissao || 0,
        d.premiacao || 0,
        d.vale || 0,
        d.aluguel || 0,
        d.inss || 0,
        d.adiantamento || 0,
        d.holerite || 0,
        d.boleto || 0,
        d.observacoes || '',
      ]);
    });
  } else if (secao === 'recepcionista') {
    wsData.push([
      'Funcionário',
      'Função',
      'Carros',
      'Valor/Carro',
      'Premiação',
      'Vale',
      'Aluguel',
      'INSS',
      'Adiantamento',
      'Holerite',
      'Boleto',
      'Observações',
    ]);

    dados.forEach(d => {
      wsData.push([
        d.funcionario,
        d.funcao,
        d.carros || 0,
        d.valorPorCarro || 0,
        d.premiacao || 0,
        d.vale || 0,
        d.aluguel || 0,
        d.inss || 0,
        d.adiantamento || 0,
        d.holerite || 0,
        d.boleto || 0,
        d.observacoes || '',
      ]);
    });
  } else {
    wsData.push([
      'Funcionário',
      'Função',
      'Fixo',
      'Premiação',
      'Vale',
      'Aluguel',
      'INSS',
      'Adiantamento',
      'Holerite',
      'Boleto',
      'Observações',
    ]);

    dados.forEach(d => {
      wsData.push([
        d.funcionario,
        d.funcao,
        d.fixo || 0,
        d.premiacao || 0,
        d.vale || 0,
        d.aluguel || 0,
        d.inss || 0,
        d.adiantamento || 0,
        d.holerite || 0,
        d.boleto || 0,
        d.observacoes || '',
      ]);
    });
  }

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Formatação básica
  const colWidths = secao === 'comissao' 
    ? [20, 20, 12, 10, 12, 10, 12, 10, 12, 10, 15, 15, 12, 12, 12, 10, 12, 12, 12, 20]
    : secao === 'recepcionista'
    ? [20, 20, 12, 15, 12, 12, 12, 10, 12, 12, 12, 20]
    : [20, 20, 12, 12, 12, 12, 10, 12, 12, 12, 20];

  worksheet['!cols'] = colWidths.map(w => ({ wch: w }));

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Folha de Pagamento');

  // Gerar buffer
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return buffer as Buffer;
}
