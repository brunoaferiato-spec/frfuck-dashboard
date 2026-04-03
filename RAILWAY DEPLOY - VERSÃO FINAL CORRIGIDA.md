# RAILWAY DEPLOY - VERSÃO FINAL CORRIGIDA

## 1. VARIAVEIS DO MYSQL DA RAILWAY

**Railway MySQL fornece estas variáveis:**
- `MYSQLHOST` - Host do banco
- `MYSQLPORT` - Porta (padrão 3306)
- `MYSQLUSER` - Usuário
- `MYSQLPASSWORD` - Senha
- `MYSQLDATABASE` - Nome do banco
- `MYSQL_URL` - String de conexão completa

**Seu projeto precisa de `DATABASE_URL`.**

### Como mapear MYSQL_URL para DATABASE_URL

**Opção 1 (Recomendado - Automático):**
Railway permite referenciar variáveis de outro serviço. No serviço da aplicação:
```
DATABASE_URL=${{MYSQL.MYSQL_URL}}
```

**Opção 2 (Manual - Se a Opção 1 não funcionar):**
Se Railway não permitir referência automática, construa manualmente:
```
DATABASE_URL=mysql://${{MYSQL.MYSQLUSER}}:${{MYSQL.MYSQLPASSWORD}}@${{MYSQL.MYSQLHOST}}:${{MYSQL.MYSQLPORT}}/${{MYSQL.MYSQLDATABASE}}
```

**Rede privada:** Automática entre serviços Railway (use `MYSQLHOST` interno, não o público).

---

## 2. DOCKERFILE - NECESSÁRIO OU NÃO?

### Resposta: NÃO é obrigatório

**Railway detecta automaticamente Node.js** via:
- `package.json` presente
- Scripts `build` e `start` definidos

**Seu projeto já tem:**
```json
"build": "vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
"start": "NODE_ENV=production node dist/index.js"
```

### Você pode escolher:

**Opção A (Sem Dockerfile - Mais simples):**
- Railway usa Railpack (buildpack automático)
- Detecta `package.json`
- Executa `npm run build` e `npm run start`
- ✅ Funciona para este projeto

**Opção B (Com Dockerfile - Mais controle):**
- Dockerfile já existe em `/home/ubuntu/Dockerfile`
- Railway respeita as instruções exatas
- Melhor para builds complexos
- ✅ Também funciona

### Recomendação
**Use Opção A (sem Dockerfile)** para este deploy:
1. Mais simples
2. Railway detecta automaticamente
3. Menos chance de erro
4. Se precisar depois, adiciona Dockerfile

**Se usar Dockerfile:**
- Certifique-se que está no root do repositório
- Railway verá e usará automaticamente

---

## 3. DOMINIO frfuck.xyz - REGISTROS DNS

### Problema: CNAME no root (@) não é padrão

**Padrão DNS:** Apenas A records no root, CNAME em subdomínios

**Soluções por provedor:**

### GoDaddy (NÃO suporta CNAME no root)
**Use A record:**
1. Vá para DNS Records
2. Clique "Add" → "A"
3. **Name:** `@` (ou deixe em branco)
4. **Type:** A
5. **Value:** IP fornecido pela Railway (ou use CNAME para www)
6. **TTL:** 3600

**Alternativa (Recomendado):**
- Adicione A record no root (@) apontando para IP da Railway
- Adicione CNAME `www` → `frfuck.xyz`

### Namecheap (Suporta CNAME no root com algumas limitações)
**Use CNAME (se suportado):**
1. Vá para Advanced DNS
2. Clique "Add Record" → "CNAME"
3. **Host:** `@` (ou deixe em branco)
4. **Value:** CNAME fornecido pela Railway
5. **TTL:** 3600

**Se não funcionar, use A record** (mesmo que GoDaddy)

### Cloudflare (Suporta CNAME flattening)
**Use CNAME (funciona automaticamente):**
1. Vá para DNS
2. Clique "Add record" → "CNAME"
3. **Name:** `@`
4. **Content:** CNAME fornecido pela Railway
5. **TTL:** Auto

### Route53 (AWS)
**Use ALIAS (equivalente a CNAME no root):**
1. Vá para Hosted Zone
2. Clique "Create record"
3. **Record name:** deixe em branco (root)
4. **Type:** A
5. **Alias:** Ativado
6. **Alias target:** Railway endpoint
7. **TTL:** 300

---

## 4. PASSO A PASSO FINAL

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
- Clique "+ New"
- Selecione "MySQL"
- Aguarde "Running"

### 4. Railway - Configurar Variáveis da App
Clique no serviço da aplicação → "Variables" → Adicione:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=${{MYSQL.MYSQL_URL}}
JWT_SECRET=<gere com: openssl rand -base64 32>
VITE_APP_ID=frifuck-app
OAUTH_SERVER_URL=https://frfuck.xyz
OWNER_OPEN_ID=owner-123
LOG_LEVEL=info
```

Salve e aguarde redeploy.

### 5. Executar Migrações (ANTES de usar em produção)

**Obter DATABASE_URL:**
1. Clique no serviço MySQL
2. Vá para "Variables"
3. Copie o valor de `MYSQL_URL`

**Executar migrações:**
```bash
export DATABASE_URL="<copie do MYSQL_URL>"
pnpm db:push
```

### 6. Railway - Conectar Domínio

#### Na Railway:
1. Clique no serviço da aplicação
2. Vá para "Settings"
3. Procure "Domains"
4. Clique "Add Domain"
5. Digite: `frfuck.xyz`
6. **Copie o valor fornecido** (pode ser CNAME ou IP)

#### No seu registrador (GoDaddy/Namecheap/etc):

**Se Railway forneceu CNAME:**
- Seu provedor suporta CNAME no root? 
  - SIM: Crie CNAME `@` → valor Railway
  - NÃO: Peça ao suporte ou use Cloudflare como DNS

**Se Railway forneceu IP (A record):**
- Crie A record `@` → IP fornecido

**Verificar propagação:**
```bash
nslookup frfuck.xyz
# Deve retornar IP/CNAME da Railway
```

---

## 5. VALIDACAO POS-DEPLOY

```bash
# Teste 1: App online
curl https://frfuck.xyz
# Deve retornar HTML

# Teste 2: Criar funcionário via UI
# - Acesse https://frfuck.xyz
# - Crie um funcionário
# - Deve aparecer na lista

# Teste 3: Persistência (F5)
# - Pressione F5
# - Funcionário deve continuar lá

# Teste 4: Banco remoto
export DATABASE_URL="<do Railway>"
mysql -h <host> -u <user> -p -D frifuck_db
SELECT COUNT(*) FROM funcionarios;
# Deve retornar 1 ou mais
```

---

## 6. RESUMO FINAL

| Item | Valor |
|------|-------|
| MySQL URL | `MYSQL_URL` (Railway) → `DATABASE_URL` (app) |
| Dockerfile | Opcional (Railway detecta automaticamente) |
| Build | `pnpm build` (automático) |
| Start | `node dist/index.js` (automático) |
| DNS Root | Depende do provedor (A ou CNAME) |
| Rede | Privada (automática Railway) |

---

## 7. TROUBLESHOOTING RAPIDO

| Problema | Solução |
|----------|---------|
| App não inicia | Verificar logs Railway + DATABASE_URL |
| DATABASE_URL vazio | Usar `${{MYSQL.MYSQL_URL}}` ou construir manualmente |
| Banco não conecta | Verificar migrações com `pnpm db:push` |
| Domínio não funciona | Verificar DNS propagation + tipo de registro |
| Dockerfile conflita | Remover Dockerfile e deixar Railway detectar |

---

**Pronto para deploy! 🚀**
