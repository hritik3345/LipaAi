// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
// Use the PORT environment variable (Cloud Run sets this to 8080 by default)
const port = process.env.PORT || 8080;

app.use(bodyParser.json());

// Set your credentials via environment variables for security.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyBZShx2LBjG_9NjPKMLSv9xK_6pet1AP2w';
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '01e2839d820504feb';

/**
 * getExternalLink(query)
 * Calls the Google Custom Search API using the provided query,
 * and returns the first matching external link.
 */
async function getExternalLink(query) {
  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: query
      }
    });
    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].link;
    }
    return null;
  } catch (error) {
    console.error('Error calling Google Custom Search API:', error.message);
    return null;
  }
}

/**
 * Webhook endpoint for Dialogflow CX.
 * Assumes that the bucket answer is provided in knowledge.answers[0]
 * and the user query is in queryResult.queryText.
 */
app.post('/webhook', async (req, res) => {
  // Log the incoming payload for debugging purposes
  console.log("Incoming request payload:", JSON.stringify(req.body, null, 2));

  // Check if the knowledge answer exists in the payload; adjust the path if needed.
  let bucketAnswer = "Sorry, I couldn't find an answer in our knowledge base.";
  if (
    req.body.knowledge &&
    Array.isArray(req.body.knowledge.answers) &&
    req.body.knowledge.answers.length > 0
  ) {
    bucketAnswer = req.body.knowledge.answers[0];
  }

  // Retrieve the user's query text.
  const userQuery = (req.body.queryResult && req.body.queryResult.queryText) || "default query";

  // Query the Google Custom Search API to get an external link.
  const externalLink = await getExternalLink(userQuery);

  // Combine the bucket answer with the external link.
  let fulfillmentText = bucketAnswer;
  if (externalLink) {
    fulfillmentText += `\n\nFor more details, please visit: ${externalLink}`;
  } else {
    fulfillmentText += "\n\n(No external link found.)";
  }

  // Log the combined fulfillment text for debugging.
  console.log("Fulfillment Text:", fulfillmentText);

  // Return the response in the format expected by Dialogflow CX.
  res.json({
    fulfillment_response: {
      messages: [
        {
          text: {
            text: [fulfillmentText]
          }
        }
      ]
    }
  });
});

// A simple GET endpoint to verify that the container is running.
app.get('/', (req, res) => {
  res.send('Hello, Cloud Run is working!');
});

// Bind explicitly to 0.0.0.0 so Cloud Run can access your service.
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running and listening on port ${port}`);
});
