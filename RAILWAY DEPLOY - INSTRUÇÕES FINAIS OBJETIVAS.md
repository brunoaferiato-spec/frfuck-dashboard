# RAILWAY DEPLOY - INSTRUÇÕES FINAIS OBJETIVAS

## 1. O QUE FALTA PARA PUBLICAR

- [ ] Código no GitHub (repositório privado)
- [ ] Projeto criado na Railway
- [ ] MySQL adicionado à Railway
- [ ] Variáveis de ambiente configuradas
- [ ] Domínio frfuck.xyz apontando para Railway
- [ ] Migrações executadas em produção

---

## 2. VARIÁVEIS DE AMBIENTE FINAIS

**Configurar na Railway (serviço da aplicação):**

```
NODE_ENV=production
PORT=3000
DATABASE_URL=<COPIAR DO SERVIÇO MYSQL DA RAILWAY>
JWT_SECRET=<gerar com: openssl rand -base64 32>
VITE_APP_ID=frifuck-app
OAUTH_SERVER_URL=https://frfuck.xyz
OWNER_OPEN_ID=owner-123
LOG_LEVEL=info
```

**Como obter DATABASE_URL do MySQL:**
1. No dashboard Railway, clique no serviço MySQL
2. Vá para aba "Variables"
3. Copie a variável `DATABASE_URL` (formato: `mysql://root:...@containers-us-west-...`)
4. Cole no serviço da aplicação

---

## 3. COMANDO DE BUILD

```bash
pnpm build
```

**O que faz:**
- Build do frontend com Vite: `dist/public/`
- Bundle do backend com esbuild: `dist/index.js`

**Dockerfile necessário?** SIM - Railway precisa dele para saber como buildar e rodar.

---

## 4. COMANDO DE START EM PRODUÇÃO

```bash
NODE_ENV=production node dist/index.js
```

**Railway executará automaticamente** se o `Dockerfile` estiver correto.

---

## 5. COMO CONECTAR BANCO MYSQL AO APP

### Na Railway:
1. Crie um projeto
2. Adicione MySQL (clique "+ Add" → "MySQL")
3. Espere ficar "Running"
4. Copie a variável `DATABASE_URL` do MySQL

### No serviço da aplicação:
1. Vá para "Variables"
2. Cole `DATABASE_URL=<valor copiado>`
3. Salve

**Rede privada:** Railway conecta automaticamente via rede interna. Não precisa configurar.

---

## 6. COMANDO PARA MIGRAÇÃO EM PRODUÇÃO

```bash
DATABASE_URL="<copie do Railway>" pnpm db:push
```

**Executar ANTES do primeiro deploy:**
1. Copie a DATABASE_URL do MySQL na Railway
2. No seu terminal local, execute o comando acima
3. Aguarde "✓ Migrations applied"

---

## 7. COMO VALIDAR APÓS DEPLOY

### Teste 1: App online
```bash
curl https://frfuck.xyz
# Deve retornar HTML da aplicação
```

### Teste 2: Criar funcionário
- Acesse https://frfuck.xyz
- Vá para "Gestão de Funcionários"
- Crie um funcionário
- Deve aparecer na lista

### Teste 3: Persistência (F5)
- Pressione F5
- Funcionário deve continuar lá

### Teste 4: Verificar banco
```bash
# Conectar ao MySQL da Railway
mysql -h <host> -u root -p -D frifuck_db
SELECT COUNT(*) FROM funcionarios;
# Deve retornar 1 ou mais
```

---

## 8. RISCO DO FRONTEND NÃO CONVERSAR COM BACKEND?

**NÃO HÁ RISCO.**

**Por quê:**
- Frontend usa URL relativa: `url: "/api/trpc"`
- Backend e frontend são servidos pelo mesmo processo Express
- Ambos rodam em `https://frfuck.xyz`
- Não há base URL separada ou variável de ambiente

**Confirmado em:**
- `client/src/main.tsx` - tRPC client usa `/api/trpc`
- `server/_core/index.ts` - Express serve frontend em `/` e tRPC em `/api/trpc`
- `server/_core/vite.ts` - Em produção, `dist/public` é servido como estático

---

## 9. DOCKERFILE NECESSÁRIO?

**SIM, é necessário.**

**Por quê:**
- Railway precisa saber como buildar o projeto
- Railway precisa saber qual comando executar
- Sem Dockerfile, Railway tenta adivinhar (e pode falhar)

**O Dockerfile já foi criado:** `/home/ubuntu/Dockerfile`

---

## 10. PASSO A PASSO FINAL

### 1. Git
```bash
cd /home/ubuntu
git init
git add .
git commit -m "Sistema de folha de pagamento - Pronto para produção"
git remote add origin https://github.com/seu-usuario/frifuck-dashboard.git
git push -u origin main
```

### 2. Railway - Criar Projeto
- Acesse https://railway.app
- Clique "New Project"
- Selecione "Deploy from GitHub"
- Autorize e selecione "frifuck-dashboard"

### 3. Railway - Adicionar MySQL
- Clique "+ Add"
- Selecione "MySQL"
- Aguarde "Running"

### 4. Railway - Copiar DATABASE_URL
- Clique no serviço MySQL
- Vá para "Variables"
- Copie `DATABASE_URL`

### 5. Railway - Configurar App
- Clique no serviço da aplicação
- Vá para "Variables"
- Cole todas as variáveis (veja seção 2)
- Salve

### 6. Executar Migrações
```bash
export DATABASE_URL="<copie do Railway>"
pnpm db:push
```

### 7. Railway - Conectar Domínio
- Clique no serviço da aplicação
- Vá para "Settings"
- Clique "Add Domain"
- Digite `frfuck.xyz`
- Copie o CNAME fornecido

### 8. Registrador de Domínio
- Acesse seu registrador (GoDaddy, Namecheap, etc.)
- Vá para DNS
- Adicione CNAME:
  - **Name:** `@` (ou deixe em branco)
  - **Value:** <copie do Railway>
  - **TTL:** 3600

### 9. Aguardar DNS
```bash
# Verificar propagação
nslookup frfuck.xyz
# Deve retornar IP da Railway
```

### 10. Validar
```bash
curl https://frfuck.xyz
# Deve retornar HTML
```

---

## 11. INFORMAÇÕES IMPORTANTES

| Item | Valor |
|------|-------|
| Plataforma | Railway |
| Banco | MySQL 8.0 (gerenciado) |
| Domínio | frfuck.xyz |
| URL | https://frfuck.xyz |
| Build | `pnpm build` |
| Start | `node dist/index.js` |
| Dockerfile | Necessário (já existe) |

---

## 12. INCERTEZAS RESOLVIDAS

✅ **DATABASE_URL:** Railway fornece como `DATABASE_URL` no serviço MySQL
✅ **Rede privada:** Automática entre serviços Railway
✅ **Frontend/Backend:** Mesmo processo Express, sem risco
✅ **Domínio:** CNAME no root (Railway suporta)
✅ **Migrações:** `pnpm db:push` com DATABASE_URL exportada

---

## 13. COMANDOS RÁPIDOS

```bash
# Build local
pnpm build

# Testar localmente
pnpm dev

# Migração local
pnpm db:push

# Migração produção
DATABASE_URL="<do Railway>" pnpm db:push

# Validar app online
curl https://frfuck.xyz
```

---

**Pronto para deploy! 🚀**
