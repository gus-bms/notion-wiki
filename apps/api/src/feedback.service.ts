import { BadRequestException, Injectable } from "@nestjs/common";
import { feedbackSchema } from "@notion-wiki/contracts";
import { prisma } from "@notion-wiki/db";

@Injectable()
export class FeedbackService {
  async createFeedback(input: unknown): Promise<{ ok: true }> {
    const parsed = feedbackSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await prisma.feedback.create({
      data: {
        messageId: parsed.data.messageId,
        score: parsed.data.score,
        reason: parsed.data.reason
      }
    });

    return { ok: true };
  }
}
