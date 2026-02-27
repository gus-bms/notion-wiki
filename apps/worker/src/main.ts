import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  const port = Number(process.env.WORKER_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
