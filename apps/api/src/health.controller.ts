import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  getHealth(): { ok: boolean; now: string } {
    return {
      ok: true,
      now: new Date().toISOString()
    };
  }
}
