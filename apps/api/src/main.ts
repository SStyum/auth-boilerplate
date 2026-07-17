import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: webOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('API_PORT', 3000);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
