// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
// Cloud Run sets the PORT environment variable (default is 8080)
const port = process.env.PORT || 8080;

app.use(bodyParser.json());

// It’s a good idea to store sensitive credentials in environment variables
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyBZShx2LBjG_9NjPKMLSv9xK_6pet1AP2w';
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '01e2839d820504feb';

/**
 * getExternalLink(query)
 * Calls the Google Custom Search API using the provided query,
 * and returns the first matching link.
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
    // Retrieve the answer generated from your datastore/bucket
    const bucketAnswer = (req.body.knowledge &&
      req.body.knowledge.answers &&
      req.body.knowledge.answers[0])
      ? req.body.knowledge.answers[0]
      : "Sorry, I couldn't find an answer in our knowledge base.";

    // Retrieve the user's query text from the request payload
    const userQuery = (req.body.queryResult && req.body.queryResult.queryText) || "default query";

    // Get an external link using Google Custom Search API based on the query
    const externalLink = await getExternalLink(userQuery);

    // Combine the bucket answer with the external link (if available)
    let fulfillmentText = bucketAnswer;
    if (externalLink) {
      fulfillmentText += `\n\nFor more details, please visit: ${externalLink}`;
    } else {
      fulfillmentText += "\n\n(No external link found.)";
    }

    // Send the response in the format Dialogflow CX expects
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

// A simple route to verify that the container is running and listening on the correct port
app.get('/', (req, res) => {
  res.send('Hello, Cloud Run is working!');
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
