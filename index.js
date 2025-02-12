const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

// Use the PORT environment variable
const port = process.env.PORT || 8080;

// Middleware
app.use(bodyParser.json());

// Environment variables validation
const GOOGLE_API_KEY = 'AIzaSyBZShx2LBjG_9NjPKMLSv9xK_6pet1AP2w';
const GOOGLE_CSE_ID = '01e2839d820504feb';

if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
  console.error('Missing required environment variables: GOOGLE_API_KEY and/or GOOGLE_CSE_ID');
  process.exit(1);
}

/**
 * getExternalLink(query)
 * Calls the Google Custom Search API using the provided query
 * @param {string} query - The search query
 * @returns {Promise<string|null>} The first search result link or null
 */
async function getExternalLink(query) {
  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: query,
        num: 1 // Limit to 1 result for efficiency
      },
      timeout: 5000 // 5 second timeout
    });

    if (response.data.items?.[0]?.link) {
      return response.data.items[0].link;
    }

    console.log('No search results found for query:', query);
    return null;
  } catch (error) {
    console.error('Error calling Google Custom Search API:', {
      message: error.message,
      query,
      status: error.response?.status,
      data: error.response?.data
    });
    return null;
  }
}

/**
 * Webhook endpoint for Dialogflow CX
 */
app.post('/webhook', async (req, res) => {
  try {
    console.log('Incoming webhook request:', {
      session: req.body.sessionInfo?.session,
      query: req.body.text,
      page: req.body.pageInfo?.currentPage
    });

    // Extract the query from the correct location in Dialogflow CX v3 request
    const userQuery = req.body.text || '';

    // Get knowledge base answer if available
    let answer = '';
    if (req.body.knowledge?.answers?.[0]) {
      answer = req.body.knowledge.answers[0];
    }

    // Get external link
    const externalLink = await getExternalLink(userQuery);

    // Construct response
    let responseText = answer || 'I apologize, but I couldn\'t find specific information about that.';

    if (externalLink) {
      responseText += `\n\nYou can find more information here: ${externalLink}`;
    }

    // Send response in Dialogflow CX v3 format
    res.json({
      fulfillmentResponse: {
        messages: [{
          text: {
            text: [responseText]
          }
        }]
      }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      fulfillmentResponse: {
        messages: [{
          text: {
            text: ['I apologize, but I encountered an error while processing your request.']
          }
        }]
      }
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    fulfillmentResponse: {
      messages: [{
        text: {
          text: ['An unexpected error occurred.']
        }
      }]
    }
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  console.log('Environment:', {
    hasApiKey: !!GOOGLE_API_KEY,
    hasCseId: !!GOOGLE_CSE_ID,
    nodeEnv: process.env.NODE_ENV
  });
});