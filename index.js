// server.js
const express = require('express');
const csv = require('csv-parser');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(express.json()); // to parse JSON request bodies

// Global array to store CSV data with computed embeddings
let csvData = [];

// Function to load CSV data and compute embeddings for each row
async function loadCSVAndComputeEmbeddings() {
  return new Promise((resolve, reject) => {
    fs.createReadStream('data.csv')  // change to the path of your CSV file
      .pipe(csv())
      .on('data', (row) => {
        // Combine relevant fields for search – adjust field names as needed.
        const combinedText = `${row['Paper'] || ''} ${row['APA'] || ''} ${row['COMMENTS'] || ''}`.trim();
        csvData.push({
          paper: row['Paper'],    // title or description of the paper
          link: row['Link'],      // URL to the PDF
          combinedText: combinedText,
          embedding: null         // will be filled in later
        });
      })
      .on('end', async () => {
        console.log('CSV file successfully processed. Now computing embeddings...');
        // For each row, compute an embedding using OpenAI API
        // (You can also choose any embedding API or service.)
        for (let i = 0; i < csvData.length; i++) {
          const text = csvData[i].combinedText;
          try {
            const response = await axios.post(
              'https://api.openai.com/v1/embeddings',
              {
                input: text,
                model: 'text-embedding-ada-002'
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` // set your API key in the environment
                }
              }
            );
            // Save the embedding vector from the API response
            csvData[i].embedding = response.data.data[0].embedding;
          } catch (err) {
            console.error(`Error computing embedding for row ${i}:`, err.response ? err.response.data : err.message);
          }
        }
        console.log('Embeddings computed for all rows.');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error reading CSV:', err);
        reject(err);
      });
  });
}

// Function to compute cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Webhook endpoint that processes the user query
app.post('/webhook', async (req, res) => {
  const query = req.body.query; // expecting a JSON body like { "query": "what is saro?" }
  if (!query) {
    return res.status(400).json({ error: "Query text not provided." });
  }
  
  // Compute the embedding for the user's query using OpenAI
  let queryEmbedding;
  const OPENAI_API_KEY='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';
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        input: query,
        model: 'text-embedding-ada-002'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    queryEmbedding = response.data.data[0].embedding;
  } catch (err) {
    console.error('Error computing query embedding:', err.response ? err.response.data : err.message);
    return res.status(500).json({ error: "Error computing query embedding" });
  }
  
  // Calculate similarity scores for each CSV row
  const results = csvData.map(item => {
    if (item.embedding) {
      const score = cosineSimilarity(queryEmbedding, item.embedding);
      return { score, paper: item.paper, link: item.link };
    }
    return null;
  }).filter(item => item !== null);
  
  // Sort results by similarity score (highest first)
  results.sort((a, b) => b.score - a.score);
  
  // Select top N results (e.g., top 5)
  const topResults = results.slice(0, 5);
  
  // Build a custom payload (rich response) that includes only the relevant links
  const richContentItems = topResults.map(item => ({
    type: "info",
    title: item.paper,
    subtitle: `Relevance: ${item.score.toFixed(2)}`,
    actionLink: item.link
  }));
  
  const payload = {
    richContent: [ richContentItems ]
  };
  
  // Return the payload as the webhook response
  res.json(payload);
});

// Start the server after loading CSV and computing embeddings
const PORT = process.env.PORT || 8080;
loadCSVAndComputeEmbeddings()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to load CSV and compute embeddings:', err);
  });
