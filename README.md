# Auth Boilerplate

Autenticação completa: JWT, Refresh Token e OAuth com Google.
Pronto para ser clonado e adaptado em novos projetos.

## Funcionalidades

- [x] Registro e login com e-mail/senha
- [ ] JWT + Refresh Token em httpOnly cookie
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

Access token JWT assinado com HS256, expira em `JWT_ACCESS_EXPIRES_IN` (default `15m`).
Refresh token e cookie httpOnly chegam na próxima fase.

| Método | Rota             | Body                         | Sucesso                     | Erros                                         |
| ------ | ---------------- | ---------------------------- | --------------------------- | --------------------------------------------- |
| GET    | `/health`        | —                            | `200 { status: 'ok' }`      | —                                             |
| POST   | `/auth/register` | `{ email, password, name? }` | `201 { user, accessToken }` | `400` validação · `409` e-mail já registrado  |
| POST   | `/auth/login`    | `{ email, password }`        | `200 { user, accessToken }` | `400` validação · `401` credenciais inválidas |

Regras de validação (class-validator):

- `email` — `IsEmail`
- `password` — string, 8–72 caracteres (bcrypt trunca em 72)
- `name` (opcional no register) — string, max 80 caracteres

Senha guardada com bcrypt (10 rounds). Mensagem `invalid credentials` é a mesma para
"usuário não existe" e "senha errada" — evita enumeração de contas.
