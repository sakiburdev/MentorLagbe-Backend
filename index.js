import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from 'mongodb';

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











app.get("/", (req, res) => {
  res.send({
    message: "MentorLagbe Server is Running.",
  });
});

// Start Server
app.listen(port, () => {
  console.log(`MentorLagbe Server is Running ${port}`);
});
