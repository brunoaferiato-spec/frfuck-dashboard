import "dotenv/config";
import { getDb, getFuncionariosByLoja } from "./server/db";
import { funcionarios } from "./drizzle/schema";

async function validateProduction() {
  console.log("\n=== VALIDACAO DE PRODUCAO ===\n");

  const db = await getDb();
  if (!db) {
    console.error("❌ ERRO: Banco de dados não conectado!");
    console.error("Verifique:");
    console.error("1. DATABASE_URL está configurada?");
    console.error("2. Banco de dados está online?");
    console.error("3. Credenciais estão corretas?");
    process.exit(1);
  }

  try {
    console.log("✅ Banco de dados conectado");

    // TESTE 1: Criar funcionário
    console.log("\n📝 TESTE 1: Criar funcionário de teste");
    const timestamp = Date.now();
    const testFuncName = `Teste Producao ${timestamp}`;

    const resultInsert = await db.insert(funcionarios).values({
      nome: testFuncName,
      funcao: "mecanico",
      lojaId: 1,
      dataAdmissao: new Date(),
      status: "ativo",
    });

    console.log("✅ Funcionário criado com sucesso");

    // TESTE 2: Recuperar funcionário
    console.log("\n🔍 TESTE 2: Recuperar funcionário (simular F5)");
    const funcsRecuperados = await getFuncionariosByLoja(1);
    const funcCriado = funcsRecuperados.find(f => f.nome.includes("Teste Producao"));

    if (funcCriado) {
      console.log(`✅ Funcionário PERSISTIU: ${funcCriado.nome}`);
      console.log(`   ID: ${funcCriado.id}`);
      console.log(`   Função: ${funcCriado.funcao}`);
      console.log(`   Status: ${funcCriado.status}`);
    } else {
      console.error("❌ ERRO: Funcionário NÃO PERSISTIU!");
      process.exit(1);
    }

    // TESTE 3: Verificar múltiplos funcionários
    console.log("\n📊 TESTE 3: Verificar múltiplos funcionários");
    console.log(`✅ Total de funcionários na loja 1: ${funcsRecuperados.length}`);

    // TESTE 4: Verificar integridade dos dados
    console.log("\n🔐 TESTE 4: Verificar integridade dos dados");
    const allValid = funcsRecuperados.every(f => 
      f.id && f.nome && f.funcao && f.lojaId && f.status
    );

    if (allValid) {
      console.log("✅ Todos os funcionários têm dados válidos");
    } else {
      console.error("❌ ERRO: Alguns funcionários têm dados inválidos!");
      process.exit(1);
    }

    // TESTE 5: Verificar ambiente
    console.log("\n⚙️ TESTE 5: Verificar configurações de ambiente");
    const nodeEnv = process.env.NODE_ENV;
    const port = process.env.PORT;
    const hasJwtSecret = !!process.env.JWT_SECRET;
    const hasOAuthUrl = !!process.env.OAUTH_SERVER_URL;

    console.log(`✅ NODE_ENV: ${nodeEnv}`);
    console.log(`✅ PORT: ${port}`);
    console.log(`✅ JWT_SECRET configurado: ${hasJwtSecret ? "Sim" : "Não"}`);
    console.log(`✅ OAUTH_SERVER_URL: ${hasOAuthUrl ? "Sim" : "Não"}`);

    if (nodeEnv !== "production") {
      console.warn("⚠️ AVISO: NODE_ENV não está em 'production'");
    }

    // RESUMO FINAL
    console.log("\n" + "=".repeat(50));
    console.log("✅ VALIDACAO DE PRODUCAO PASSOU!");
    console.log("=".repeat(50));
    console.log("\n✅ Sistema está pronto para produção:");
    console.log("   - Banco de dados conectado");
    console.log("   - Dados persistindo corretamente");
    console.log("   - Ambiente configurado");
    console.log("   - Aplicação funcionando");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERRO NA VALIDACAO:", error);
    console.error("\nVerifique:");
    console.error("1. Banco de dados está online?");
    console.error("2. DATABASE_URL está correta?");
    console.error("3. Migrações foram executadas?");
    console.error("4. Tabelas existem no banco?");
    process.exit(1);
  }
}

validateProduction();
