ALTER TABLE `funcionarios` MODIFY COLUMN `funcao` enum('mecanico','vendedor','consultor_vendas','alinhador','aux_alinhador','recepcionista','auxiliar_estoque','lider_estoque','auxiliar_caixa','administrativo','gerente','supervisor') NOT NULL;--> statement-breakpoint
ALTER TABLE `funcionarios` MODIFY COLUMN `status` enum('ativo','inativo','experiencia') NOT NULL DEFAULT 'ativo';--> statement-breakpoint
ALTER TABLE `funcionarios` ADD `cpf` varchar(20);--> statement-breakpoint
ALTER TABLE `funcionarios` ADD `pix` varchar(200);--> statement-breakpoint
ALTER TABLE `funcionarios` ADD `dataNascimento` timestamp;--> statement-breakpoint
ALTER TABLE `funcionarios` ADD `tipoMeta` enum('meta1','meta2');