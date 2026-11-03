import { FastifyError, FastifyInstance } from "fastify";
import { OTelLogger } from "./OTelContext";

const logger = OTelLogger().createModuleLogger("error-handler");

function ErrorStatusCode(error: FastifyError, replyStatusCode: number): number {
  const statusCode = Number(error?.statusCode);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    return statusCode;
  }
  if (replyStatusCode >= 400 && replyStatusCode <= 599) {
    return replyStatusCode;
  }
  return 500;
}

/**
 * Global Fastify error handler: unexpected failures are logged with their
 * detail and answered with a generic body, while intentional 4xx messages are
 * preserved. Internal messages, paths and stacks never reach the client.
 */
export function RegisterErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler<FastifyError>((error, req, reply) => {
    const statusCode = ErrorStatusCode(error, reply.statusCode);
    const detail = error?.message || String(error);
    logger.error(`${req.method} ${req.url} failed (${statusCode}): ${detail}`, error);
    req.log.error({ err: error, statusCode }, "Request failed");
    if (reply.sent) {
      return;
    }
    if (statusCode >= 500) {
      return reply.status(statusCode).send({ error: "Internal Server Error" });
    }
    return reply
      .status(statusCode)
      .send({ error: error?.message || "Request failed" });
  });
}
