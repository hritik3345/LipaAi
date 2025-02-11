const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');
const { Storage } = require('@google-cloud/storage');

const app = express();
app.use(bodyParser.json());

// GCS Configuration
const bucketName = "zydus_faq"; // 🔹 Change this to your actual bucket name
const folderName = "ADD"; // 🔹 Change if files are in a different folder

// Store CSV data in memory
let referencesData = [];

/**
 * Load CSV file into memory at startup.
 */
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('references.csv')
      .pipe(csv())
      .on('data', (row) => {
        results.push({
          FolderName: row['Folder Name']?.trim() || '',
          Sn: row['Sn.']?.trim() || '',
          Paper: row['Paper']?.trim() || '',
          APA: row['APA']?.trim() || '',
          Link: row['Link']?.trim() || '',
        });
      })
      .on('end', () => {
        referencesData = results;
        console.log(`Loaded ${referencesData.length} references.`);
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

/**
 * Webhook for Dialogflow CX
 */
app.post('/webhook', async (req, res) => {
  try {
    // 1️⃣ **Retrieve the Dialogflow knowledge answer**
    const knowledgeAnswer = req.body.sessionInfo?.parameters?.['$request.knowledge.answers[0]'] || '';

    console.log("Received knowledge answer:", knowledgeAnswer); // 🔍 Debugging

    if (!knowledgeAnswer) {
      return res.json({
        fulfillment_response: {
          messages: [{ text: { text: ['No relevant references found.'] } }],
        },
      });
    }

    // 2️⃣ **Normalize text for better matching**
    const answerLc = knowledgeAnswer.toLowerCase();

    // 3️⃣ **Filter references that match the knowledge base response**
    const matchingReferences = referencesData.filter((row) => {
      const paperLc = row.Paper.toLowerCase();
      const apaLc = row.APA.toLowerCase();
      const answerWords = answerLc.split(" "); // Split into words for better match
      return answerWords.some(word => paperLc.includes(word) || apaLc.includes(word));
    });

    // 4️⃣ **Limit results to top 3 matches**
    const topThree = matchingReferences.slice(0, 3);

    // If no relevant references are found, return a fallback message
    if (topThree.length === 0) {
      return res.json({
        fulfillment_response: {
          messages: [{ text: { text: ['No relevant references found.'] } }],
        },
      });
    }

    // 5️⃣ **Construct the reference block with GCS URLs**
    let referenceBlock = 'Reference\n';
    topThree.forEach((row, index) => {
      const fileName = row.Link.trim();
      const gcsUrl = fileName 
        ? `https://storage.googleapis.com/${bucketName}/${folderName}/${encodeURIComponent(fileName)}`
        : '[No Link Found]';
      
      const apa = row.APA || '[No APA Found]';
      referenceBlock += `${index + 1}.[${gcsUrl}] - ${apa}\n\n`;
    });

    // 6️⃣ **Return response in Dialogflow CX format**
    return res.json({
      fulfillment_response: {
        messages: [
          {
            text: {
              text: [referenceBlock],
            },
          },
        ],
      }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      fulfillment_response: {
        messages: [{ text: { text: ['Sorry, something went wrong.'] } }],
      },
    });
  }
});

// **Start the server**
const PORT = process.env.PORT || 3000;
loadCSV()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to load CSV:', err);
    console.log('data');
  });
