import { Body, Controller, Post } from "@nestjs/common";
import { FeedbackService } from "./feedback.service";

@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  async createFeedback(@Body() body: unknown): Promise<{ ok: true }> {
    return this.feedbackService.createFeedback(body);
  }
}
