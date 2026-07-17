# Auth Boilerplate

Autenticação completa: JWT, Refresh Token e OAuth com Google.
Pronto para ser clonado e adaptado em novos projetos.

## Funcionalidades

- [x] Registro e login com e-mail/senha
- [x] JWT + Refresh Token em httpOnly cookie
- [ ] OAuth com Google
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

| Método | Rota             | Auth              | Body / entrada               | Sucesso                     | Erros                                         |
| ------ | ---------------- | ----------------- | ---------------------------- | --------------------------- | --------------------------------------------- |
| GET    | `/health`        | público           | —                            | `200 { status: 'ok' }`      | —                                             |
| POST   | `/auth/register` | público           | `{ email, password, name? }` | `201 { user, accessToken }` | `400` validação · `409` e-mail já registrado  |
| POST   | `/auth/login`    | público           | `{ email, password }`        | `200 { user, accessToken }` | `400` validação · `401` credenciais inválidas |
| POST   | `/auth/refresh`  | cookie `refresh…` | —                            | `200 { accessToken }`       | `401` cookie ausente/inválido/rotacionado     |
| POST   | `/auth/logout`   | Bearer            | —                            | `204` + cookie limpo        | `401` sem access token                        |
| GET    | `/auth/me`       | Bearer            | —                            | `200 PublicUser`            | `401` sem access token                        |

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
