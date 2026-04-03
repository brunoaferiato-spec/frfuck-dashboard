CREATE TABLE `auditoria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lojaId` int NOT NULL,
	`funcionarioId` int NOT NULL,
	`ano` int NOT NULL,
	`mes` int NOT NULL,
	`campo` varchar(100) NOT NULL,
	`valorAnterior` text,
	`valorNovo` text,
	`usuarioId` int NOT NULL,
	`usuarioNome` varchar(255),
	`dataAlteracao` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditoria_id` PRIMARY KEY(`id`)
);
