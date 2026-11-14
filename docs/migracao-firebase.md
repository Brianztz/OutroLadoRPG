# Migração do Firebase para Durable Objects (em andamento)

O GitHub guarda o código. Os dados editáveis ficam no armazenamento persistente do Durable Object da mesa, porque GitHub Pages/Git não oferecem escrita multiusuário em tempo real nem controle seguro de acesso aos arquivos por navegador.

## Fase 1: API persistente (implementada nesta branch)

`GET /api/storage?mesa=MESA&kind=character&codigo=CODIGO&edicao=classic` lê a ficha.
`PUT` no mesmo caminho grava JSON. Para a segunda temporada, usar `edicao=temporada`.
`GET/PUT /api/storage?mesa=MESA&kind=clues` lê/grava o catálogo de pistas do mestre.
O corpo de PUT é JSON e a resposta possui hash e timestamp.

* Autorização: `Authorization: Bearer <segredo>`. Para fichas, um token aleatório criptograficamente seguro de pelo menos 43 caracteres por jogador; a primeira gravação registra o hash do token e vincula a ficha. Um mestre autenticado pode acessar fichas.
* Para o mestre, definir segredo **fora do repositório** com `wrangler secret put MASTER_DATA_TOKEN` (pelo menos 32 caracteres). A configuração da aplicação deve garantir que esse segredo nunca seja incorporado ao HTML ou JS público.
* Cada mesa tem armazenamento isolado. A ficha é armazenada em partes, e o manifesto só muda após a gravação completar. Dados anteriores são preservados até essa etapa.
* **Não compartilhar chave de jogador**. Este protocolo usa posse da chave, não login social.
* O cliente atual **continua usando Firebase** nesta fase: não remover as configurações antigas nem colocar em produção como substituto completo. Essa implementação não transfere dados automaticamente.

## Próximas etapas antes da ativação

1. Criar uma interface segura de entrada como jogador e mestre e gerenciamento/recuperação de credenciais.
2. Adaptar `public/firebase-client.js` e páginas `public/index.html`, `public/ficha.html`, `public/ficha-temporada.html`, escudos e clientes WebSocket para API e login novos.
3. Migrar documentos antigos de `tables/*/characters`, `seasonCharacters` e `masterContent/clues` para Durable Objects, com autorização do proprietário, backup e conferência de hash/contagem.
4. Revisar permissões dos WebSockets: o `src/worker.js` atual valida tokens Firebase para eventos privilegiados. Substituir isso por verificação própria de sessão antes de desligar Firebase Authentication.
5. Testar sincronização com dois navegadores, troca de mesa, reconexão, sessões do mestre, envio de pistas, escrita de documentos grandes e recuperação após reiniciar o Worker.
6. Fazer deploy apenas após testes de integração e migração de dados. **Não apagar os dados do Firebase** até concluir o backup.

### Atenção de segurança

O primeiro PUT de uma ficha nova associa a chave ao código do personagem. O sistema final deve provisionar os códigos de jogadores de modo autenticado pelo mestre, para evitar reivindicação indevida de um código previsível. O endpoint inicial destina-se a testes controlados, **não a uso público desassistido**.
