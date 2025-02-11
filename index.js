const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
app.use(bodyParser.json());

// Holds the CSV data
let referencesData = [];

/**
 * Loads CSV into memory on startup
 * (Assuming your CSV is named 'references.csv' in the same directory)
 */
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('references.csv')
      .pipe(csv())
      .on('data', (row) => {
        // row will be something like:
        // { "Folder Name": "ADD", "Sn.": "1", "Paper": "...", "APA": "...", "Link": "..." }
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
 * Main webhook endpoint
 * - Optionally filter your data if needed.
 * - Builds a text response in the format:
 *     Reference 
 *     1.[Link] - Reference APA
 *     2.[Link] - Reference APA
 *     ...
 */
app.post('/webhook', async (req, res) => {
  try {
    // If you want to filter by "Folder Name" from user input, do so here:
    // const folderFilter = req.body.sessionInfo?.parameters?.folderName || '';
    // const filteredData = referencesData.filter(row => row['Folder Name'] === folderFilter);

    // Or simply show all CSV rows:
    const filteredData = referencesData;

    // Start the message
    let referenceText = 'Reference \n';

    // Build each line as: 1.[Link] - Reference APA
    filteredData.forEach((row, index) => {
      const link = row.Link || 'No Link';
      const apa = row.APA || 'No APA';
      // Each reference on a new line, with an extra blank line if desired
      referenceText += `${index + 1}.[${link}] - ${apa}\n\n`;
    });

    // Send final response to Dialogflow CX
    return res.json({
      fulfillment_response: {
        messages: [
          {
            text: {
              text: [referenceText]
            }
          }
        ]
      }
    });

  } catch (error) {
    console.error('Error building references:', error);
    return res.json({
      fulfillment_response: {
        messages: [
          { text: { text: ['An error occurred while generating references.'] } }
        ]
      }
    });
  }
});

// Start server on PORT or default 3000
const PORT = process.env.PORT || 3000;
loadCSV()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Loaded ${referencesData.length} CSV rows`);
    });
  })
  .catch(err => {
    console.error('Failed to load CSV:', err);
  });
    
