const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
app.use(bodyParser.json());

// Cloud Storage bucket config (if required)
const bucketName = "zydus_faq"; // Replace with your actual bucket name
const folderName = "ADD"; // Replace if files are in a different folder

let referencesData = [];

/**
 * Loads CSV file into memory.
 * The CSV should have columns: "Folder Name", "Sn.", "Paper", "APA", "Link".
 */
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream("references.csv")
      .pipe(csv())
      .on("data", (row) => {
        const cleanedRow = {};
        Object.keys(row).forEach((key) => {
          cleanedRow[key.trim()] = row[key] ? row[key].trim() : "";
        });

        results.push({
          FolderName: cleanedRow["Folder Name"] || "",
          Sn: cleanedRow["Sn."] || "",
          Paper: cleanedRow["Paper"] || "",
          APA: cleanedRow["APA"] || "",
          Link: cleanedRow["Link"] || "",
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
 * Webhook endpoint for Dialogflow CX.
 * Extracts the knowledge answer OR falls back to the raw user query.
 */
app.post("/webhook", async (req, res) => {
  console.log("🔹 Full Request Body:", JSON.stringify(req.body, null, 2));

  // 1️⃣ Try to get knowledge answer from multiple locations
  let knowledgeAnswer = "";
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

  // 2️⃣ If the knowledge answer is missing, use the raw query
  if (!knowledgeAnswer) {
    console.log("⚠️ No knowledge answer found. Using raw user query.");
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

  // Normalize knowledge answer: convert to lowercase and remove punctuation
  const answerLc = knowledgeAnswer.toLowerCase().replace(/[^\w\s]/g, "");

  // 3️⃣ Perform fuzzy matching against references
  const matchingReferences = referencesData.filter((row) => {
    const paperLc = row.Paper.toLowerCase().replace(/[^\w\s]/g, "");
    const apaLc = row.APA.toLowerCase().replace(/[^\w\s]/g, "");
    return answerLc.split(" ").some((word) => paperLc.includes(word) || apaLc.includes(word));
  });

  console.log("✅ Found matching references:", matchingReferences.length);

  if (matchingReferences.length === 0) {
    console.log("⚠️ No matching references found for:", knowledgeAnswer);
    return res.json({
      fulfillment_response: {
        messages: [{ text: { text: [`No relevant references found for: "${knowledgeAnswer}".`] } }],
      },
    });
  }

  // 4️⃣ Limit results to top 3
  const topThree = matchingReferences.slice(0, 3);
  let referenceBlock = "Reference\n";
  topThree.forEach((row, index) => {
    const fileName = row.Link;
    const gcsUrl = fileName
      ? `https://storage.googleapis.com/${bucketName}/${folderName}/${encodeURIComponent(fileName)}`
      : "[No Link Found]";
    referenceBlock += `${index + 1}.[${gcsUrl}] - ${row.APA}\n\n`;
  });

  console.log("📄 Constructed reference block:\n", referenceBlock);

  return res.json({
    fulfillment_response: {
      messages: [{ text: { text: [referenceBlock] } }],
    },
  });
});

// Ensure Cloud Run listens on PORT 8080
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
