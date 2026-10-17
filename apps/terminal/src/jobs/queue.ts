import { Queue } from "bullmq";
import { Redis } from "ioredis";

export function createRedisConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
}

export function createQueue(name: string, url: string): Queue {
  return new Queue(name, { connection: createRedisConnection(url) });
}
