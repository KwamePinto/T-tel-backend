import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri, {
    dbName: env.dbName,
    serverSelectionTimeoutMS: 15000,
  });
  console.log(`[db] connected to ${mongoose.connection.name}`);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.connection.close();
}
