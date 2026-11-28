# Outro Lado RPG — Vestígios

Plataforma digital da campanha **Outro Lado: Vestígios**, baseada no sistema **Exílio 3.0**. Outro Lado é a campanha; Exílio é o sistema de regras.

## Funcionalidades

- Ficha digital: atributos, perícias, pontos de vida e mentais, inventário, rituais, importação e exportação.
- Escudo do mestre: acompanhamento de personagens, equipamentos, pistas, monstros e bestiário.
- Entrega de itens e pistas mesmo com a ficha fechada, com isolamento entre personagens importados.
- Convites de jogadores, acesso do mestre e overlays para transmissão.

## Desenvolvimento local

Use Node.js 22 (a mesma versão da CI) e npm. Na raiz do repositório:

```sh
npm ci
npm run dev:worker
```

Abra a URL local indicada pelo Wrangler (normalmente http://localhost:8787).
O comando `npm start` inicia o servidor Express legado; para testar o backend atual, prefira o Worker.

| Caminho | Função |
| --- | --- |
| `/` | Portal |
| `/ficha-temporada.html` | Ficha de Vestígios |
| `/mestre-temporada.html` | Escudo do mestre |
| `/acessos.html` | Acessos e convites |
| `/overlay.html` | Overlay |
| `/health` | Verificação do serviço |

## Arquitetura

| Arquivo ou pasta | Responsabilidade |
| --- | --- |
| `public/` | Interface, catálogo, bestiário e recursos estáticos |
| `public/temporada/sheet.js` | Estado, controles e regras da ficha |
| `public/temporada/sync.js` | Salvamento, importação e sincronização |
| `public/native-client.js` | Cliente da API nativa |
| `src/worker.js` | Entrada do Cloudflare Worker |
| `wrangler.jsonc` | Configuração do Worker e Durable Objects |
| `tests/` | Testes automatizados |
| `server.js` | Servidor Express/Socket.IO legado |

O armazenamento ativo configurado no Worker usa Durable Objects com SQLite. Arquivos Firebase e nomes de adaptadores legados permanecem para compatibilidade; não representam o backend de produção configurado.

## Testes e publicação

```sh
npm test
node --test tests/offline-master-delivery.test.cjs
npx wrangler deploy --dry-run
```

Acompanhe os resultados em [GitHub Actions](https://github.com/Brianztz/OutroLadoRPG/actions). Antes de publicar, execute a suíte completa e o dry-run; falhas devem ser investigadas, não ignoradas. Com autorização e credenciais adequadas, `npm run deploy` publica o Worker. O dry-run não publica.

Validação manual em uma mesa de teste, sem usar fichas reais:

1. Abra o portal, autentique mestre e jogador e confirme o acesso correto.
2. Importe e exporte uma ficha, recarregue e confira PV, PM, atributos e inventário.
3. Feche a ficha e envie um item e uma pista pelo mestre; reabra e confirme a entrega única.
4. Importe outra ficha e confirme que ela não herda as entregas anteriores; envie uma nova entrega e confira.
5. Verifique bestiário, overlays e layout em desktop e celular.
6. Confira o endpoint `/health` e os logs de produção após a publicação.

Não publique credenciais, chaves privadas, códigos de acesso ou backups de jogadores. Não use dados reais em testes. Evite alterações de esquema ou exclusões de armazenamento sem revisão e backup.

Mais informações: [documentação de Vestígios](docs/vestigios.md). [Documentação histórica da ficha](docs/ficha-temporada.md) descreve a integração anterior e não deve ser usada como guia de publicação atual.

## Ficha avulsa e entrada na mesa

No portal, escolha **Criar / abrir ficha sem mesa**. A ficha avulsa funciona sem sessão de mesa e fica isolada no armazenamento local do navegador. Ela não envia rolagens, pistas ou itens ao mestre. Exporte um backup JSON para transportar a ficha entre dispositivos ou evitar perda caso os dados do navegador sejam apagados.

No escudo, abra **Convidar jogador**, informe um nome opcional, clique em **Gerar link** e copie o convite individual. O jogador cria o login vinculado ao convite. Na ficha da mesa, em **Ajustes**, escolha **Usar ficha avulsa** (quando houver uma no mesmo navegador) e confirme a substituição da ficha atual. A original permanece local. Em outro dispositivo, use **Importar ficha** com o backup JSON. Recuperação de convites existentes continua em Gerenciar acessos.

## Múltiplas mesas do mestre

A conta de mestre conserva a mesa principal existente. Após o login, o portal mostra **Minhas mesas**: selecione uma delas e abra o Escudo do Mestre, ou informe o nome e confirme a senha para criar outra (até 50 por conta). Cada mesa possui código próprio, sessão, jogadores, convites, pistas e estado de combate separados. O botão de voltar ao menu do escudo permite escolher outra mesa após entrar na conta. Senhas não são persistidas para essa seleção. Os caches locais antigos são migrados apenas para a última mesa anteriormente usada, quando identificável. Nenhuma mesa existente é excluída.

## Sessão da conta e várias mesas do jogador

O login gera uma sessão opaca, HttpOnly e segura com duração de oito horas. Criar ou alternar mesas não exige nova senha enquanto essa sessão está válida. Jogadores podem aceitar um convite adicional com a conta conectada ou usando seu usuário e senha existentes; a lista de mesas e o código da ficha de cada associação são independentes. As contas antigas mantêm a primeira mesa. Um convite já utilizado por outra conta não pode ser reaproveitado, salvo quando o mestre renova o acesso. Voltar ao portal não encerra a sessão; **Trocar conta** a encerra.

## Jogadores sem login

Jogadores abrem o convite individual e entram diretamente na ficha. O servidor guarda uma sessão de acesso por mesa em cookie seguro HttpOnly por 90 dias, invalidada quando o mestre renova ou revoga a chave. O menu de jogador lista as mesas lembradas neste navegador (somente código e nome, sem chaves). Em outro aparelho, use o convite original. Contas antigas permanecem válidas e podem migrar seus acessos ao entrar uma vez. Remover uma mesa do navegador encerra apenas o acesso local, não apaga a ficha. A autenticação de mestre continua obrigatória.
