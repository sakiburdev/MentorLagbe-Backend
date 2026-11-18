import express from "express";


const app = express();
const port = process.env.PORT || 8000;



app.get("/", (req, res) => {
  res.send({
    message: "MentorLagbe Server is Running.",
  });
});

// Start Server
app.listen(port, () => {
  console.log(`MentorLagbe Server is Running ${port}`);
});
