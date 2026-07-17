import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_EMAIL = 'e2e@authbp.local';
const TEST_PASSWORD = 'e2e-password-123';

function extractRefreshCookie(res: Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = cookies.find((c) => c.startsWith('refreshToken='));
  return cookie ? cookie.match(/refreshToken=([^;]+)/)?.[1] : undefined;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  });

  describe('public endpoints', () => {
    it('GET /health returns ok', async () => {
      const res = await request(server).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /auth/google returns 501 when OAuth is not configured', () => {
      return request(server).get('/auth/google').expect(501);
    });
  });

  describe('register', () => {
    it('creates a user with role USER and returns tokens + cookie', async () => {
      const res = await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD, name: 'Tester' })
        .expect(201);

      expect(res.body.user).toMatchObject({
        email: TEST_EMAIL,
        role: 'USER',
        name: 'Tester',
      });
      expect(res.body.accessToken).toMatch(/^ey/);
      expect(extractRefreshCookie(res)).toBeDefined();
    });

    it('rejects duplicate email with 409', async () => {
      await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(201);

      const dup = await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(409);
      expect(dup.body.message).toContain('already registered');
    });

    it('rejects short password with 400', async () => {
      const res = await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: 'short' })
        .expect(400);
      expect(Array.isArray(res.body.message)).toBe(true);
      expect(res.body.message.join(' ')).toMatch(/password/i);
    });

    it('rejects invalid email with 400', async () => {
      return request(server)
        .post('/auth/register')
        .send({ email: 'not-an-email', password: TEST_PASSWORD })
        .expect(400);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    });

    it('returns tokens with correct credentials', async () => {
      const res = await request(server)
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toMatch(/^ey/);
      expect(res.body.user.email).toBe(TEST_EMAIL);
      expect(extractRefreshCookie(res)).toBeDefined();
    });

    it('returns 401 for wrong password', async () => {
      const res = await request(server)
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: 'wrong-password' })
        .expect(401);
      expect(res.body.message).toBe('invalid credentials');
    });

    it('returns 401 for nonexistent email with the same message (no enumeration)', async () => {
      const res = await request(server)
        .post('/auth/login')
        .send({ email: 'ghost@nowhere.local', password: TEST_PASSWORD })
        .expect(401);
      expect(res.body.message).toBe('invalid credentials');
    });
  });

  describe('protected /auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      const reg = await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      accessToken = reg.body.accessToken;
    });

    it('returns 401 without an access token', () => {
      return request(server).get('/auth/me').expect(401);
    });

    it('returns the user with a valid Bearer', async () => {
      const res = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.email).toBe(TEST_EMAIL);
      expect(res.body.role).toBe('USER');
    });
  });

  describe('refresh + logout', () => {
    let cookieAtRegister: string;

    beforeEach(async () => {
      const reg = await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const c = extractRefreshCookie(reg);
      if (!c) throw new Error('register did not set refresh cookie');
      cookieAtRegister = c;
    });

    it('returns 401 without a refresh cookie', () => {
      return request(server).post('/auth/refresh').expect(401);
    });

    it('rotates the refresh cookie and rejects the old one', async () => {
      // Small delay so the new refresh JWT has a strictly-later iat and differs
      // from the original (otherwise identical payload+secret+iat → identical JWT).
      await new Promise((r) => setTimeout(r, 1100));

      const rotate = await request(server)
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${cookieAtRegister}`)
        .expect(200);
      expect(rotate.body.accessToken).toMatch(/^ey/);

      const newCookie = extractRefreshCookie(rotate);
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(cookieAtRegister);

      // Old cookie must be rejected now
      await request(server)
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${cookieAtRegister}`)
        .expect(401);

      // New cookie still works
      await request(server)
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${newCookie}`)
        .expect(200);
    });

    it('logout clears the cookie and nulls the stored hash', async () => {
      const login = await request(server)
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const cookie = extractRefreshCookie(login);
      const accessToken = login.body.accessToken;
      expect(cookie).toBeDefined();

      const logout = await request(server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Set-Cookie with Max-Age past / empty value
      const cleared = (logout.headers['set-cookie'] as string[] | undefined)?.find((c) =>
        c.startsWith('refreshToken='),
      );
      expect(cleared).toMatch(/refreshToken=;/);

      // Same cookie value should now be rejected (hash was nulled)
      await request(server)
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${cookie}`)
        .expect(401);
    });
  });

  describe('roles guard', () => {
    let userAccessToken: string;

    beforeEach(async () => {
      const reg = await request(server)
        .post('/auth/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      userAccessToken = reg.body.accessToken;
    });

    it('403 when USER hits /auth/admin/stats', async () => {
      const res = await request(server)
        .get('/auth/admin/stats')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(403);
      expect(res.body.message).toMatch(/ADMIN/);
    });

    it('200 after DB promotion + re-login', async () => {
      await prisma.user.update({
        where: { email: TEST_EMAIL },
        data: { role: 'ADMIN' },
      });

      const login = await request(server)
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const adminToken = login.body.accessToken;

      const res = await request(server)
        .get('/auth/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(typeof res.body.userCount).toBe('number');
      expect(typeof res.body.adminCount).toBe('number');
      expect(res.body.adminCount).toBeGreaterThanOrEqual(1);
    });
  });
});
