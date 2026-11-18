import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from 'mongodb';
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { toNodeHandler } from "better-auth/node";

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

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

// BetterAuth route
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());


// Tutor
app.post("/tuitions", async (req, res) => {
  const tuition = req.body;

  const tutor = await usersCollection.findOne({ email: tuition.tutorEmail });
  if (!tutor) {
    return res.status(404).send({
        message: "Tutor not found"
    });
  }

  if (tutor.plan === "free") {
    const count = await tuitionsCollection.countDocuments({
      tutorEmail: tuition.tutorEmail,
    });

    if (count >= 2) {
      return res.status(403).send({
        message: "Free plan limit reached. Upgrade to Pro for unlimited posts.",
      });
    }
  }

  const newTuition = {
    ...tuition,
    monthlyFee: Number(tuition.monthlyFee),
    daysPerWeek: Number(tuition.daysPerWeek),
    approvalStatus: "pending",
    isActive: true,
    createdAt: new Date(),
  };

  const result = await tuitionsCollection.insertOne(newTuition);
  res.status(201).send(result);
});


app.get("/tuitions", async (req, res) => {
  const { search, subject, classLevel, mode } = req.query;

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 6;

  const query = { approvalStatus: "approved", isActive: true };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
    ];
  }

  if (subject) query.subject = subject;
  if (classLevel) query.classLevel = classLevel;
  if (mode) query.mode = mode;

  const total = await tuitionsCollection.countDocuments(query);

  const tuitions = await tuitionsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  res.send({
    tuitions,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
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
