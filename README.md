# Auth Boilerplate

Autenticação completa: JWT, Refresh Token e OAuth com Google.
Pronto para ser clonado e adaptado em novos projetos.

## Funcionalidades

- [ ] Registro e login com e-mail/senha
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
