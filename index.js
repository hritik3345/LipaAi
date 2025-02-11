const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
app.use(bodyParser.json());

// Configuration for Google Cloud Storage URL generation (if needed)
const bucketName = "zydus_faq";    // Replace with your bucket name
const folderName = "ADD";          // Replace if files are in a different folder

// Global storage for CSV data
let referencesData = [];

/**
 * Loads CSV file into memory.
 * The CSV is expected to have columns: "Folder Name", "Sn.", "Paper", "APA", "Link".
 * This function trims keys and values to avoid spacing issues.
 */
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('references.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Clean keys and values
        const cleanedRow = {};
        Object.keys(row).forEach(key => {
          cleanedRow[key.trim()] = row[key] ? row[key].trim() : "";
        });
        results.push({
          FolderName: cleanedRow['Folder Name'] || '',
          Sn: cleanedRow['Sn.'] || '',
          Paper: cleanedRow['Paper'] || '',
          APA: cleanedRow['APA'] || '',
          Link: cleanedRow['Link'] || '',
        });
      })
      .on('end', () => {
        referencesData = results;
        console.log(`✅ Loaded ${referencesData.length} references from CSV.`);
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

/**
 * Webhook endpoint for Dialogflow CX.
 * 
 * This version first attempts to extract the knowledge answer from:
 *   - req.body.sessionInfo.parameters['$request.knowledge.answers[0]']
 *   - req.body.queryResult.knowledgeAnswers.answers[0].answer
 * If those are empty (which may be the case when not using intents),
 * then it falls back to the user's raw query text (e.g. req.body.query or sessionInfo.parameters.queryText).
 *
 * It then normalizes the answer and uses fuzzy matching to find up to 3 relevant references.
 * Finally, it returns a response formatted as:
 *
 * Reference 
 * 1.[Link] - Reference APA
 *
 * 2.[Link] - Reference APA
 *
 * 3.[Link] - Reference APA
 */
app.post('/webhook', async (req, res) => {
  console.log("🔹 Full Request Body:", JSON.stringify(req.body, null, 2));

  // Attempt to extract the knowledge answer from various locations:
  let knowledgeAnswer = "";
  if (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters['$request.knowledge.answers[0]']) {
    knowledgeAnswer = req.body.sessionInfo.parameters['$request.knowledge.answers[0]'];
  } else if (req.body.queryResult && req.body.queryResult.knowledgeAnswers && req.body.queryResult.knowledgeAnswers.answers && req.body.queryResult.knowledgeAnswers.answers.length > 0) {
    knowledgeAnswer = req.body.queryResult.knowledgeAnswers.answers[0].answer;
  }

  // Fallback: If no knowledge answer is provided, use the raw query text.
  if (!knowledgeAnswer) {
    if (req.body.query) {
      knowledgeAnswer = req.body.query;
    } else if (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.queryText) {
      knowledgeAnswer = req.body.sessionInfo.parameters.queryText;
    }
  }
  
  console.log("🔍 Extracted Knowledge Answer (or fallback query):", knowledgeAnswer);

  if (!knowledgeAnswer) {
    return res.json({
      fulfillment_response: {
        messages: [
          { text: { text: ['No relevant references found. (Missing Knowledge Answer)'] } }
        ]
      }
    });
  }

  // Normalize the knowledge answer: lowercase and remove punctuation
  const answerLc = knowledgeAnswer.toLowerCase().replace(/[^\w\s]/g, "");
  console.log("Normalized knowledge answer:", answerLc);

  // Fuzzy matching: split answer into words (ignoring very short words) and check if any appear in Paper or APA fields.
  const matchingReferences = referencesData.filter((row) => {
    const paperLc = row.Paper.toLowerCase().replace(/[^\w\s]/g, "");
    const apaLc = row.APA.toLowerCase().replace(/[^\w\s]/g, "");
    const words = answerLc.split(" ").filter(word => word.length > 1);
    return words.some(word => paperLc.includes(word) || apaLc.includes(word));
  });
  
  console.log("Found matching references:", matchingReferences.length);
  
  if (matchingReferences.length === 0) {
    console.log("⚠️ No matching references found for:", knowledgeAnswer);
    return res.json({
      fulfillment_response: {
        messages: [
          { text: { text: [`No relevant references found for: "${knowledgeAnswer}".`] } }
        ]
      }
    });
  }

  // Limit results to the top 3 matches
  const topThree = matchingReferences.slice(0, 3);
  let referenceBlock = 'Reference\n';
  topThree.forEach((row, index) => {
    // If your CSV stores only filenames, convert them to full GCS URLs.
    // If your CSV already contains full URLs, you can simply use row.Link.
    const fileName = row.Link;
    const gcsUrl = fileName ? `https://storage.googleapis.com/${bucketName}/${folderName}/${encodeURIComponent(fileName)}` : '[No Link Found]';
    referenceBlock += `${index + 1}.[${gcsUrl}] - ${row.APA}\n\n`;
  });
  
  console.log("Constructed reference block:\n", referenceBlock);

  return res.json({
    fulfillment_response: {
      messages: [
        { text: { text: [referenceBlock] } }
      ]
    }
  });
});

// Cloud Run expects the container to listen on PORT 8080
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
