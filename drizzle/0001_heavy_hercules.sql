CREATE TABLE `comissao_funcionario` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`faixas` json NOT NULL,
	`salarioFixo` decimal(12,2),
	`dataAlteracao` timestamp DEFAULT (now()),
	`aplicacaoEm` enum('imediata','mes_atual','proximo_mes') DEFAULT 'proximo_mes',
	`usuarioId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comissao_funcionario_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `compras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`usuarioComprasId` int NOT NULL,
	`lojaId` int NOT NULL,
	`fornecedor` varchar(150) NOT NULL,
	`categoria` enum('pneus','insumos_estoque','outros') NOT NULL,
	`descricao` varchar(200),
	`valor` decimal(12,2) NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`data` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `compras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conciliacao_bancaria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contaBancariaId` int NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`dataInicio` timestamp NOT NULL,
	`dataFim` timestamp NOT NULL,
	`transacoesExtrato` int,
	`transacoesLancadas` int,
	`transacoesConciliadas` int,
	`transacoesDiscrepancia` int,
	`status` enum('pendente','conciliada','parcial') DEFAULT 'pendente',
	`usuarioId` int,
	`dataConciliacao` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conciliacao_bancaria_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conciliacao_detalhes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conciliacaoId` int NOT NULL,
	`transacaoExtratoId` int,
	`liquidezId` int,
	`valor` decimal(12,2) NOT NULL,
	`dataTransacao` timestamp,
	`descricaoExtrato` varchar(200),
	`status` enum('conciliada','discrepancia','pendente') DEFAULT 'pendente',
	`motivoDiscrepancia` text,
	`usuarioRevisao` int,
	`dataRevisao` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conciliacao_detalhes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contas_bancarias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lojaId` int,
	`banco` enum('itau','caixa','santander') NOT NULL,
	`nomeConta` varchar(100) NOT NULL,
	`agencia` varchar(10) NOT NULL,
	`conta` varchar(20) NOT NULL,
	`tipoConta` enum('corrente','poupanca') NOT NULL,
	`saldo` decimal(12,2) DEFAULT '0',
	`ativa` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_bancarias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `descontos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`tipo` enum('aluguel','inss','adiantamento','holerite') NOT NULL,
	`valor` decimal(12,2) NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`descricao` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `descontos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extratos_bancarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contaBancariaId` int NOT NULL,
	`dataImportacao` timestamp DEFAULT (now()),
	`dataInicio` timestamp NOT NULL,
	`dataFim` timestamp NOT NULL,
	`saldoInicial` decimal(12,2),
	`saldoFinal` decimal(12,2),
	`transacoes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extratos_bancarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feedbacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`dataFeedback` timestamp NOT NULL,
	`proximoFeedback` timestamp,
	`etapa` enum('primeira_45d','segunda_45d','finalizado') NOT NULL,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feedbacks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ferias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`dataInicio` timestamp NOT NULL,
	`dataFim` timestamp NOT NULL,
	`diasUteis` int,
	`status` enum('agendada','em_gozo','concluida','cancelada') DEFAULT 'agendada',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ferias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folha_pagamento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`contaBancariaId` int,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`semana` int NOT NULL,
	`liquidez` decimal(12,2) NOT NULL,
	`percentualComissao` decimal(5,2) NOT NULL,
	`valorComissao` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `folha_pagamento_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `funcionarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lojaId` int NOT NULL,
	`nome` varchar(150) NOT NULL,
	`funcao` enum('mecanico','vendedor','consultor_vendas','alinhador','recepcionista','auxiliar_estoque','lider_estoque','auxiliar_caixa','administrativo') NOT NULL,
	`dataAdmissao` timestamp NOT NULL,
	`dataDesligamento` timestamp,
	`motivoDesligamento` varchar(100),
	`deveEmpresa` decimal(12,2) DEFAULT '0',
	`status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `funcionarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `logs_atividade` (
	`id` int AUTO_INCREMENT NOT NULL,
	`usuarioId` int NOT NULL,
	`tarefaId` int,
	`horarioConclusao` timestamp NOT NULL,
	`detalhes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `logs_atividade_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lojas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`metaTotal` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lojas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lojaId` int NOT NULL,
	`funcao` varchar(50) NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`faixas` json NOT NULL,
	`salarioFixo` decimal(12,2),
	`dataAlteracao` timestamp DEFAULT (now()),
	`aplicacaoEm` enum('imediata','mes_atual','proximo_mes') DEFAULT 'proximo_mes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `observacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`texto` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `observacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `premiacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`descricao` varchar(200) NOT NULL,
	`valor` decimal(12,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `premiacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rescisoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`tipo` enum('demissao','pedido_contas') NOT NULL,
	`dataRescisao` timestamp NOT NULL,
	`dataPagamento` timestamp,
	`dataFimAvisoPrevio` timestamp,
	`status` enum('pendente','pago','cancelado') DEFAULT 'pendente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rescisoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tarefas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`usuarioId` int NOT NULL,
	`titulo` varchar(200) NOT NULL,
	`descricao` text,
	`prioridade` enum('vermelho','amarelo','verde') NOT NULL,
	`status` enum('pendente','concluida','cancelada') DEFAULT 'pendente',
	`dataVencimento` timestamp,
	`dataExecucao` timestamp,
	`horarioTick` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tarefas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tarefas_alertas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`usuarioRhId` int NOT NULL,
	`funcionarioId` int NOT NULL,
	`tipo` varchar(50) NOT NULL,
	`descricao` text,
	`dataAlerta` timestamp NOT NULL,
	`dataVencimento` timestamp,
	`lido` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tarefas_alertas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funcionarioId` int NOT NULL,
	`lojaId` int NOT NULL,
	`descricao` varchar(200) NOT NULL,
	`valorTotal` decimal(12,2) NOT NULL,
	`valorParcela` decimal(12,2) NOT NULL,
	`parcelas` int NOT NULL,
	`parcelaAtual` int DEFAULT 1,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`mesOrigem` int NOT NULL,
	`tipo` enum('simples','parcelado') NOT NULL,
	`status` enum('ativo','cancelado') DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','gestor','rh','compras','financeiro') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `lojaId` int;