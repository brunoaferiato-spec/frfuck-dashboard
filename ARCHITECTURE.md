# Arquitetura do Sistema Frifuck - Dashboard e Produtividade

## 1. Visão Geral

Sistema integrado de gestão empresarial para o Grupo Frifuck (4 lojas) com dois módulos principais:

- **Dashboard Financeiro**: Gestão de folha de pagamento, metas e análises de desempenho
- **Aplicativo de Produtividade**: Mapa de tarefas com alertas inteligentes para RH, Compras e Financeiro

---

## 2. Modelo de Dados (Banco de Dados)

### 2.1 Tabelas Principais

#### `users`
Usuários do sistema com controle de acesso por função.
```
- id (PK)
- openId (OAuth)
- name
- email
- role: 'admin' | 'gestor' | 'rh' | 'compras' | 'financeiro'
- loja: 'joinville' | 'blumenau' | 'sao_jose' | 'florianopolis' | 'todas'
- createdAt, updatedAt, lastSignedIn
```

#### `lojas`
Configuração de cada loja.
```
- id (PK)
- nome: 'Joinville' | 'Blumenau' | 'São José' | 'Florianópolis'
- metaTotal: decimal (meta mensal em R$)
- createdAt, updatedAt
```

#### `funcionarios`
Histórico completo de funcionários (ativo e desligado).
```
- id (PK)
- lojaId (FK)
- nome
- funcao: 'mecanico' | 'vendedor' | 'consultor_vendas' | 'alinhador' | 'recepcionista' | 'auxiliar_estoque' | 'lider_estoque' | 'auxiliar_caixa' | 'administrativo'
- dataAdmissao
- dataDesligamento (NULL se ativo)
- motivoDesligamento (demissão, pedido de contas, etc.)
- deveEmpresa: decimal (débito pendente)
- status: 'ativo' | 'inativo'
- createdAt, updatedAt
```

#### `metas`
Configuração de metas por função e loja.
```
- id (PK)
- lojaId (FK)
- funcao
- ano
- mes
- faixas: JSON (array de {liquidezMinima, percentualComissao})
  Exemplo: [{liquidezMinima: 0, percentual: 10}, {liquidezMinima: 8000, percentual: 12}, ...]
- salarioFixo: decimal (NULL se não aplicável)
- dataAlteracao
- aplicacaoEm: 'imediata' | 'mes_atual' | 'proximo_mes'
- createdAt, updatedAt
```

#### `folha_pagamento`
Registro semanal de liquidez e comissões.
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- ano
- mes
- semana (1-5)
- liquidez: decimal
- percentualComissao: decimal (calculado automaticamente)
- valorComissao: decimal (liquidez * percentualComissao / 100)
- createdAt, updatedAt
```

#### `premiacao`
Premiações adicionais ao salário.
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- ano
- mes
- descricao
- valor: decimal
- createdAt, updatedAt
```

#### `vales`
Vales simples e parcelados.
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- descricao
- valorTotal: decimal
- valorParcela: decimal
- parcelas: int
- parcelaAtual: int (para vales parcelados)
- ano
- mes
- mesOrigem (para rastrear vale parcelado)
- tipo: 'simples' | 'parcelado'
- status: 'ativo' | 'cancelado'
- createdAt, updatedAt
```

#### `descontos`
Descontos diversos (aluguel, INSS, adiantamento, holerite).
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- tipo: 'aluguel' | 'inss' | 'adiantamento' | 'holerite'
- valor: decimal
- ano
- mes
- descricao (opcional)
- createdAt, updatedAt
```

#### `observacoes`
Notas e observações sobre funcionários.
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- ano
- mes
- texto
- createdAt, updatedAt
```

#### `tarefas` (Mapa de Produtividade)
Tarefas diárias com prioridades.
```
- id (PK)
- usuarioId (FK)
- titulo
- descricao
- prioridade: 'vermelho' | 'amarelo' | 'verde'
- status: 'pendente' | 'concluida' | 'cancelada'
- dataVencimento
- dataExecucao (quando foi concluída)
- horarioTick (timestamp de conclusão)
- createdAt, updatedAt
```

#### `tarefas_alertas` (Alertas Automáticos)
Alertas gerados automaticamente para RH (feedbacks, férias, rescisões).
```
- id (PK)
- usuarioRhId (FK)
- funcionarioId (FK)
- tipo: 'feedback_15d' | 'feedback_30d' | 'feedback_45d' | 'experiencia_vence' | 'ferias_3m' | 'ferias_2m' | 'ferias_1m' | 'ferias_5d' | 'ferias_1d' | 'ferias_inicio_1sem' | 'ferias_inicio_2d' | 'ferias_inicio_1d' | 'ferias_inicio_dia' | 'ferias_volta_3d' | 'ferias_volta_2d' | 'ferias_volta_1d' | 'ferias_volta_dia' | 'rescisao_6d' | 'rescisao_7d' | 'rescisao_8d' | 'rescisao_9d' | 'aviso_1sem' | 'aviso_3d' | 'aviso_2d' | 'aviso_1d' | 'aviso_dia'
- descricao
- dataAlerta
- dataVencimento
- lido: boolean
- createdAt, updatedAt
```

#### `feedbacks`
Histórico de feedbacks de experiência.
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- dataFeedback
- proximoFeedback
- etapa: 'primeira_45d' | 'segunda_45d' | 'finalizado'
- observacoes
- createdAt, updatedAt
```

#### `ferias`
Controle de férias.
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- dataInicio
- dataFim
- diasUteis: int
- status: 'agendada' | 'em_gozo' | 'concluida' | 'cancelada'
- createdAt, updatedAt
```

#### `rescisoes`
Controle de rescisões.
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- tipo: 'demissao' | 'pedido_contas'
- dataRescisao
- dataPagamento (9º dia)
- dataFimAvisoPrevio (se aplicável)
- status: 'pendente' | 'pago' | 'cancelado'
- createdAt, updatedAt
```

#### `compras`
Registro de compras por fornecedor e categoria.
```
- id (PK)
- usuarioComprasId (FK)
- lojaId (FK)
- fornecedor
- categoria: 'pneus' | 'insumos_estoque' | 'outros'
- descricao
- valor: decimal
- ano
- mes
- data
- createdAt, updatedAt
```

#### `logs_atividade`
Logs de conclusão de tarefas para o gestor.
```
- id (PK)
- usuarioId (FK)
- tarefaId (FK)
- horarioConclusao
- detalhes
- createdAt
```

#### `contas_bancarias`
Cadastro de contas bancárias para conciliação.
```
- id (PK)
- lojaId (FK) (pode ser NULL para contas pessoais)
- banco: 'itau' | 'caixa' | 'santander'
- nomeConta (identificador: ex: "Itaú - Joinville", "Pessoal")
- agencia
- conta
- tipoConta: 'corrente' | 'poupanca'
- saldo: decimal (atualizado após conciliação)
- ativa: boolean
- createdAt, updatedAt
```

#### `extratos_bancarios`
Armazenamento de extratos importados (OFX).
```
- id (PK)
- contaBancariaId (FK)
- dataImportacao
- dataInicio
- dataFim
- saldoInicial: decimal
- saldoFinal: decimal
- transacoes: JSON (array de {data, descricao, valor, tipo})
- createdAt, updatedAt
```

#### `conciliacao_bancaria`
Registro de conciliações entre extratos e lançamentos.
```
- id (PK)
- contaBancariaId (FK)
- ano
- mes
- dataInicio
- dataFim
- transacoesExtrato: int (total no extrato)
- transacoesLancadas: int (total lançado)
- transacoesConci liadas: int (batidas)
- transacoesDiscrepancia: int (não batidas)
- status: 'pendente' | 'conciliada' | 'parcial'
- usuarioId (FK) (quem fez a conciliação)
- dataConciliacao
- createdAt, updatedAt
```

#### `conciliacao_detalhes`
Detalhes de cada transação na conciliação.
```
- id (PK)
- conciliacaoId (FK)
- transacaoExtratoId
- liquidezId (FK) (pode ser NULL se não bateu)
- valor: decimal
- dataTransacao
- descricaoExtrato
- status: 'conciliada' | 'discrepancia' | 'pendente'
- motivoDiscrepancia (se houver)
- usuarioRevisao (FK) (quem revisou manualmente)
- dataRevisao
- createdAt, updatedAt
```

#### `comissao_funcionario`
Comissão personalizada por funcionário (sobrescreve a padrão).
```
- id (PK)
- funcionarioId (FK)
- lojaId (FK)
- ano
- mes
- faixas: JSON (array de {liquidezMinima, percentualComissao})
- salarioFixo: decimal (NULL se não aplicável)
- dataAlteracao
- aplicacaoEm: 'imediata' | 'mes_atual' | 'proximo_mes'
- usuarioId (FK) (quem fez a alteração)
- createdAt, updatedAt
```

---

## 3. Controle de Acesso por Função

### Permissões por Papel

| Funcionalidade | Gestor | RH | Compras | Financeiro | Admin |
|---|---|---|---|---|---|
| Dashboard Financeiro | ✅ | ❌ | ❌ | ✅ | ✅ |
| Folha de Pagamento | ✅ | ❌ | ❌ | ✅ | ✅ |
| Metas | ✅ | ❌ | ❌ | ❌ | ✅ |
| Análise de Funcionários | ✅ | ✅ | ❌ | ✅ | ✅ |
| Gestão de RH | ❌ | ✅ | ❌ | ❌ | ✅ |
| Mapa de Tarefas (RH) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Módulo de Compras | ❌ | ❌ | ✅ | ❌ | ✅ |
| Mapa de Tarefas (Compras) | ❌ | ❌ | ✅ | ❌ | ✅ |
| Mapa de Tarefas (Financeiro) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Logs de Atividade | ✅ | ❌ | ❌ | ❌ | ✅ |
| Gestão de Usuários | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 4. Fluxos Principais

### 4.1 Fluxo de Folha de Pagamento

1. **Entrada de Liquidez**: Gestor/Financeiro insere liquidez semanal por funcionário (com seletor de conta bancária)
2. **Cálculo Automático**: Sistema busca meta da função/loja/mês e aplica faixa de comissão (ou comissão personalizada se existir)
3. **Adições**: Premiações, vales, descontos
4. **Cálculo Final**: Total = (Liquidez × Comissão%) + Premiações - Vales - Descontos
5. **Boleto**: Valor final é exibido como "a pagar"

### 4.2 Fluxo de Alertas de RH

1. **Admissão**: RH cria funcionário com data de admissão
2. **Experiência**: Sistema gera alertas automáticos para feedbacks (15, 30, 45 dias)
3. **Vencimento**: Alertas para renovação ou finalização de experiência
4. **Férias**: Alertas baseados em datas de vencimento de férias
5. **Rescisão**: Alertas para pagamento (6º, 7º, 8º, 9º dia) e fim de aviso prévio

### 4.3 Fluxo de Tarefas (Mapa de Produtividade)

1. **Criação**: Cada departamento (RH, Compras, Financeiro) cria suas tarefas
2. **Priorização**: Cores (Vermelho=Urgente, Amarelo=Normal, Verde=Não-urgente)
3. **Execução**: Funcionário marca como concluída e sistema registra horário
4. **Monitoramento**: Gestor vê logs de conclusão e horários

### 4.4 Fluxo de Conciliação Bancária

1. **Cadastro de Contas**: Gestor cadastra contas bancárias (Itaú, Caixa, Santander) com nome identificador
2. **Upload de Extrato**: Importa arquivo OFX do período
3. **Leitura Automática**: Sistema extrai transações do OFX
4. **Matching**: Busca por valor nas entradas de liquidez do período
5. **Identificação de Discrepâncias**: Valores duplicados ou que não bateram
6. **Revisão Manual**: Gestor revisa e finaliza a conciliação
7. **Atualização de Saldo**: Saldo da conta é atualizado

### 4.5 Fluxo de Comissão Personalizada

1. **Alteração**: Gestor seleciona funcionário e define novas faixas de comissão
2. **Aplicação**: Define quando começa (imediata, mês atual, próximo mês)
3. **Cálculo**: Sistema aplica comissão personalizada ao invés da padrão
4. **Histórico**: Mantém registro de todas as alterações

---

## 5. Estrutura de Navegação (Frontend)

### Dashboard Principal (Tela Inicial)
- Gráfico de desempenho por loja (linha com cores por loja)
- Indicadores KPI (liquidez, meta %, gastos)
- Acesso rápido aos módulos conforme função

### Navegação Lateral (Sidebar)
- **Gestor**: Dashboard | Folha de Pagamento | Metas | Análise | Logs
- **RH**: Gestão de Funcionários | Feedbacks | Férias | Rescisões | Mapa de Tarefas
- **Compras**: Registro de Compras | Mapa de Tarefas
- **Financeiro**: Folha de Pagamento | Mapa de Tarefas
- **Admin**: Todos os módulos + Gestão de Usuários

---

## 6.1 Funcionalidades Adicionadas

### Conciliação Bancária
- Cadastro de múltiplas contas bancárias (Itaú, Caixa, Santander)
- Upload e leitura automática de extratos OFX
- Matching automático por valor
- Identificação de discrepâncias (valores duplicados, não batidos)
- Revisão manual e finalização de conciliação
- Seletor de conta no lançamento de liquidez

### Comissão Personalizada por Funcionário
- Sobrescrita de comissão padrão para funcionários específicos
- Opções de aplicação (imediata, mês atual, próximo mês)
- Histórico de alterações
- Acesso restrito: Gestor e Admin

---

## 7. Tecnologia

- **Frontend**: React 19 + Tailwind 4 + shadcn/ui
- **Backend**: Express 4 + tRPC 11
- **Banco de Dados**: MySQL (TiDB)
- **Autenticação**: Manus OAuth
- **Gráficos**: Recharts
- **Cores**: Preto (#000000) e Amarelo (#FFD700)
- **Processamento OFX**: Biblioteca para parsing de extratos bancários

---

## 8. Próximos Passos

1. ✅ Validar estrutura de banco de dados
2. ✅ Validar fluxos e permissões
3. Criar migrations SQL
4. Implementar procedures tRPC
5. Construir interface do Dashboard
6. Implementar módulos de RH, Compras, Financeiro
7. Implementar Conciliação Bancária
8. Implementar Comissão Personalizada
9. Testes e validação
