const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
app.use(bodyParser.json());

const bucketName = "zydus_faq"; // Your GCS bucket

let referencesData = [];

/**
 * Load CSV data into memory (with Folder Name Handling)
 */
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream("references.csv")
      .pipe(csv())
      .on("data", (row) => {
        results.push({
          FolderName: row["Folder Name"]?.trim() || "", // Ensure folder is captured
          Sn: row["Sn."]?.trim() || "",
          Paper: row["Paper"]?.trim() || "",
          APA: row["APA"]?.trim() || "",
          Link: row["Link"]?.trim() || "",
        });
      })
      .on("end", () => {
        referencesData = results;
        console.log(`✅ Loaded ${referencesData.length} references from CSV.`);
        resolve();
      })
      .on("error", (err) => reject(err));
  });
}

/**
 * Webhook for Dialogflow CX (Now Dynamically Handles Folders)
 */
app.post("/webhook", async (req, res) => {
  console.log("🔹 Full Request Body:", JSON.stringify(req.body, null, 2));

  let knowledgeAnswer = "";

  // Try extracting knowledge answer from multiple locations
  if (
    req.body.sessionInfo &&
    req.body.sessionInfo.parameters &&
    req.body.sessionInfo.parameters["$request.knowledge.answers[0]"]
  ) {
    knowledgeAnswer = req.body.sessionInfo.parameters["$request.knowledge.answers[0]"];
  } else if (
    req.body.queryResult &&
    req.body.queryResult.knowledgeAnswers &&
    req.body.queryResult.knowledgeAnswers.answers &&
    req.body.queryResult.knowledgeAnswers.answers.length > 0
  ) {
    knowledgeAnswer = req.body.queryResult.knowledgeAnswers.answers[0].answer;
  }

  // Fallback to user query if needed
  if (!knowledgeAnswer) {
    if (req.body.textPayload) {
      knowledgeAnswer = req.body.textPayload;
    } else if (req.body.query) {
      knowledgeAnswer = req.body.query;
    } else if (
      req.body.sessionInfo &&
      req.body.sessionInfo.parameters &&
      req.body.sessionInfo.parameters.queryText
    ) {
      knowledgeAnswer = req.body.sessionInfo.parameters.queryText;
    }
  }

  console.log("🔍 Extracted Knowledge Answer (or fallback query):", knowledgeAnswer);

  if (!knowledgeAnswer) {
    return res.json({
      fulfillment_response: {
        messages: [{ text: { text: ["No relevant references found."] } }],
      },
    });
  }

  // Normalize query for better matching
  const answerLc = knowledgeAnswer.toLowerCase().replace(/[^\w\s]/g, "");

  // Filter CSV references based on query
  const matchingReferences = referencesData.filter((row) => {
    const paperLc = row.Paper.toLowerCase().replace(/[^\w\s]/g, "");
    const apaLc = row.APA.toLowerCase().replace(/[^\w\s]/g, "");
    return answerLc.split(" ").some((word) => paperLc.includes(word) || apaLc.includes(word));
  });

  console.log("✅ Found matching references:", matchingReferences.length);

  if (matchingReferences.length === 0) {
    return res.json({
      fulfillment_response: {
        messages: [{ text: { text: [`No relevant references found for: "${knowledgeAnswer}".`] } }],
      },
    });
  }

  // Select up to 3 references
  const topThree = matchingReferences.slice(0, 3);
  let referenceBlock = "Reference\n";

  topThree.forEach((row, index) => {
    let fileName = row.Link;
    let folder = row.FolderName || "ADD"; // Default to ADD if missing

    // Construct correct GCS URL
    let gcsUrl = fileName.startsWith("http")
      ? fileName // If link is already a URL, use it
      : `https://storage.googleapis.com/${bucketName}/${folder}/${encodeURIComponent(fileName)}`;

    referenceBlock += `${index + 1}.[${gcsUrl}] - ${row.APA}\n\n`;
  });

  console.log("📄 Constructed reference block:\n", referenceBlock);

  return res.json({
    fulfillment_response: {
      messages: [{ text: { text: [referenceBlock] } }],
    },
  });
});

// Cloud Run Port
const PORT = process.env.PORT || 8080;
loadCSV()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to load CSV:", err);
    process.exit(1);
  });
