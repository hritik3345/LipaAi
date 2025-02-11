const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
app.use(bodyParser.json());

const bucketName = "zydus_faq"; // Your Google Cloud Storage bucket

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
          FolderName: row["Folder Name"]?.trim() || "", // Folder name handling
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
 * Webhook for Dialogflow CX (Match Paper Title with CSV and Extract Link)
 */
app.post("/webhook", async (req, res) => {
  console.log("🔹 Full Request Body:", JSON.stringify(req.body, null, 2));

  let knowledgeTitle = "";
  let knowledgeUri = "";

  // Extract knowledge base title and URI (if available)
  if (
    req.body.queryResult &&
    req.body.queryResult.knowledgeAnswers &&
    req.body.queryResult.knowledgeAnswers.answers &&
    req.body.queryResult.knowledgeAnswers.answers.length > 0
  ) {
    knowledgeTitle = req.body.queryResult.knowledgeAnswers.answers[0].answer || "";
    knowledgeUri = req.body.queryResult.knowledgeAnswers.answers[0].uri || "";
  }

  console.log("🔍 Extracted Knowledge Answer Title:", knowledgeTitle);
  console.log("🔗 Extracted Knowledge Answer URI:", knowledgeUri);

  if (!knowledgeTitle) {
    return res.json({
      fulfillment_response: {
        messages: [{ text: { text: ["No relevant references found."] } }],
      },
    });
  }

  // Normalize title for better matching
  const titleLc = knowledgeTitle.toLowerCase().replace(/[^\w\s]/g, "");

  // Find exact match from CSV
  const matchedReference = referencesData.find((row) => {
    return row.Paper.toLowerCase().replace(/[^\w\s]/g, "") === titleLc;
  });

  if (!matchedReference) {
    return res.json({
      fulfillment_response: {
        messages: [{ text: { text: [`No relevant references found for: "${knowledgeTitle}".`] } }],
      },
    });
  }

  let fileName = matchedReference.Link;
  let folder = matchedReference.FolderName || "ADD"; // Default to ADD if missing

  // Construct correct GCS URL
  let gcsUrl = fileName.startsWith("http")
    ? fileName // If link is already a URL, use it
    : `https://storage.googleapis.com/${bucketName}/${folder}/${encodeURIComponent(fileName)}`;

  let referenceBlock = `Reference\n1.[${gcsUrl}] - ${matchedReference.Paper}\n\n`;

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
