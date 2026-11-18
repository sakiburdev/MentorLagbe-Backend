import express from "express";
import "dotenv/config";
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.PORT || 8000;


// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URL);

await client.connect();

console.log("Successfully connected to the MongoDB Database.");

const db = client.db("MentorLagbe");


app.get("/", (req, res) => {
  res.send({
    message: "MentorLagbe Server is Running.",
  });
});


// Start Server
app.listen(port, () => {
  console.log(`MentorLagbe Server is Running ${port}`);
});
