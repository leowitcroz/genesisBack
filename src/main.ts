import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Remove campos que não estão no DTO
    forbidNonWhitelisted: true, // Retorna erro se enviarem campos extras
    transform: true, // Converte tipos automaticamente (ex: string para number)
  }));

  app.enableCors({
    origin: [
      'http://localhost:5173', 
      /^http:\/\/(.*)\.localhost:5173$/,
      /^https:\/\/(.*)\.genesis\.com$/ 
    ], 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Permite o envio de cookies/headers customizados (essencial para o nosso SaaS)
    allowedHeaders: 'Content-Type, Accept, Authorization, x-tenant-id', // Libera o nosso header do SaaS!
  });

  await app.listen(3000);
}
bootstrap();
