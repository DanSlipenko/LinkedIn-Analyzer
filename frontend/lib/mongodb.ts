import { MongoClient, Db } from "mongodb";
import { config } from "dotenv";
import path from "path";

// Load .env from project root (parent of frontend/)
config({ path: path.resolve(process.cwd(), "../.env") });

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set in ../.env");
}

const DB_NAME = "LinkedIn_Posts";

let cachedClient: MongoClient | null = null;

async function getClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri!);
  await client.connect();
  cachedClient = client;
  return client;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}
