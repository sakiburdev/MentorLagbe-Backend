import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from 'mongodb';
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { toNodeHandler } from "better-auth/node";

const app = express();
const port = process.env.PORT || 5000;


// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URL);
await client.connect();
console.log("Successfully connected to the MongoDB Database.");
const db = client.db("MentorLagbe");

// Four collection
const usersCollection = db.collection("users");
const tuitionsCollection = db.collection("tuitions");
const applicationsCollection = db.collection("applications");
const paymentsCollection = db.collection("payments");

// One application per student per tuition
await applicationsCollection.createIndex(
  { tuitionId: 1, studentEmail: 1 },
  { unique: true }
);

// user, session manage
const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.CLIENT_URL],

  emailAndPassword: { enabled: true },

  user: {
    modelName: "users",
    additionalFields: {
      role: { type: "string", defaultValue: "student", input: true },
      plan: { type: "string", defaultValue: "free", input: false },
      phone: { type: "string", required: false },
      bio: { type: "string", required: false },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const role = user.role === "tutor" ? "tutor" : "student";
          return { data: { ...user, role, plan: "free" } };
        },
      },
    },
  },
});















app.get("/", (req, res) => {
  res.send({
    message: "MentorLagbe Server is Running.",
  });
});

// Start Server
app.listen(port, () => {
  console.log(`MentorLagbe Server is Running ${port}`);
});
