// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 8080;

// Replace these placeholders with your actual credentials.
const GOOGLE_API_KEY = 'AIzaSyBZShx2LBjG_9NjPKMLSv9xK_6pet1AP2w';
const GOOGLE_CSE_ID = '01e2839d820504feb';

// Middleware to parse JSON bodies from Dialogflow CX
app.use(bodyParser.json());

/**
 * Function: getExternalLink
 * Purpose: Calls the Google Custom Search API with the given query and returns the first matching link.
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
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error during Google Custom Search:', error);
    return null;
  }
}

/**
 * Webhook endpoint for Dialogflow CX.
 * This code assumes that the agent sends the answer from your datastore (bucket)
 * in the field knowledge.answers[0] and the user's query in a field (e.g., queryResult.queryText).
 */
app.post('/webhook', async (req, res) => {
  try {
    // Retrieve the answer generated from your bucket (via knowledge base)
    // Adjust the property path as per your actual request payload.
    const bucketAnswer = (req.body.knowledge && req.body.knowledge.answers && req.body.knowledge.answers[0])
      ? req.body.knowledge.answers[0]
      : "Sorry, I couldn't find an answer in our knowledge base.";

    // Retrieve the user's query text.
    // Depending on your CX configuration, you might extract the query from a different field.
    const userQuery = (req.body.queryResult && req.body.queryResult.queryText) || "default query";

    // Query Google Custom Search API to get an external link related to the query.
    const externalLink = await getExternalLink(userQuery);

    // Combine the bucket answer with the external link.
    let fulfillmentText = bucketAnswer;
    if (externalLink) {
      fulfillmentText += `\n\nFor more details, please visit: ${externalLink}`;
    } else {
      fulfillmentText += "\n\n(No external link found.)";
    }

    // Return the fulfillment response to Dialogflow CX.
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
    console.error("Error in webhook processing:", error);
    res.status(500).send("Webhook error");
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
