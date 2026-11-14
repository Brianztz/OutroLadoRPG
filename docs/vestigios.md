# Outro Lado: Vestígios — segunda temporada

## Produto

O portal público atende exclusivamente **Outro Lado: Vestígios / Exílio 3.0**.

- Entrada do mestre pela chave privada; código permanente de mesa guardado em Durable Object.
- Convites individuais de jogador por link; a temporada de destino é sempre a segunda.
- Ficha: /ficha-temporada.html
- Escudo: /mestre-temporada.html
- Convites: /acessos.html
- Overlay: /overlay.html?mesa=<codigo>&temporada=2
- LUMINA: /lumina/index.html?mesa=<codigo>&temporada=2

## Remoção da primeira temporada

- Não existem mais as páginas public/mestre.html e public/ficha.html.
- URLs antigas /mestre, /mestre.html, /ficha e /ficha.html redirecionam para as páginas da segunda temporada, preservando o parâmetro mesa e adicionando temporada=2.
- Recursos compartilhados (API, armazenamento, bestiário, scripts de combate, overlay) continuam disponíveis porque Vestígios depende deles.
- O backend conserva os registros legados. **Nenhum dado de fichas do Cloudflare é excluído por este redesign.**
- O SDK Firebase não é carregado. O nome OLFirebase ainda existe no adaptador nativo por compatibilidade com consumidores já escritos, mas as chamadas vão para a API Cloudflare.

## Publicação e testes

Rode os testes de autenticação, fichas, overlay e roteamento e faça dry-run do Wrangler antes de publicar. A suíte histórica contém testes criados para uma estrutura antiga da ficha; as falhas anteriores devem ser tratadas separadamente sem mascarar regressões novas.

Não armazene chaves do mestre ou dos jogadores em repositório, log ou URL de documentação.
