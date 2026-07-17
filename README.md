# Auth Boilerplate

Autenticação completa: JWT, Refresh Token e OAuth com Google.
Pronto para ser clonado e adaptado em novos projetos.

## Funcionalidades

- [x] Registro e login com e-mail/senha
- [x] JWT + Refresh Token em httpOnly cookie
- [x] OAuth com Google
- [ ] Guards e Decorators customizados
- [ ] Rotas protegidas no frontend

## Stack

- **API**: NestJS · Prisma · JWT · Passport · Google OAuth
- **Web**: React · Vite · React Hook Form · Zod

## Como rodar

```bash
cp .env.example .env
docker compose up -d
cd apps/api && pnpm install && pnpm prisma:migrate && pnpm dev
# em outro terminal
cd apps/web && pnpm dev
```

## API

Access token (`JWT_ACCESS_EXPIRES_IN`, default `15m`) vai no header `Authorization: Bearer …`.
Refresh token (`JWT_REFRESH_EXPIRES_IN`, default `7d`) vai em cookie httpOnly `refreshToken`
com `Path=/auth`, `SameSite=Lax` em dev e `SameSite=None; Secure` em prod (via `COOKIE_SECURE=true`).

| Método | Rota                    | Auth              | Body / entrada               | Sucesso                               | Erros                                         |
| ------ | ----------------------- | ----------------- | ---------------------------- | ------------------------------------- | --------------------------------------------- |
| GET    | `/health`               | público           | —                            | `200 { status: 'ok' }`                | —                                             |
| POST   | `/auth/register`        | público           | `{ email, password, name? }` | `201 { user, accessToken }`           | `400` validação · `409` e-mail já registrado  |
| POST   | `/auth/login`           | público           | `{ email, password }`        | `200 { user, accessToken }`           | `400` validação · `401` credenciais inválidas |
| POST   | `/auth/refresh`         | cookie `refresh…` | —                            | `200 { accessToken }`                 | `401` cookie ausente/inválido/rotacionado     |
| POST   | `/auth/logout`          | Bearer            | —                            | `204` + cookie limpo                  | `401` sem access token                        |
| GET    | `/auth/me`              | Bearer            | —                            | `200 PublicUser`                      | `401` sem access token                        |
| GET    | `/auth/google`          | público           | —                            | `302` para accounts.google.com        | `501` se OAuth não configurado                |
| GET    | `/auth/google/callback` | público           | `?code=…`                    | `302 OAUTH_SUCCESS_REDIRECT` + cookie | `501` / `401`                                 |

`JwtAuthGuard` é registrado como `APP_GUARD` — **toda rota é protegida por padrão**. Para
liberar, marca com `@Public()` (register, login, refresh e health já estão marcados).

## Fluxo do refresh token

```
    ┌──────────┐                                       ┌─────────────┐
    │  Client  │                                       │     API     │
    └────┬─────┘                                       └──────┬──────┘
         │  POST /auth/login { email, password }              │
         │──────────────────────────────────────────────────▶ │
         │                                                    │  sign access (15m)
         │                                                    │  sign refresh (7d)
         │                                                    │  store SHA-256(refresh)
         │  200 { user, accessToken }                         │
         │  Set-Cookie: refreshToken=…; HttpOnly; Path=/auth  │
         │ ◀──────────────────────────────────────────────────│
         │                                                    │
         │  ─── access token expira em 15min ────────────     │
         │                                                    │
         │  POST /auth/refresh   (cookie enviado)             │
         │──────────────────────────────────────────────────▶ │
         │                                                    │  verify JWT signature
         │                                                    │  SHA-256(presented) == stored?
         │                                                    │  ROTATE: sign novo refresh
         │                                                    │  store SHA-256(novo)
         │  200 { accessToken }                               │
         │  Set-Cookie: refreshToken=<novo>                   │
         │ ◀──────────────────────────────────────────────────│
         │                                                    │
         │  POST /auth/logout  (Bearer accessToken)           │
         │──────────────────────────────────────────────────▶ │
         │                                                    │  hashedRefreshToken = null
         │  204                                               │
         │  Set-Cookie: refreshToken=; Max-Age=0              │
         │ ◀──────────────────────────────────────────────────│
```

**Rotação**: cada `/auth/refresh` bem-sucedido invalida o refresh token anterior
(overwrite do `hashedRefreshToken` no DB). Se o refresh antigo for reusado, resposta é
`401 refresh denied` — sinal de possível vazamento.

**Por que SHA-256 e não bcrypt no refresh token?** Bcrypt trunca a entrada em 72 bytes.
Refresh tokens JWT do mesmo usuário compartilham os primeiros ~72 bytes (header + começo
do payload), então bcrypt-compare retornaria true pra qualquer par de tokens do mesmo
usuário — rotação viraria no-op. Refresh tokens já têm ~256 bits de entropia na
assinatura, não precisam de salt; SHA-256 com `timingSafeEqual` é suficiente.

## OAuth com Google

O fluxo:

```
1. Usuário clica "Entrar com Google" → navega para GET /auth/google
2. API redireciona (302) para accounts.google.com/o/oauth2/v2/auth?...
3. Google autentica o usuário e redireciona pra GET /auth/google/callback?code=…
4. Passport troca o code por tokens do Google e chama GoogleStrategy.validate()
5. AuthService.oauthLoginWithGoogle faz upsert:
     ├─ acha por googleId → usa
     ├─ acha por email    → vincula googleId ao usuário existente
     └─ nenhum dos dois   → cria novo usuário (password = null)
6. API assina access + refresh (rotação padrão), seta cookie httpOnly
7. Redireciona pra OAUTH_SUCCESS_REDIRECT (a SPA chama /auth/refresh no mount
   pra converter o cookie em access token na memória)
```

**Configurando o Google Cloud Console**:

1. Acesse https://console.cloud.google.com/apis/credentials
2. Crie um projeto (ou use um existente)
3. Configure a "OAuth consent screen" (interno pra dev / externo pra prod)
4. Em "Credentials" → "Create Credentials" → "OAuth client ID" → Web application
5. Adicione em **Authorized redirect URIs** exatamente o mesmo valor de
   `GOOGLE_CALLBACK_URL` (default `http://localhost:3000/auth/google/callback`)
6. Copie o Client ID e Client Secret pro `.env`:
   ```
   GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=…
   ```
7. Reinicie a API. Sem essas duas variáveis, `/auth/google*` retorna
   `501 Google OAuth not configured` (o [GoogleAuthGuard](apps/api/src/auth/guards/google-auth.guard.ts) checa antes de bater no Passport)

**Contas linkadas**: se um usuário já tem conta com email/senha e depois faz login com
Google usando o mesmo e-mail, o `googleId` é adicionado ao registro existente — não é
criada uma segunda conta.
