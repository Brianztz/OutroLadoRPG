# Ficha da temporada

A nova ficha é servida em `/ficha-temporada.html?mesa=CODIGO`. O portal oferece **Nova temporada** e **Outro Lado — original**; a original permanece em `/ficha.html`.

## Integração

- A mesma autenticação Google e autorização de mesa da ficha original.
- Dados locais separados por usuário, mesa e personagem visualizado. Backup JSON pela barra superior.
- Nuvem em `tables/{mesa}/seasonCharacters/{uid}` e seus `chunks`. A ficha original continua em `characters/{uid}`. Nenhuma migração ou exclusão da ficha original.
- Eventos existentes `status_change`, `master_update_player`, `player_data_updated`, `rolagem_feita` e `sync_requested`. O escudo escolhe a página pela identificação `sheetType`.
- Overlay existente recebe vida, sanidade, defesa, imagem, estado de combate, cor, arma e munição. A inspeção de pistas usa o mesmo protocolo do overlay de pistas.
- Itens e pistas enviados pelo mestre são convertidos; itens que não cabem são recusados com aviso ao jogador.
- Um código identifica um jogador ativo na mesa. Use apenas uma das duas fichas desse jogador por vez para não alternar a presença exibida no escudo.

## Código

`public/temporada/sheet.js` contém a ficha final adaptada e a ponte `SeasonSheet`; `sync.js` contém a sincronização. CSS e imagens estão separados em `sheet.css` e `assets`. O catálogo de 98 rituais e imagens de itens usam arquivos locais. A edição do mestre não grava na ficha pessoal do mestre.

## Publicação

1. Revisar e publicar `firestore.rules` no banco nomeado `outro-lado-rpg` antes de disponibilizar a nova página. As regras novas repetem os validadores, limites e permissões existentes numa coleção distinta.
2. Publicar o Worker e os assets pelo processo habitual do projeto.
3. Validar com contas reais de jogador e mestre na mesma mesa: salvamento após recarregar; ajustes do mestre; entrega de item/pista; logs e munição no overlay; inspeção de pistas.

Nenhuma regra remota, dado de jogador ou publicação de produção é alterado pelos testes deste PR.

## Validação

`npm test` executa testes com DOM e transporte/Firebase simulados, cobrindo inicialização completa, eventos, alterações do mestre, isolamento de coleções, assets e caminhos. Não substitui a validação autenticada no Firebase de produção nem o teste das Security Rules no emulador.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for the separate season collection by preserving the existing owner/table-member authorization, immutable ownership checks, schema validation and chunk limits. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

Foi corrigida também uma aspa ausente preexistente em `src/worker.js` que impedia o JavaScript do Worker de compilar.
