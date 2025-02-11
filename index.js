const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
app.use(bodyParser.json());

// Holds the CSV data in memory
let referencesData = [];

/**
 * Loads CSV into memory on startup.
 * (Assumes your CSV file is named 'references.csv' and is located in the same directory.)
 */
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('references.csv')
      .pipe(csv())
      .on('data', (row) => {
        results.push(row);
      })
      .on('end', () => {
        referencesData = results;
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

/**
 * Main webhook endpoint.
 * It reads the knowledge answer, filters the CSV data for matching references,
 * limits the results to 3, and returns the response in the exact format:
 *
 * Reference 
 * 1.[Link] - Reference APA
 *
 * 2.[Link] - Reference APA
 *
 * 3.[Link] - Reference APA
 */
app.post('/webhook', async (req, res) => {
  try {
    // 1) Retrieve the knowledge answer from Dialogflow CX parameters.
    const knowledgeAnswer =
      req.body.sessionInfo?.parameters?.['$request.knowledge.answers[0]'] || '';

    // Convert to lowercase for simple substring matching.
    const answerLc = knowledgeAnswer.toLowerCase();

    // 2) Filter the CSV data so that only rows that match the knowledge answer are kept.
    //    This example checks if the answer text is a substring of either the "Paper" or "APA" field.
    const matchingReferences = referencesData.filter((row) => {
      const paperLc = (row.Paper || '').toLowerCase();
      const apaLc = (row.APA || '').toLowerCase();
      return paperLc.includes(answerLc) || apaLc.includes(answerLc);
    });

    // 3) Limit the output to the top 3 matching references.
    const topThree = matchingReferences.slice(0, 3);

    // 4) Build the reference block text.
    // The output will be in the format:
    //
    // Reference 
    // 1.[actual-link] - [Actual APA citation]
    //
    // 2.[actual-link] - [Actual APA citation]
    //
    // 3.[actual-link] - [Actual APA citation]
    let referenceBlock = 'Reference\n';
    topThree.forEach((row, index) => {
      const link = row.Link || '[No Link]';
      const apa = row.APA || '[No APA]';
      referenceBlock += `${index + 1}.[${link}] - ${apa}\n\n`;
    });

    // 5) Return the final reference block as the webhook response in Dialogflow CX format.
    return res.json({
      fulfillment_response: {
        messages: [
          {
            text: {
              text: [referenceBlock]
            }
          }
        ]
      }
    });
  } catch (error) {
    console.error('Error in /webhook:', error);
    return res.status(500).json({
      fulfillment_response: {
        messages: [
          { text: { text: ['Sorry, something went wrong.'] } }
        ]
      }
    });
  }
});

// Start the server on PORT (default is 3000)
const PORT = process.env.PORT || 3000;
loadCSV()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Loaded ${referencesData.length} CSV rows.`);
    });
  })
  .catch((err) => {
    console.error('Failed to load CSV:', err);
  });
