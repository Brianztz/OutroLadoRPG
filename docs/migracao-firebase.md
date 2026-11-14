# Armazenamento nativo — Outro Lado

**Estado (13/11/2026): PR preparada para validacao; producao nao foi substituida.**
**Pull Request:** https://github.com/Brianztz/OutroLadoRPG/pull/2

## Decisao do mestre

O usuario decidiu **nao importar fichas nem pistas antigas**. A nova versao deve usar exclusivamente o Cloudflare Worker, com sessoes autenticadas e Durable Objects para salvar o jogo. Nenhum SDK, login Google ou acesso ao Firebase deve ser carregado no novo site.

## Implementado

- Login com chave de mestre e convites individuais para jogadores, por sessao HttpOnly/Secure.
- Fichas das duas temporadas, pistas do mestre e sincronizacao usando Durable Objects.
- API antiga `OLFirebase` preservada apenas como **nome interno de compatibilidade** no arquivo `public/firebase-client.js`: este modulo utiliza `OLNative` e nao acessa Firebase. O nome sera substituido separadamente quando puderem ser auditados todos os consumidores.
- Remocao da pagina `/migrar.html`, do script `legacy-firebase-client.js` e do link de migracao no portal.
- O Firebase antigo **nao foi apagado da conta externa**; nenhuma transferencia de dados foi feita.

## Consequencias assumidas

- Fichas, informacoes e pistas guardadas **somente** no Firestore antigo nao estarao disponiveis automaticamente no novo armazenamento.
- O novo site comecara com armazenamento novo para esses registros. Dados salvos no navegador podem continuar locais, mas isso nao equivale a uma migracao automatica.
- Nao remover o banco antigo do painel Cloud/Google sem uma decisao separada de exclusao definitiva.

## Publicacao

- O segredo `MASTER_DATA_TOKEN` ja existe na versao nao publicada do Worker `outroladorpg` (versao 469); nao incluir seu valor no GitHub ou no codigo publico.
- Testar login do mestre, convite de jogadores, separacao das temporadas, salvamento remoto, reconexao e overlays no ambiente real.
- A suite historica tinha falhas anteriores nesta PR; revisar separadamente.
- Publicar somente quando essas validacoes forem concluidas. O site atual nao deve ser substituido por uma versao nao testada.
