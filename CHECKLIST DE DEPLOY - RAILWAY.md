# CHECKLIST DE DEPLOY - RAILWAY

## ✅ PRÉ-DEPLOY

### Código
- [ ] Todos os mocks foram removidos
- [ ] tRPC está sendo usado em todas as telas
- [ ] Persistência está implementada
- [ ] Build local passa sem erros: `pnpm build`
- [ ] TypeScript sem erros: `pnpm check`
- [ ] Código foi commitado no Git

### Arquivos de Configuração
- [ ] Dockerfile existe e está correto
- [ ] railway.json existe
- [ ] .env.production existe
- [ ] .gitignore está atualizado

### Banco de Dados Local
- [ ] MySQL está rodando localmente
- [ ] Migrações foram executadas: `pnpm db:push`
- [ ] Tabelas existem no banco local
- [ ] Dados de teste foram criados

### Repositório GitHub
- [ ] Repositório foi criado no GitHub
- [ ] Código foi feito push para main
- [ ] Repositório é privado
- [ ] .env.local NÃO está no repositório

---

## 🚀 DEPLOY NA RAILWAY

### Criar Projeto
- [ ] Conta Railway criada (https://railway.app)
- [ ] Novo projeto criado
- [ ] GitHub conectado
- [ ] Repositório selecionado
- [ ] Deploy iniciado

### Adicionar Banco de Dados
- [ ] MySQL foi adicionado ao projeto
- [ ] MySQL está online (status: Running)
- [ ] DATABASE_URL foi copiada

### Configurar Variáveis de Ambiente
- [ ] NODE_ENV = production
- [ ] PORT = 3000
- [ ] DATABASE_URL = <do MySQL>
- [ ] JWT_SECRET = <string aleatória>
- [ ] VITE_APP_ID = frifuck-app
- [ ] OAUTH_SERVER_URL = https://frfuck.xyz
- [ ] OWNER_OPEN_ID = owner-123
- [ ] LOG_LEVEL = info

### Conectar Domínio
- [ ] Domínio frfuck.xyz foi adicionado na Railway
- [ ] CNAME/A record foi criado no registrador
- [ ] DNS foi propagado (verificar com `nslookup`)
- [ ] HTTPS está ativado (Railway faz automaticamente)

### Executar Migrações
- [ ] Banco de produção está online
- [ ] Migrações foram executadas no banco de produção
- [ ] Tabelas existem no banco de produção

---

## ✅ PÓS-DEPLOY

### Verificar Aplicação
- [ ] Aplicação está online em https://frfuck.xyz
- [ ] Página carrega sem erros
- [ ] Logs não mostram erros críticos
- [ ] Health check passa: `curl https://frfuck.xyz/health`

### Testar Funcionalidade
- [ ] Consegue acessar a aplicação
- [ ] Consegue criar um funcionário
- [ ] Funcionário aparece na lista
- [ ] Atualizar página (F5) - dados persistem
- [ ] Abrir em outra aba - dados são os mesmos
- [ ] Banco de dados está recebendo dados

### Validar Banco de Dados
- [ ] Conectar ao banco remoto
- [ ] Tabelas existem
- [ ] Dados foram inseridos
- [ ] Dados podem ser recuperados

### Monitoramento
- [ ] Logs da Railway não mostram erros
- [ ] CPU está normal
- [ ] Memória está normal
- [ ] Conexões com banco estão ativas

---

## 🔐 SEGURANÇA

### Antes do Deploy
- [ ] JWT_SECRET é uma string aleatória forte (32+ caracteres)
- [ ] DATABASE_URL não está no código
- [ ] .env.local não está no Git
- [ ] Repositório é privado
- [ ] Nenhuma credencial está exposta

### Após o Deploy
- [ ] HTTPS está ativado
- [ ] Certificado SSL é válido
- [ ] Banco de dados está protegido
- [ ] Apenas Railway consegue acessar o banco
- [ ] Logs não mostram dados sensíveis

---

## 📊 VALIDAÇÃO FINAL

### Teste de Persistência
```bash
# 1. Criar funcionário
# 2. Atualizar página (F5)
# 3. Funcionário deve continuar lá
```

### Teste de Segunda Sessão
```bash
# 1. Abrir em outra aba/navegador
# 2. Dados devem ser os mesmos
# 3. Confirma que está usando banco compartilhado
```

### Teste de Banco de Dados
```bash
# Conectar ao banco remoto
mysql -h <host> -u <user> -p -D frifuck_db

# Listar tabelas
SHOW TABLES;

# Contar registros
SELECT COUNT(*) FROM funcionarios;
```

---

## 🎯 PRÓXIMOS PASSOS APÓS DEPLOY

1. [ ] Monitorar logs por 24 horas
2. [ ] Testar com dados reais
3. [ ] Criar backups do banco
4. [ ] Configurar alertas de erro
5. [ ] Documentar processo de deploy
6. [ ] Treinar equipe sobre deploy

---

## 📝 NOTAS IMPORTANTES

### Se Algo Não Funcionar
1. Verifique os logs da Railway
2. Verifique a conexão com o banco
3. Verifique as variáveis de ambiente
4. Verifique o DNS
5. Reinicie o serviço

### Comandos Úteis
```bash
# Verificar DNS
nslookup frfuck.xyz
dig frfuck.xyz

# Testar conexão
curl https://frfuck.xyz
curl -I https://frfuck.xyz

# Conectar ao banco remoto
mysql -h <host> -u <user> -p -D frifuck_db
```

### Variáveis de Ambiente Necessárias
```
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://user:pass@host:port/database
JWT_SECRET=<random-string-32-chars>
VITE_APP_ID=frifuck-app
OAUTH_SERVER_URL=https://frfuck.xyz
OWNER_OPEN_ID=owner-123
LOG_LEVEL=info
```

---

## ✅ DEPLOY COMPLETO

Quando todos os itens estiverem marcados, o deploy está completo e a aplicação está pronta para produção!

**Data do Deploy:** _______________
**Versão:** _______________
**Status:** _______________
