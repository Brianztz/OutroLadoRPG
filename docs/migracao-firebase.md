# Migração da ficha Outro Lado para Durable Objects

**Estado (13/11/2026): integração no código pronta para validação, produção NÃO publicada.**
**Pull Request:** https://github.com/Brianztz/OutroLadoRPG/pull/2

## O que já foi alterado

- O portal `public/index.html` usa código e chave de acesso em vez de Firebase Authentication.
- O mestre gera e revoga convites individuais em `/acessos.html`, com uma chave exclusiva para cada código de personagem.
- O Worker `src/session-api.js` emite sessões HttpOnly/Secure e consulta o armazenamento por mesa.
- O Worker `src/storage-api.js` salva fichas e pistas nos Durable Objects existentes.
- As páginas mantêm a API histórica `OLFirebase` **somente como nome de compatibilidade**, mas a implementação em `public/firebase-client.js` já usa a API nativa, sem SDK do Firebase.
- Os WebSockets agora autenticam pelas sessões do servidor, verificam o código do jogador e respeitam chaves revogadas.
- A segunda temporada permanece isolada da primeira pelo código físico de mesa `T2_...`.
- As fichas e o escudo continuam preservando o salvamento local quando o servidor estiver indisponível.
- A versão de cache do cliente foi alterada para evitar carregar o JavaScript antigo.
- `/migrar.html` é uma ferramenta **exclusiva de migração**: importa dados antigos usando a conta Google do próprio dono e faz backup + verificação de integridade. Apenas essa tela carrega `legacy-firebase-client.js`.

## Validações

- A execução do GitHub Actions `native-migration` concluiu 20 testes sem falhas e `wrangler deploy --dry-run` com sucesso.
- A suíte histórica completa ainda tem falhas anteriores à migração. Em um teste separado sobre `main`, 15 de 51 testes já falhavam; não são prova de regressão da migração.
- **Ainda falta** testar o ambiente real com um mestre e dois jogadores em navegadores diferentes, incluindo importação do Firestore, revogação de convite, reconexão e overlays.

## Etapas obrigatórias para publicar

1. **Configurar segredo de mestre** `MASTER_DATA_TOKEN` no Worker `outroladorpg`, com pelo menos 32 caracteres aleatórios. Não salvar no GitHub, no HTML, no navegador do jogador nem compartilhar em convite. O painel/API de segredos deve editar a versão correta do Worker: o endpoint padrão retornou erro Cloudflare 10215, pois a versão mais recente não está implantada. Pelo Wrangler, o comando indicado para uma versão nova é `npx wrangler versions secret put MASTER_DATA_TOKEN --name outroladorpg`. Essa operação exige acesso à conta Cloudflare.
2. **Concluir migração dos dados antigos** antes de apagar Firebase ou obrigar jogadores antigos a utilizar apenas o login novo. Cada jogador deve usar sua conta Google antiga em `/migrar.html`, baixar backup, transferir sua ficha e conferir o resultado. O mestre precisa fazer o mesmo com as pistas da mesa. O sistema não possui credenciais administrativas para copiar dados privados de terceiros automaticamente.
3. Validar o cenário real de dois jogadores e o mestre em mesas T1/T2, salvamento, importação, overlay e revogação.
4. Revisar as falhas históricas da suíte e decidir quais precisam de correção separada antes de produção.
5. Só depois fazer merge da PR e confirmar o deploy do Worker de produção. **Não confundir versão de prévia com versão publicada.**

## Por que GitHub não é o banco

GitHub hospeda o código. As alterações de PV, PM, inventário e pistas precisam de gravação autenticada e sincronização frequente, que não funcionam bem via commits Git. O banco é o Durable Object persistente já presente no projeto.

## Segurança e recuperação

- Não remover nem apagar o Firestore até os dados terem sido copiados e verificados.
- A renovação de um convite invalida a chave anterior mas mantém a ficha armazenada.
- Os convites contêm chave privada em fragmento `#` e devem ser enviados somente ao jogador correto; o portal apaga o fragmento do histórico logo depois de abri-lo.
- O segredo do mestre **nunca** deve ser colocado como variável pública do Wrangler.
