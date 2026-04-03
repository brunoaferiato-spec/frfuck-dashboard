# 🚀 Instruções para Iniciar o Projeto

## ✅ Pré-requisitos

- MySQL Server instalado e rodando
- Node.js 22+ instalado
- pnpm instalado

## 🔧 Configuração Inicial (Uma Única Vez)

### 1. Instalar dependências
```bash
cd /home/ubuntu
pnpm install
```

### 2. Configurar banco de dados
```bash
# Iniciar MySQL
sudo service mysql start

# Criar banco e usuário (se não existir)
sudo mysql -u root -e "
CREATE DATABASE IF NOT EXISTS frifuck_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'frifuck_user'@'localhost' IDENTIFIED BY 'frifuck_pass';
GRANT ALL PRIVILEGES ON frifuck_db.* TO 'frifuck_user'@'localhost';
FLUSH PRIVILEGES;
"

# Executar migrações
export DATABASE_URL="mysql://frifuck_user:frifuck_pass@localhost:3306/frifuck_db"
pnpm db:push
```

## 🎯 Iniciar o Servidor

### Opção 1: Desenvolvimento (com hot reload)
```bash
cd /home/ubuntu
export DATABASE_URL="mysql://frifuck_user:frifuck_pass@localhost:3306/frifuck_db"
export NODE_ENV="development"
pnpm dev
```

### Opção 2: Produção
```bash
cd /home/ubuntu
export DATABASE_URL="mysql://frifuck_user:frifuck_pass@localhost:3306/frifuck_db"
export NODE_ENV="production"
pnpm build
pnpm start
```

## 🌐 Acessar a Aplicação

- **Frontend:** http://localhost:3000
- **API tRPC:** http://localhost:3000/api/trpc

## 📝 Variáveis de Ambiente

Criar arquivo `.env.local` na raiz do projeto:

```env
DATABASE_URL="mysql://frifuck_user:frifuck_pass@localhost:3306/frifuck_db"
NODE_ENV="development"
VITE_APP_ID="frifuck-app"
JWT_SECRET="dev-secret-key-change-in-production"
OAUTH_SERVER_URL="http://localhost:3000"
OWNER_OPEN_ID="owner-123"
```

## 🧪 Testar Persistência

```bash
cd /home/ubuntu
export DATABASE_URL="mysql://frifuck_user:frifuck_pass@localhost:3306/frifuck_db"
npx tsx test-persistence.ts
```

## 🐛 Troubleshooting

### MySQL não conecta
```bash
# Verificar se MySQL está rodando
sudo service mysql status

# Iniciar MySQL
sudo service mysql start

# Testar conexão
mysql -u frifuck_user -p frifuck_db
# Senha: frifuck_pass
```

### Porta 3000 já está em uso
```bash
# Encontrar processo usando porta 3000
lsof -i :3000

# Matar processo
kill -9 <PID>
```

### Erro de DATABASE_URL
```bash
# Verificar se variável está definida
echo $DATABASE_URL

# Exportar novamente
export DATABASE_URL="mysql://frifuck_user:frifuck_pass@localhost:3306/frifuck_db"
```

## 📊 Estrutura do Projeto

```
/home/ubuntu/
├── client/                 # Frontend React
│   └── src/pages/
│       ├── GestaoFuncionarios.tsx  ✅ Corrigido
│       └── FolhaPagamento.tsx      ✅ Corrigido
├── server/                 # Backend Express + tRPC
│   ├── routers.ts         # Rotas tRPC
│   └── db.ts              # Conexão com banco
├── drizzle/               # Schema do banco
│   └── schema.ts
├── .env.local             # Variáveis de ambiente
└── test-persistence.ts    # Script de teste
```

## ✨ Funcionalidades Disponíveis

- ✅ Gestão de Funcionários (CRUD)
- ✅ Folha de Pagamento
- ✅ Filtros por loja
- ✅ Persistência em MySQL
- ✅ Notificações em tempo real
- ✅ Validações de formulário

## 🔒 Segurança

- Dados salvos em banco seguro
- Validações no backend
- Proteção de rotas com roles
- Sem dados em localStorage

---

**Pronto para começar!** 🎉
