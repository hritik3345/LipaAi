const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
app.use(bodyParser.json());

// In-memory array to store CSV data
let referencesData = [];

// 1) Function to load & parse CSV into 'referencesData'
function loadCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('references.csv') // If your file has a different name, change it here.
      .pipe(csv())
      .on('data', (data) => {
        // data will be an object with keys matching the columns in the CSV
        // Example: data = { 'Folder Name': 'ADD', 'Sn.': '1', 'Paper': 'A Multicenter...' }
        results.push(data);
      })
      .on('end', () => {
        referencesData = results;
        resolve();
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

// 2) Create a POST /webhook endpoint for Dialogflow CX
app.post('/webhook', async (req, res) => {
  try {
    // Optionally re-load CSV on every request if it changes frequently:
    // await loadCSV();

    // For example, let's assume you want to show references for Folder = "ADD" only
    // If you want to display references for ALL rows, skip the filter
    const folderFilter = "ADD"; // you can also read from req.body if user input is used
    const filteredData = referencesData.filter(row => row["Folder Name"] === folderFilter);

    // If you want to display *all*, just use referencesData directly
    // const filteredData = referencesData;

    // Construct the list in the format required:
    // 1. [Link] - APA
    // 2. [Link] - APA
    // ...
    const referencesList = filteredData.map((row, index) => {
      const link = row["Link"] || "No Link";
      const apa = row["APA"] || "No APA";
      const serialNumber = index + 1; // or use row["Sn."] if you prefer
      return `${serialNumber}. [${link}] - ${apa}`;
    });

    // Example "clinograph" link – you can store it in your CSV or define it manually
    const clinographLink = 'https://example.com/clinograph';

    // Build the final message:
    const message = `
Hello Team,

I hope you're doing well.

As discussed in our recent meeting, please find attached the Excel file containing the Paper Title, APA Citation, and Link that should be used in the Lipa AI Reference section. Kindly ensure that each reference follows the specified format:

${referencesList.join('\n')}

Additionally, after each reference, please showcase the Lipaglyn Clinograph from the Clinograph and Monograph folders as follows:

Lipaglyn Clinograph MASLD – ${clinographLink}
File Name: Lipaglyn Clinograph 2024 V5.PDF (For Your/Developer Reference - FYR)

Sample View

Reference
${referencesList.join('\n')}

Dear Dr. XYZ,

For more information on Lipaglyn, please refer to the Clinograph for MASLD.

Lipaglyn Clinograph MASLD – ${clinographLink}
    `.trim();

    // Return the message in Dialogflow CX-structured JSON
    return res.json({
      fulfillment_response: {
        messages: [
          {
            text: {
              text: [message]
            }
          }
        ]
      }
    });

  } catch (error) {
    console.error('Error in webhook:', error);
    return res.json({
      fulfillment_response: {
        messages: [
          {
            text: {
              text: ['Something went wrong loading CSV data.']
            }
          }
        ]
      }
    });
  }
});

// 3) Start the server after CSV is loaded
const PORT = process.env.PORT || 3000;
loadCSV().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Loaded ${referencesData.length} rows from CSV.`);
  });
}).catch(err => {
  console.error('Failed to load CSV:', err);
});
