const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
app.use(bodyParser.json());

const bucketName = "zydus_faq"; 
const folderName = "ADD";

let referencesData = [];

/**
 * Load CSV file
 */
function loadCSV() {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream('references.csv')
            .pipe(csv())
            .on('data', (row) => {
                console.log("📄 CSV Row Loaded:", row);

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
                console.log(`✅ Loaded ${referencesData.length} references from CSV.`);
                resolve();
            })
            .on('error', (err) => {
                console.error("❌ Error reading CSV:", err);
                reject(err);
            });
    });
}

/**
 * Webhook for Dialogflow CX
 */
app.post('/webhook', async (req, res) => {
    console.log("🔹 Full Request Body:", JSON.stringify(req.body, null, 2));

    const knowledgeAnswer = req.body.sessionInfo?.parameters?.['$request.knowledge.answers[0]'] || '';
    console.log("🔍 Received knowledge answer:", knowledgeAnswer);

    if (!knowledgeAnswer) {
        return res.json({
            fulfillment_response: {
                messages: [{ text: { text: ['No relevant references found. (Missing Knowledge Answer)'] } }],
            },
        });
    }

    const answerLc = knowledgeAnswer.toLowerCase().replace(/[^\w\s]/g, "");

    const matchingReferences = referencesData.filter((row) => {
        const paperLc = row.Paper.toLowerCase().replace(/[^\w\s]/g, "");
        const apaLc = row.APA.toLowerCase().replace(/[^\w\s]/g, "");

        const answerWords = answerLc.split(" ");
        return answerWords.some(word => paperLc.includes(word) || apaLc.includes(word));
    });

    if (matchingReferences.length === 0) {
        console.log("⚠️ No matching references found for:", knowledgeAnswer);
        console.log("🔍 Here is what we searched in:", referencesData);

        return res.json({
            fulfillment_response: {
                messages: [{ text: { text: [`No relevant references found for: "${knowledgeAnswer}".`] } }],
            },
        });
    }

    let referenceBlock = 'Reference\n';
    const topThree = matchingReferences.slice(0, 3);

    topThree.forEach((row, index) => {
        const fileName = row.Link.trim();
        const gcsUrl = fileName ? `https://storage.googleapis.com/${bucketName}/${folderName}/${encodeURIComponent(fileName)}` : '[No Link Found]';
        const apa = row.APA || '[No APA Found]';
        referenceBlock += `${index + 1}.[${gcsUrl}] - ${apa}\n\n`;
    });

    return res.json({
        fulfillment_response: {
            messages: [{ text: { text: [referenceBlock] } }],
        },
    });
});

const PORT = process.env.PORT || 8080;
loadCSV()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('❌ Failed to load CSV:', err);
        process.exit(1);
    });
