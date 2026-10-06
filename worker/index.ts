import handler from "vinext/server/app-router-entry";
import { drainJobs } from "../lib/jobs/runner";
const worker = {
  fetch(request: Request, env: { ASSETS?: Fetcher }, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  scheduled(
    _controller: ScheduledController,
    _env: { ASSETS?: Fetcher },
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(drainJobs(3));
  },
};

export default worker;
