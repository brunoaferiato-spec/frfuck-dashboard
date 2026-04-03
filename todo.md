# Frifuck Dashboard - Todo List

## Fase 1: Banco de Dados e Autenticação
- [x] Criar schema.ts com todas as tabelas (users, lojas, funcionarios, metas, folha_pagamento, premiacao, vales, descontos, observacoes, tarefas, tarefas_alertas, feedbacks, ferias, rescisoes, compras, logs_atividade)
- [x] Gerar e aplicar migrations SQL
- [x] Implementar query helpers em db.ts
- [x] Configurar autenticação OAuth e roles (gestor, rh, compras, financeiro, admin)
- [x] Criar middleware de controle de acesso por função

## Fase 2: Procedures tRPC e Lógica Backend
- [x] Implementar procedures de autenticação (login, logout, me)
- [x] Criar procedures de gestão de usuários (criar, listar, atualizar role)
- [x] Implementar procedures de folha de pagamento (inserir liquidez, calcular comissões, listar)
- [x] Criar procedures de metas (criar, atualizar, listar, aplicar alterações)
- [x] Implementar procedures de análise (comparar funcionários, gráficos)
- [x] Criar procedures de RH (admissão, demissão, feedbacks, férias, rescisões)
- [x] Implementar procedures de tarefas (criar, atualizar status, listar, registrar conclusão)
- [x] Criar procedures de alertas automáticos (gerar alertas, marcar como lido)
- [x] Implementar procedures de compras (registrar, listar por categoria/mês)
- [x] Criar procedures de logs de atividade

## Fase 3: Interface - Layout e Navegação
- [x] Configurar tema preto e amarelo em index.css
- [ ] Criar DashboardLayout customizado com sidebar
- [ ] Implementar navegação lateral com menu dinâmico por role
- [ ] Criar página de login
- [ ] Implementar header com perfil e logout
- [ ] Criar página 404 e tratamento de erros

## Fase 4: Dashboard Principal (Tela Inicial)
- [x] Criar gráfico de linha com desempenho por loja (Recharts)
- [x] Implementar indicadores KPI (liquidez total, meta %, gastos)
- [x] Adicionar seletor de período (ano/mês)
- [x] Criar cards de acesso rápido aos módulos
- [x] Implementar responsividade

## Fase 5: Módulo de Folha de Pagamento
- [x] Criar página de seleção (cidade, ano, mês)
- [x] Implementar tabela de folha de pagamento com todos os funcionários
- [x] Adicionar campos editáveis para semanas 1-4
- [x] Implementar cálculo automático de total liquidez
- [x] Implementar cálculo automático de total comissão
- [x] Criar modal para Premiação (adicionar/excluir)
- [x] Criar modal para Vales (simples/parcelado)
- [x] Adicionar campos para Aluguel, INSS, Adiantamento, Holerite
- [x] Criar modal para Observações (adicionar/excluir)
- [x] Implementar cálculo automático de Boleto
- [ ] Formatar semanas em dinheiro (R$ 1.000,00)
- [ ] Implementar % semanal automático baseado na meta (sem preenchimento manual)
- [ ] Mostrar colunas semanais apenas para Vendedor, Mecânico, Consultor
- [ ] Colocar outras funções em quadrante diferente embaixo
- [ ] Formatar valor na caixa igual Premiação/Vale após preenchido
- [ ] Criar modal ao clicar % (mostrar meta da função + valor ganho)
- [ ] Dados não persistem entre meses (cada mês começa vazio)
- [ ] Vale parcelado: campo total + quantidade de parcelas (cálculo automático)
- [ ] Vale parcelado: propagar para meses subsequentes
- [ ] Vale parcelado: excluir apenas no mês de origem
- [ ] Integrar com banco de dados
- [ ] Criar exportação de folha (PDF/Excel)

## Fase 6: Módulo de Metas
- [ ] Criar página de configuração de metas por loja/função
- [ ] Implementar tabela de faixas de comissão
- [ ] Adicionar funcionalidade de adicionar/remover faixas
- [ ] Implementar opção de salário fixo + percentual
- [ ] Criar seletor de aplicação (imediata, mês atual, próximo mês)
- [ ] Implementar histórico de alterações
- [ ] Adicionar validação de faixas crescentes

## Fase 7: Módulo de Gestão (Dashboard)
- [ ] Criar página de visão geral por loja/grupo
- [ ] Implementar cards de KPI (liquidez, gastos folha, gastos boleto, % meta)
- [ ] Adicionar gráfico de comparação de até 3 funcionários
- [ ] Implementar seletor de períodos e funcionários
- [ ] Criar filtros por loja

## Fase 8: Módulo de Análise de Funcionário
- [ ] Criar página de análise individual
- [ ] Implementar seletor (cidade, ano, mês, funcionário)
- [ ] Exibir liquidez semanal com % e valor de comissão
- [ ] Mostrar premiações, vales, descontos, observações
- [ ] Implementar checkbox para somar vales de todos os meses (demissão)
- [ ] Criar resumo final (boleto a pagar)

## Fase 9: Módulo de RH
- [ ] Criar página de gestão de funcionários
- [ ] Implementar tabela com filtro por loja/status
- [ ] Adicionar funcionalidade de admissão (criar funcionário)
- [ ] Implementar funcionalidade de demissão (marcar como inativo)
- [ ] Criar histórico permanente com datas e débitos
- [ ] Implementar página de feedbacks com alertas automáticos
- [ ] Criar página de gestão de férias
- [ ] Implementar página de rescisões com alertas
- [ ] Adicionar sistema de alertas automáticos (avisos por email/notificação)

## Fase 10: Módulo de Tarefas (Mapa de Produtividade)
- [ ] Criar página de tarefas para RH
- [ ] Implementar página de tarefas para Compras
- [ ] Criar página de tarefas para Financeiro
- [ ] Adicionar sistema de prioridades (vermelho, amarelo, verde)
- [ ] Implementar criação de tarefas (título, descrição, prioridade, vencimento)
- [ ] Adicionar funcionalidade de marcar como concluída com timestamp
- [ ] Implementar listagem com filtros (status, prioridade, vencimento)
- [ ] Criar página de logs de atividade para gestor (horários de conclusão)

## Fase 11: Módulo de Compras
- [ ] Criar página de registro de compras
- [ ] Implementar tabela com colunas (fornecedor, categoria, valor, data)
- [ ] Adicionar seletor de categoria (pneus, insumos estoque, outros)
- [ ] Implementar filtros por período e fornecedor
- [ ] Criar relatório mensal de gastos por categoria
- [ ] Adicionar funcionalidade de editar/deletar compras

## Fase 12: Sistema de Alertas Automáticos
- [ ] Implementar geração automática de alertas de feedback (15, 30, 45 dias)
- [ ] Criar alertas de vencimento de experiência
- [ ] Implementar alertas de férias (3m, 2m, 1m, 5d, 1d antes)
- [ ] Adicionar alertas de ida e volta de férias
- [ ] Implementar alertas de rescisão (6º, 7º, 8º, 9º dia)
- [ ] Criar alertas de aviso prévio (1sem, 3d, 2d, 1d antes e no dia)
- [ ] Implementar notificações (email/toast no app)

## Fase 13: Gestão de Usuários (Admin)
- [ ] Criar página de gestão de usuários
- [ ] Implementar tabela com filtro por role/loja
- [ ] Adicionar funcionalidade de criar usuário
- [ ] Implementar funcionalidade de atualizar role
- [ ] Criar funcionalidade de desativar/ativar usuário
- [ ] Adicionar logs de criação/alteração

## Fase 14: Testes e Validação
- [x] Escrever testes unitários para procedures tRPC
- [x] Testar cálculo de comissões com diferentes faixas
- [x] Validar propagação de vales parcelados
- [x] Testar controle de acesso por função
- [ ] Validar alertas automáticos
- [ ] Testar responsividade em diferentes dispositivos
- [ ] Validar performance com grandes volumes de dados

## Fase 15: Entrega Final
- [ ] Criar checkpoint final
- [ ] Documentar guia de uso
- [ ] Preparar dados de exemplo
- [ ] Validar com usuário final

## Fase 16: Conciliação Bancária
- [ ] Criar tabelas: contas_bancarias, extratos_bancarios, conciliacao_bancaria, conciliacao_detalhes
- [ ] Implementar procedures de cadastro de contas bancárias
- [ ] Criar funcionalidade de upload e parsing de OFX
- [ ] Implementar matching automático por valor
- [ ] Criar interface de revisão manual de discrepâncias
- [ ] Implementar finalização de conciliação
- [ ] Adicionar seletor de conta no lançamento de liquidez
- [ ] Criar relatório de conciliação por período
- [ ] Implementar histórico de conciliações

## Fase 17: Comissão Personalizada por Funcionário
- [ ] Criar tabela comissao_funcionario
- [ ] Implementar procedures de criação/atualização de comissão personalizada
- [ ] Adicionar lógica de busca (comissão personalizada > comissão padrão)
- [ ] Implementar opções de aplicação (imediata, mês atual, próximo mês)
- [ ] Criar interface de gestão de comissões personalizadas
- [ ] Implementar histórico de alterações
- [ ] Adicionar validação de faixas crescentes
- [ ] Criar relatório de funcionários com comissão personalizada
- [ ] Implementar recalculação de comissões ao alterar


## Fase 18: Refinamento do Dashboard Principal (Prioridade Alta)
- [ ] Integrar logo FR FUCK na página
- [ ] Redesenhar KPIs em quadrados menores lado a lado (Liquidez, Gasto Folha, Meta Atingida)
- [ ] Adicionar seletor de Cidade junto com Ano e Mês
- [ ] Ajustar anos para começar de 2026
- [ ] Criar dashboard mais moderno e impactante para apresentação
- [ ] Atualizar role do usuário para admin com acesso total (RH, Compras, Financeiro)


## Fase 19: Refinamentos Finais da Folha de Pagamento
- [ ] Integrar % automática com metas da Gestão de Metas
- [ ] Ordenar funcionários por função (Administrativo, Supervisor, Vendedor, Mecânico, Consultor, Recepcionista, Caixa Líder, Caixa, Estoquista Líder, Estoquista, Auxiliar de Limpeza)
- [ ] Criar modal ao clicar na % mostrando: nome, semana, liquidez, %, valor ganho e meta da função


## Fase 20: Ajustes Finais da Folha de Pagamento
- [x] Adicionar Alinhador à lista de funções
- [x] Implementar Alinhador com opção fixo + comissão ou só comissão
- [x] Implementar Recepcionista com campos de quantidade de carros e valor por carro
- [x] Recepcionista: sem colunas de semanas, sem Total Liquidez, sem Total Comissão
- [x] Recepcionista: Boleto = Fixo + (Quantidade × Valor por Carro) + Premiação - Vales - Aluguel
- [x] Funções fixas (Administrativo, Caixa Líder, Caixa, Estoquista Líder, Estoquista, Auxiliar de Limpeza): sem colunas de semanas
- [x] Funções fixas: Boleto = Fixo + Premiação - Vales - Aluguel (sem INSS, Adiantamento, Holerite)

## Fase 21: Refatoração da Folha de Pagamento em 3 Seções
- [x] Criar Seção 1: Comissão Semanal (Mecânico, Vendedor, Consultor, Alinhador, Aux. Alinhador) com colunas intercaladas Sem/% e apenas Sem 1 para Alinhador/Aux
- [x] Criar Seção 2: Recepcionista com colunas de Carros e Valor por Carro
- [x] Criar Seção 3: Funções Fixas (Administrativo, Supervisor, Caixa Líder, Caixa, Estoquista Líder, Estoquista, Auxiliar de Limpeza)
- [x] Remover colunas de Carros e Valor por Carro da Seção 1
- [x] Testar cálculos de Boleto para cada seção
- [x] Validar estrutura visual das 3 seções


## Fase 22: Ajustes Finais da Folha de Pagamento
- [x] Corrigir modal de % para mostrar a meta da função
- [x] Adicionar colunas INSS, Adiantamento, Holerite para Recepcionista
- [x] Adicionar colunas INSS, Adiantamento, Holerite para Funções Fixas
- [x] Implementar comissão mensal para Florianópolis e São José (1 coluna liquidez + 1 coluna %)
- [x] Manter comissão semanal para Joinville e Blumenau (4 semanas)


## Fase 23: Salvamento Automático e Exportação Excel
- [x] Criar tabelas no banco de dados para armazenar dados da Folha de Pagamento
- [x] Implementar tRPC procedures para salvar dados automaticamente
- [ ] Adicionar auto-save ao clicar fora dos campos (debounce)
- [ ] Adicionar indicador visual de "Salvando..." e "Salvo"
- [x] Implementar exportação para Excel com formatação profissional
- [ ] Adicionar botão "Exportar Excel" na Folha de Pagamento
- [ ] Testar salvamento automático com múltiplas alterações
- [ ] Testar exportação Excel com dados reais

## Fase 24: Módulo de Metas
- [ ] Criar interface para configurar metas por função e cidade
- [ ] Implementar tRPC procedures para CRUD de metas
- [ ] Conectar metas com cálculo de comissão na Folha de Pagamento
- [ ] Adicionar validações e tratamento de erros


## Fase 24: Módulo de Gestão de Metas
- [x] Criar página GestaoMetas.tsx com interface de faixas escalonadas
- [x] Implementar campos para cada função (Mecânico, Vendedor, Consultor, Alinhador, Recepcionista, Fixos)
- [x] Adicionar faixas: 10% (base), 12% (8k), 15% (10k), 17% (20k)
- [x] Implementar seleção "Aplicar para todos" ou "Selecionar funcionário"
- [x] Refatorar Dialog para mostrar todas as 4 faixas de uma vez
- [x] Adicionar botão "Voltar" para retornar ao Dashboard
- [ ] Criar tRPC procedures para salvar/atualizar metas
- [ ] Testar aplicação de metas para todos e para funcionário específ ico
- [ ] Validar integração com cálculos da Folha de Pagamento


## Fase 25: Sistema de Auditoria - Última Alteração
- [x] Criar tabela de auditoria no banco de dados
- [x] Implementar tRPC procedures para registrar alterações
- [x] Adicionar indicador de última alteração na Folha de Pagamento
- [x] Mostrar quem fez a alteração, data e hora
- [ ] Testar auditoria com múltiplos usuários


## Fase 26: Gestão de Funcionários - Sistema de Avisos
- [x] Implementar cards de avisos no topo da página
- [x] Criar lógica de cálculo de datas para Experiência (1 sem, 3 dias, 2 dias, 1 dia, no dia)
- [x] Criar lógica de cálculo de datas para Feedback (a cada 15 dias: 5 dias antes, 1 dia antes, no dia)
- [x] Criar lógica de cálculo de datas para Férias 1ª (mês, 1 sem, no dia)
- [ ] Criar lógica de cálculo de datas para Férias 2ª (3m, 2m5d, 2m1d, 35 dias)
- [x] Criar lógica de cálculo de datas para Saída de Férias (1 sem, 2 dias, 1 dia, no dia)
- [ ] Adicionar função de inativar funcionário
- [ ] Implementar campo "Saiu Devendo?" ao inativar
- [ ] Implementar campo de valor de dívida (obrigatório se devendo)
- [ ] Criar filtro de funcionários antigos/inativos
- [x] Testar avisos com datas variadas
- [ ] Testar inativação com e sem dívida
