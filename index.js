const express = require('express');
const { Storage } = require('@google-cloud/storage');
const csv = require('csvtojson');

const app = express();
app.use(express.json());

// Initialize the Cloud Storage client
const storage = new Storage();

// Configure your bucket name and CSV file path
const BUCKET_NAME = 'zydus_faq';
const CSV_FILE_PATH = 'https://storage.googleapis.com/zydus_faq/references.csv';

/**
 * Function to fetch and parse CSV data from Cloud Storage.
 */
async function getCsvData() {
  // Download the CSV file as a buffer
  const file = storage.bucket(BUCKET_NAME).file(CSV_FILE_PATH);
  const data = await file.download();
  // Parse CSV data to JSON
  const jsonArray = await csv().fromString(data.toString());
  return jsonArray;
}

/**
 * Function to find a matching record based on criteria.
 * For example, you may want to match based on Folder Name and Sn.
 */
function findMatchingRecord(dataArray, folderName, sn) {
  return dataArray.find(record => {
    // Adjust property names as they appear in your CSV (they may include spaces)
    return record['Folder Name'] === folderName && record['Sn.'] === sn;
  });
}

// Webhook endpoint
app.post('/', async (req, res) => {
  try {
    // Extract parameters from Dialogflow CX request
    // (Adjust the parameter names based on your Dialogflow setup.)
    const folderName = req.body.queryResult.parameters.folder_name;
    const sn = req.body.queryResult.parameters.sn;
    
    // Fetch the CSV data (you may choose to cache this if the file rarely changes)
    const csvData = await getCsvData();
    
    // Find the matching record
    const match = findMatchingRecord(csvData, folderName, sn);
    
    let fulfillmentText = "Sorry, no matching link was found.";
    if (match && match.Link) {
      fulfillmentText = `I found the external link for you: ${match.Link}`;
    }
    
    // Return the response in Dialogflow CX webhook format
    res.json({
      fulfillment_response: {
        messages: [
          {
            text: { text: [fulfillmentText] }
          }
        ]
      }
    });
  } catch (err) {
    console.error("Error processing request:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Export the Express app as a Cloud Function
module.exports = app;
