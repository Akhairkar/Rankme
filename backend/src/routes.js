// Registry of module routes and scheduled jobs. Each module owns its file and exports
// `routes` (see router.js) and optionally `jobs`: [{ name, run(env) }] executed by the hourly cron.
import * as google from "./google.js";
import * as billing from "./billing.js";
import * as audit from "./audit.js";
import * as rank from "./rank.js";
import * as crawler from "./crawler.js";
import * as platform from "./platform.js";

const mods = [google, billing, audit, rank, crawler, platform];
export const routes = mods.flatMap((m) => m.routes || []);
export const jobs = mods.flatMap((m) => m.jobs || []);
