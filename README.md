# Auth Boilerplate

Autenticação completa: JWT, Refresh Token e OAuth com Google.
Pronto para ser clonado e adaptado em novos projetos.

## Funcionalidades

- [x] Registro e login com e-mail/senha
- [x] JWT + Refresh Token em httpOnly cookie
- [x] OAuth com Google
- [x] Guards e Decorators customizados
- [x] Rotas protegidas no frontend

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
| GET    | `/auth/admin/stats`     | Bearer + ADMIN    | —                            | `200 { userCount, adminCount }`       | `401` sem token · `403` role errada           |
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

## Decorators disponíveis

Todos em [apps/api/src/auth/decorators/](apps/api/src/auth/decorators/).

### `@Public()`

Libera uma rota da autenticação (bypassa o `JwtAuthGuard` global).

```ts
import { Public } from './auth/decorators/public.decorator';

@Public()
@Get('health')
health() {
  return { status: 'ok' };
}
```

### `@CurrentUser()`

Injeta o usuário autenticado (o que o `JwtStrategy.validate` retornou) no handler.
Aceita um key opcional pra pegar só um campo:

```ts
import { CurrentUser } from './auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from './auth/strategies/jwt.strategy';

@Get('me')
me(@CurrentUser() user: AuthenticatedUser) {
  return this.svc.findById(user.userId);
}

// versão com key: só o userId, tipado como string
@Get('logs')
myLogs(@CurrentUser('userId') userId: string) {
  return this.svc.logsFor(userId);
}
```

### `@Roles(...roles)` + `RolesGuard`

Restringe a rota a roles específicas. O `RolesGuard` está registrado como `APP_GUARD` — ele
roda depois do `JwtAuthGuard`, então `req.user.role` já está populado (vem do payload JWT).

```ts
import { Role } from '@prisma/client';
import { Roles } from './auth/decorators/roles.decorator';

@Roles(Role.ADMIN)
@Get('admin/stats')
stats() {
  return this.svc.stats();
}

// múltiplas roles
@Roles(Role.ADMIN, Role.EDITOR)
@Post('publish')
publish() { ... }
```

Sem `@Roles`, o guard libera (fica no-op). Com `@Roles(Role.ADMIN)` e usuário
`USER`, retorna `403 requires role: ADMIN`.

**Como promover um usuário a ADMIN em dev**:

```bash
docker exec authbp-postgres psql -U authbp -d authbp \
  -c "UPDATE \"User\" SET role='ADMIN' WHERE email='seu@email.com';"
```

O usuário precisa **relogar** pra que o JWT tenha o role novo (roles são embutidas no
access token). Em prod, considere um endpoint `POST /auth/admin/promote` protegido por
admin existente.

## Frontend

SPA em React + Vite com [react-router-dom](https://reactrouter.com), formulários com
[React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev), HTTP via
[axios](https://axios-http.com) com `withCredentials: true` pro cookie de refresh viajar.

**Estrutura**:

```
apps/web/src/
├── App.tsx                       # BrowserRouter + rotas
├── context/AuthContext.tsx       # useAuth() — user, accessToken, login/register/logout
├── lib/api.ts                    # axios com interceptors (attach Bearer, silent refresh)
├── lib/schemas.ts                # Zod: loginSchema, registerSchema
├── components/
│   ├── ProtectedRoute.tsx        # redireciona pra /login se anônimo
│   └── GoogleButton.tsx          # <a> pra API_URL/auth/google
└── pages/
    ├── LoginPage.tsx             # RHF + Zod
    ├── RegisterPage.tsx          # RHF + Zod
    └── HomePage.tsx              # user info, logout, stats se ADMIN
```

**Fluxo de sessão**:

```
    ┌─────────────┐                              ┌──────────┐
    │  Browser    │                              │   API    │
    └──────┬──────┘                              └────┬─────┘
           │  1. AuthProvider monta                   │
           │  2. POST /auth/refresh (silent)          │
           │─────────────────────────────────────────▶│
           │                                          │
           │  ─── se cookie ausente: 401 ────         │
           │  loading=false, user=null → /login       │
           │                                          │
           │  ─── se cookie válido: 200 + accessToken │
           │  GET /auth/me → user hidrata → HomePage  │
           │                                          │
           │  --- durante uso -----                   │
           │  qualquer request 401 →                  │
           │  interceptor tenta /auth/refresh 1x      │
           │  (coalesced: só uma refresh em voo)      │
           │  → retry original com novo token         │
           │  → se refresh falhar: logout local       │
```

**Refresh silencioso**: no `AuthProvider.useEffect` do mount, chama `/auth/refresh`
uma vez pra hidratar sessão vinda de OAuth ou de aba anterior. Se o cookie estiver
válido, o usuário aparece já logado. Se não, cai na tela de login sem flash.

**Interceptor de refresh** (`context/AuthContext.tsx`): quando um request 401 chega
(access token expirou), o interceptor tenta `/auth/refresh`, atualiza o accessToken
via `setAccessToken`, e refaz o request original com o novo Bearer. Requisições
paralelas dividem a mesma promise de refresh via `refreshFlight` — evita corrida onde
5 requests simultâneos disparariam 5 refresh calls e rotacionariam o token 5 vezes.

**OAuth do frontend**: `GoogleButton` é só `<a href="${API_URL}/auth/google">`. O
browser navega pra API, que 302 pra Google, Google autentica e devolve pra
`/auth/google/callback`, API seta o cookie e 302 pra `OAUTH_SUCCESS_REDIRECT` (o
`/` da SPA). No mount da SPA o silent refresh pega o cookie e hidrata.

**Como testar em 2 minutos**:

```bash
docker compose up -d
cd apps/api && pnpm dev            # em uma aba
cd apps/web && pnpm dev            # em outra aba
```

Abra http://localhost:5173. Registre com qualquer e-mail/senha (>= 8 chars). Depois,
pra ver a seção "Admin stats":

```bash
docker exec authbp-postgres psql -U authbp -d authbp \
  -c "UPDATE \"User\" SET role='ADMIN' WHERE email='seu@email.com';"
```

Faça logout + login → HomePage mostra a seção de admin. Para OAuth, configure
`GOOGLE_CLIENT_ID`/`SECRET` no `.env` e reinicie a API.
