const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
app.use(bodyParser.json());

let referencesData = [];

// Load CSV function
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

// Webhook for Dialogflow CX
app.post("/webhook", async (req, res) => {
  console.log("🔹 Full Request Body Received:", JSON.stringify(req.body, null, 2));

  // Introduce a delay to allow Dialogflow CX to populate the knowledge answer
  setTimeout(() => {
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

    // Fallback: Use the raw query if knowledge answer is still missing
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

    // Normalize knowledge answer for better matching
    const answerLc = knowledgeAnswer.toLowerCase().replace(/[^\w\s]/g, "");

    // Match against CSV
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

    // Limit to 3 references
    const topThree = matchingReferences.slice(0, 3);
    let referenceBlock = "Reference\n";
    topThree.forEach((row, index) => {
      referenceBlock += `${index + 1}.[${row.Link}] - ${row.APA}\n\n`;
    });

    return res.json({
      fulfillment_response: {
        messages: [{ text: { text: [referenceBlock] } }],
      },
    });
  }, 700); // **Introduced a 400ms delay**
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
