const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
app.use(bodyParser.json());

const bucketName = "zydus_faq"; // Your GCS bucket

let referencesData = [];

/**
 * Load CSV Data (Paper → Link Mapping)
 */
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream("references.csv")
      .pipe(csv())
      .on("data", (row) => {
        results.push({
          FolderName: row["Folder Name"]?.trim() || "",
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

  // Extract knowledge base answer title
  if (
    req.body.sessionInfo &&
    req.body.sessionInfo.parameters &&
    req.body.sessionInfo.parameters["request.knowledge.answers[0]"]
  ) {
    knowledgeTitle = req.body.sessionInfo.parameters["request.knowledge.answers[0]"].title || "";
    knowledgeUri = req.body.sessionInfo.parameters["request.knowledge.answers[0]"].uri || "";
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
  const matchedReferences = referencesData
    .filter((row) => row.Paper.toLowerCase().replace(/[^\w\s]/g, "") === titleLc)
    .slice(0, 3); // Limit to 3 references

  if (matchedReferences.length === 0) {
    return res.json({
      fulfillment_response: {
        messages: [{ text: { text: [`No relevant references found for: "${knowledgeTitle}".`] } }],
      },
    });
  }

  let referenceBlock = "Reference\n";

  matchedReferences.forEach((ref, index) => {
    let gcsUrl = ref.Link.startsWith("http")
      ? ref.Link // If link is already a URL, use it
      : `https://storage.googleapis.com/${bucketName}/${ref.FolderName}/${encodeURIComponent(ref.Link)}`;

    referenceBlock += `${index + 1}.[${gcsUrl}] - ${ref.APA}\n\n`;
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
