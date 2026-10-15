# Renovação automática e segura — YouTube Music

O projeto agora utiliza OAuth 2.0 **Authorization Code (servidor) + PKCE** para a autorização do YouTube Music do mestre. O refresh token do Google é cifrado no servidor (AES-256-GCM, chave em secret) e armazenado em um Durable Object privado vinculado ao UID do mestre no Firebase. **Nenhum refresh token do Google é entregue ao navegador.** Quando o access token expira, o Worker renova automaticamente antes de consultar a API do YouTube.

## Configuração necessária (uma vez, pelo administrador)

1. Abra o **Google Cloud Console** e selecione o projeto Google vinculado à integração.
2. Configure a **OAuth consent screen**, o público apropriado e as permissões de teste/produção. Ative a **YouTube Data API v3** no projeto.
3. Em **APIs e serviços → Credenciais**, crie um **Cliente OAuth do tipo Aplicativo da Web**. Copie o **Client ID** e o **Client Secret**.
4. Cadastre no cliente OAuth a **URI de redirecionamento autorizada** da origem que serve a aplicação:
   - `https://outroladorpg.bryanferreira2454.workers.dev/api/youtube/oauth/callback` (somente se esta for a origem atual da aplicação);
   - para cada outra origem de produção realmente usada, `https://SEU-DOMINIO/api/youtube/oauth/callback`.
   - A URI deve ser **exatamente** a URL de produção (mesmo esquema HTTPS, host e caminho, sem barra extra).
5. No terminal dentro da pasta do repositório, configure **três secrets** no Cloudflare Worker usando o Wrangler:

```sh
npx wrangler secret put YOUTUBE_OAUTH_CLIENT_ID
npx wrangler secret put YOUTUBE_OAUTH_CLIENT_SECRET
npx wrangler secret put YOUTUBE_OAUTH_ENCRYPTION_KEY
```

O terceiro valor precisa ser uma **chave aleatória longa, com pelo menos 32 caracteres**, gerada com um gerador criptográfico. Guarde cópia **segura e privada**: se perder/trocar essa chave, os tokens anteriormente guardados não poderão ser decifrados e será necessário vincular o YouTube novamente. **Nunca envie os valores secretos para o GitHub**, nem os adicione em `wrangler.jsonc` ou no frontend.

6. Implante a versão atual do repositório com `npm run deploy` ou pelo pipeline de implantação existente. Se estiver usando `wrangler dev`, coloque os três valores em um `.dev.vars` local e mantenha esse arquivo fora do Git.
7. Abra o **Compartilhamento** do Outro Lado RPG com a conta Firebase do **mestre**, clique em **Vincular conta** no cartão **YouTube Music** e autorize no Google. É necessário refazer o vínculo **uma única vez** para migrar do fluxo anterior, que não emitia refresh token de servidor.

## O que acontece depois?

- F5 e reabertura de abas: o frontend consulta `GET /api/youtube/status` usando o Firebase ID token do mestre; a conta vinculada é recuperada do Durable Object.
- Acesso a playlists / faixas / busca: passa pelo Worker em `GET /api/youtube/data`; o Worker adiciona o access token e o renova automaticamente com o refresh token cifrado quando necessário.
- Desvincular: `DELETE /api/youtube/disconnect` apaga a autorização guardada pelo servidor.
- O servidor valida o **Firebase ID token assinado**, o email **verificado** e `MASTER_EMAIL` em cada requisição protegida. Espectadores/jogadores não recebem a autorização.
- `/api/youtube/oauth/start` exige autenticação e gera **PKCE** com estado aleatório e cookie HttpOnly Secure SameSite=Lax. O retorno usa nonce de uso único e valida o cookie para bloquear respostas OAuth forjadas.

### Limites

- O Google pode revogar ou expirar o refresh token, por alteração de senha, política, inatividade ou retirada de permissão; nesse caso o mestre terá que autorizar novamente.
- Apps Google OAuth em modo **Testing** com escopos externos podem receber refresh tokens de curta duração (frequentemente **7 dias**). Para persistência duradoura, configure e publique corretamente a tela de consentimento e atenda aos requisitos de verificação do Google. Consulte a documentação de OAuth do Google.
- Só funciona no backend **Cloudflare Workers** configurado no repositório, não no servidor alternativo `server.js` do Node Express.
- Na primeira atualização, o script remove os antigos tokens do YouTube armazenados localmente pelo frontend (sem reutilizá-los).
- A conexão persiste entre atualizações/fechamento **no mesmo projeto Cloudflare**, enquanto o Firebase do mestre permanecer autenticado e a autorização do Google estiver válida; não significa tocar áudio do YouTube sem o player aberto.

### Checklist de validação real

1. Vincule a conta no navegador do mestre.
2. Confira as playlists e a busca.
3. Aperte F5, feche e reabra o navegador; as playlists devem reaparecer sem solicitar consentimento.
4. Espere o access token expirar (ou faça outro acesso após cerca de uma hora) e confira que a lista ainda carrega.
5. Teste login de outro usuário/jogador: o backend deve responder 403.
6. Clique em Desvincular: `status` deve responder `linked: false`.

## Referências

- OAuth 2.0 web server (Google): https://developers.google.com/identity/protocols/oauth2/web-server
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
