# GUIA COMPLETO DE DEPLOY - RAILWAY

## 📋 Pré-requisitos

1. Conta na Railway (https://railway.app)
2. Domínio frfuck.xyz configurado
3. GitHub com o repositório do projeto
4. CLI da Railway instalada (opcional, mas recomendado)

---

## 🚀 PASSO 1: Preparar o Repositório GitHub

### 1.1 Inicializar Git (se não estiver)
```bash
cd /home/ubuntu
git init
git add .
git commit -m "Initial commit - Sistema de folha de pagamento com persistência total"
```

### 1.2 Criar repositório no GitHub
```bash
# Criar repositório privado no GitHub chamado "frifuck-dashboard"
# Depois:
git remote add origin https://github.com/seu-usuario/frifuck-dashboard.git
git branch -M main
git push -u origin main
```

---

## 🏗️ PASSO 2: Criar Projeto na Railway

### 2.1 Acessar Railway
1. Acesse https://railway.app
2. Faça login com sua conta
3. Clique em "New Project"

### 2.2 Conectar GitHub
1. Selecione "Deploy from GitHub"
2. Autorize Railway a acessar seu GitHub
3. Selecione o repositório "frifuck-dashboard"
4. Clique em "Deploy"

---

## 🗄️ PASSO 3: Adicionar Banco de Dados MySQL

### 3.1 Adicionar MySQL ao Projeto
1. No dashboard do Railway, clique em "+ Add"
2. Selecione "MySQL"
3. Aguarde a criação (leva alguns minutos)

### 3.2 Configurar MySQL
1. Clique no serviço MySQL criado
2. Vá para a aba "Variables"
3. Copie a variável `DATABASE_URL` (será algo como: `mysql://root:...@containers-us-west-...`)

---

## ⚙️ PASSO 4: Configurar Variáveis de Ambiente

### 4.1 Adicionar Variáveis na Railway
1. No dashboard, clique no serviço da aplicação
2. Vá para a aba "Variables"
3. Adicione as seguintes variáveis:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=<copie da aba MySQL>
JWT_SECRET=<gere uma string aleatória segura>
VITE_APP_ID=frifuck-app
OAUTH_SERVER_URL=https://frfuck.xyz
OWNER_OPEN_ID=owner-123
LOG_LEVEL=info
```

### 4.2 Gerar JWT_SECRET Seguro
```bash
# No seu terminal local:
openssl rand -base64 32
# Copie o resultado e cole em JWT_SECRET
```

---

## 🌐 PASSO 5: Conectar Domínio frfuck.xyz

### 5.1 Configurar Domínio na Railway
1. No dashboard do Railway, clique no serviço da aplicação
2. Vá para a aba "Settings"
3. Procure por "Domains"
4. Clique em "Add Domain"
5. Digite: `frfuck.xyz`
6. Railway gerará um CNAME

### 5.2 Configurar DNS no Registrador do Domínio
1. Acesse o painel de controle do seu registrador (GoDaddy, Namecheap, etc.)
2. Vá para "DNS Records" ou "Gerenciar DNS"
3. Adicione um registro CNAME:
   - **Name/Host:** `@` (ou deixe em branco)
   - **Type:** CNAME
   - **Value:** <copie do Railway>
   - **TTL:** 3600

4. Se o registrador não permitir CNAME para raiz (@), use A record:
   - Copie o IP fornecido pela Railway
   - Crie um A record com esse IP

### 5.3 Aguardar Propagação DNS
- Pode levar de 5 minutos a 24 horas
- Verifique com: `nslookup frfuck.xyz` ou `dig frfuck.xyz`

---

## 🔄 PASSO 6: Executar Migrações do Banco

### 6.1 Conectar ao Banco de Produção
```bash
# Copie a DATABASE_URL do Railway
export DATABASE_URL="mysql://root:senha@host:porta/database"

# Execute as migrações
pnpm db:push
```

### 6.2 Verificar Migrações
```bash
# Conecte ao MySQL remoto para verificar
mysql -h <host> -u root -p -D frifuck_db -e "SHOW TABLES;"
```

---

## ✅ PASSO 7: Validar Deploy

### 7.1 Verificar Aplicação Online
```bash
# Teste a URL
curl https://frfuck.xyz
curl https://frfuck.xyz/health
```

### 7.2 Verificar Logs da Railway
1. No dashboard do Railway
2. Clique no serviço da aplicação
3. Vá para "Logs"
4. Procure por erros ou avisos

### 7.3 Teste de Funcionalidade
1. Acesse https://frfuck.xyz no navegador
2. Crie um funcionário
3. Atualize a página (F5)
4. Verifique se o funcionário continua lá
5. Abra em outra aba/navegador
6. Verifique se os dados são os mesmos

---

## 🔧 TROUBLESHOOTING

### Aplicação não inicia
```
Verificar:
1. Logs da Railway (aba Logs)
2. DATABASE_URL está correto?
3. Banco de dados está online?
4. Migrações foram executadas?
```

### Banco de dados não conecta
```
Verificar:
1. DATABASE_URL está no formato correto?
2. Usuário e senha estão corretos?
3. Host e porta estão corretos?
4. Firewall permite conexão?
```

### Domínio não funciona
```
Verificar:
1. DNS foi propagado? (nslookup frfuck.xyz)
2. CNAME/A record está correto?
3. Domínio está apontando para Railway?
4. Certificado SSL está válido?
```

### Dados não persistem
```
Verificar:
1. DATABASE_URL está correto?
2. Migrações foram executadas?
3. Tabelas existem no banco?
4. Aplicação consegue conectar ao banco?
```

---

## 📊 MONITORAMENTO

### Verificar Saúde da Aplicação
```bash
# Health check
curl https://frfuck.xyz/health

# Deve retornar: 200 OK
```

### Verificar Banco de Dados
```bash
# Conectar ao banco remoto
mysql -h <host> -u root -p -D frifuck_db

# Listar tabelas
SHOW TABLES;

# Contar funcionários
SELECT COUNT(*) FROM funcionarios;
```

---

## 🔐 SEGURANÇA EM PRODUÇÃO

### Checklist de Segurança
- ✅ JWT_SECRET é uma string aleatória forte
- ✅ DATABASE_URL não está exposta no código
- ✅ .env.local não está no Git
- ✅ Repositório é privado
- ✅ HTTPS está ativado (Railway faz automaticamente)
- ✅ Firewall do banco permite apenas Railway

---

## 📝 VARIÁVEIS DE AMBIENTE FINAIS

```
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://root:senha@host:porta/frifuck_db
JWT_SECRET=<string aleatória de 32 caracteres>
VITE_APP_ID=frifuck-app
OAUTH_SERVER_URL=https://frfuck.xyz
OWNER_OPEN_ID=owner-123
LOG_LEVEL=info
```

---

## 🎯 PRÓXIMOS PASSOS

1. ✅ Repositório no GitHub
2. ✅ Projeto criado na Railway
3. ✅ MySQL adicionado
4. ✅ Variáveis de ambiente configuradas
5. ✅ Domínio conectado
6. ✅ Migrações executadas
7. ✅ Aplicação online em https://frfuck.xyz
8. ✅ Dados persistindo em produção

---

## 📞 SUPORTE

Se algo não funcionar:
1. Verifique os logs da Railway
2. Verifique a conexão com o banco
3. Verifique as variáveis de ambiente
4. Verifique o DNS
5. Reinicie o serviço na Railway

---

**Deploy realizado com sucesso! 🚀**
