import { expect } from "chai";
import { Controller, Get, Res } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Response } from "express";
import { Logger, LoggerModule } from "nestjs-pino";
import supertest from "supertest";
import { createLoggerConfig } from "@shared-logger";

@Controller("test-log")
class LogController {
  constructor(private readonly logger: Logger) {}

  @Get()
  logRequest(@Res({ passthrough: true }) response: Response) {
    response.setHeader(
      "Set-Cookie",
      "access_token=fake-response-token; HttpOnly",
    );
    this.logger.error("Provider error during request");
    return { ok: true };
  }
}

describe("Shared HTTP logger redaction", () => {
  it("removes session cookies from error and response logs", async () => {
    const lines: string[] = [];
    const { pinoHttp } = createLoggerConfig();
    const module = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [
            { ...pinoHttp, transport: undefined },
            { write: (line: string) => lines.push(line) },
          ],
        }),
      ],
      controllers: [LogController],
    }).compile();
    const app = module.createNestApplication();

    try {
      await app.init();
      const response = await supertest(app.getHttpServer())
        .get("/test-log")
        .set(
          "Cookie",
          "access_token=fake-access-token; refresh_token=fake-refresh-token",
        )
        .set("Authorization", "Bearer fake-authorization-token")
        .expect(200);

      expect(response.headers["set-cookie"]).to.deep.equal([
        "access_token=fake-response-token; HttpOnly",
      ]);
      const output = lines.join("\n");
      expect(output).to.include("Provider error during request");
      expect(output).to.include("request completed");
      expect(output).to.include("/test-log");
      for (const value of [
        '"cookie"',
        '"set-cookie"',
        '"authorization"',
        "fake-access-token",
        "fake-refresh-token",
        "fake-response-token",
        "fake-authorization-token",
      ]) {
        expect(output).not.to.include(value);
      }
    } finally {
      await app.close();
    }
  });
});
