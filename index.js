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


// Tuition
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


app.get("/tuitions/featured", async (req, res) => {

  const tuitions = await tuitionsCollection
    .find({ approvalStatus: "approved", isActive: true })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();
  res.send(tuitions);
});

// tuition details
app.get("/tuitions/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
        message: "Invalid tuition id"
    });
  }

  const tuition = await tuitionsCollection.findOne({ _id: new ObjectId(id) });
  if (!tuition) {
    return res.status(404).send({
        message: "Tuition not found"
    });
  }
  res.send(tuition);
});


app.get("/tutor/tuitions", async (req, res) => {
  const { email } = req.query;

  const tuitions = await tuitionsCollection
    .find({ tutorEmail: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(tuitions);
});

// update
app.patch("/tuitions/:id", async (req, res) => {
  const body = req.body;

  const updatedDoc = {
    title: body.title,
    subject: body.subject,
    classLevel: body.classLevel,
    mode: body.mode,
    location: body.location,
    monthlyFee: Number(body.monthlyFee),
    daysPerWeek: Number(body.daysPerWeek),
    bannerImage: body.bannerImage,
    description: body.description,
  };

  const result = await tuitionsCollection.updateOne(

    { _id: new ObjectId(req.params.id) },
    { $set: updatedDoc }
  );

  res.send(result);
});

// Active / Closed
app.patch("/tuitions/:id/toggle", async (req, res) => {

  const { isActive } = req.body;
  const result = await tuitionsCollection.updateOne(

    { _id: new ObjectId(req.params.id) },
    { $set: { isActive } }
  );

  res.send(result);
});

// delete
app.delete("/tuitions/:id", async (req, res) => {

  const result = await tuitionsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});



// Application
app.post("/applications", async (req, res) => {
  const data = req.body;

  const student = await usersCollection.findOne({ email: data.studentEmail });

  if (!student || student.role !== "student") {
    return res.status(403).send({
        message: "Only students can apply"
    });
  }

  const tuition = await tuitionsCollection.findOne({
    _id: new ObjectId(data.tuitionId),
  });

  if (!tuition) {
    return res.status(404).send({
        message: "Tuition not found"
    });
  }

  const alreadyApplied = await applicationsCollection.findOne({
    tuitionId: data.tuitionId,
    studentEmail: data.studentEmail,
  });

  if (alreadyApplied) {
    return res.status(409).send({
        message: "You already applied for this tuition"
    });
  }

  const application = {
    tuitionId: data.tuitionId,
    tuitionTitle: tuition.title,
    subject: tuition.subject,
    monthlyFee: tuition.monthlyFee,
    tutorName: tuition.tutorName,
    tutorEmail: tuition.tutorEmail,
    studentName: data.studentName,
    studentEmail: data.studentEmail,
    studentPhone: data.studentPhone,
    preferredSchedule: data.preferredSchedule,
    studentNote: data.studentNote,
    status: "pending",
    appliedAt: new Date(),
  };

  const result = await applicationsCollection.insertOne(application);
  res.status(201).send(result);
});

app.get("/applications/my", async (req, res) => {
  const { email } = req.query;

  const applications = await applicationsCollection
    .find({ studentEmail: email })
    .sort({ appliedAt: -1 })
    .toArray();
  res.send(applications);
});

app.delete("/applications/:id", async (req, res) => {

  const result = await applicationsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
    status: "pending",
  });

  if (result.deletedCount === 0) {
    return res
      .status(400)
      .send({ message: "Only pending applications can be cancelled" });
  }
  res.send(result);
});


app.get("/applications/tutor", async (req, res) => {
  const { email } = req.query;

  const applications = await applicationsCollection
    .find({ tutorEmail: email })
    .sort({ appliedAt: -1 })
    .toArray();
  res.send(applications);
});

// accept / reject
app.patch("/applications/:id", async (req, res) => {
  const { status } = req.body;

  // accepted, rejected allow
  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).send({
        message: "Invalid status"
    });
  }

  const result = await applicationsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status } }
  );

  res.send(result);
});


// Admin
app.get("/admin/tuitions", async (req, res) => {

  const tuitions = await tuitionsCollection
    .find()
    .sort({ createdAt: -1 })
    .toArray();
  res.send(tuitions);
});

// approve / reject
app.patch("/admin/tuitions/:id", async (req, res) => {
  const { approvalStatus } = req.body;

  if (!["approved", "rejected"].includes(approvalStatus)) {

    return res.status(400).send({
        message: "Invalid status"
    });
  }

  const result = await tuitionsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { approvalStatus } }
  );

  res.send(result);
});

// user
app.get("/admin/users", async (req, res) => {
  const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(users);
});

// User role
app.patch("/admin/users/:id/role", async (req, res) => {
  const { role } = req.body;

  if (!["student", "tutor", "admin"].includes(role)) {
    return res.status(400).send({
        message: "Invalid role"
    });
  }

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { role } }
  );

  res.send(result);
});


app.get("/admin/transactions", async (req, res) => {
  const payments = await paymentsCollection
    .find()
    .sort({ paidAt: -1 })
    .toArray();
  res.send(payments);
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
