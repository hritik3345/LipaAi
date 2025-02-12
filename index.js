// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
// Cloud Run sets the PORT environment variable; default to 8080 if not provided.
const port = process.env.PORT || 8080;

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Use environment variables for sensitive data.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyBZShx2LBjG_9NjPKMLSv9xK_6pet1AP2w';
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || 'AIzaSyBZShx2LBjG_9NjPKMLSv9xK_6pet1AP2w';

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
 * Assumes the bucket answer is provided in knowledge.answers[0]
 * and the user query is in queryResult.queryText.
 */
app.post('/webhook', async (req, res) => {
  try {
    // Retrieve the answer generated from your bucket/datastore
    const bucketAnswer =
      req.body.knowledge &&
        req.body.knowledge.answers &&
        req.body.knowledge.answers[0]
        ? req.body.knowledge.answers[0]
        : "Sorry, I couldn't find an answer in our knowledge base.";

    // Retrieve the user's query text from the request payload
    const userQuery = (req.body.queryResult && req.body.queryResult.queryText) || "default query";

    // Query the Google Custom Search API to obtain an external link related to the user's query.
    const externalLink = await getExternalLink(userQuery);

    // Combine the bucket answer with the external link.
    let fulfillmentText = bucketAnswer;
    if (externalLink) {
      fulfillmentText += `\n\nFor more details, please visit: ${externalLink}`;
    } else {
      fulfillmentText += "\n\n(No external link found.)";
    }

    // Return the fulfillment response in the format expected by Dialogflow CX.
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
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook error');
  }
});

// A simple route to verify that the container is running and listening on the expected port.
app.get('/', (req, res) => {
  res.send('Hello, Cloud Run is working!');
});

// Start the server and listen on the provided port.
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
