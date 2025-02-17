const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

const port = process.env.PORT || 8080;
app.use(bodyParser.json());

// Environment variables validation with detailed logging
const GOOGLE_API_KEY = "AIzaSyBZShx2LBjG_9NjPKMLSv9xK_6pet1AP2w";
const GOOGLE_CSE_ID = "01e2839d820504feb";

console.log('Starting server with config:', {
  hasApiKey: !!GOOGLE_API_KEY,
  hasCseId: !!GOOGLE_CSE_ID,
  port: port
});

if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
  console.error('❌ Missing required environment variables:',
    !GOOGLE_API_KEY ? 'GOOGLE_API_KEY' : '',
    !GOOGLE_CSE_ID ? 'GOOGLE_CSE_ID' : ''
  );
  process.exit(1);
}

async function getExternalLink(query) {
  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: GOOGLE_API_KEY, cx: GOOGLE_CSE_ID, q: query }
    });
    console.log("API Response:", JSON.stringify(response.data, null, 2)); // Add this line
    return response.data.items?.[0]?.link || null;
  } catch (error) {
    console.error('API Error:', error.response?.data || error.message);
    return null;
  }
}
app.post('/webhook', async (req, res) => {
  console.log('\n🎯 Webhook called - Request body:', JSON.stringify(req.body, null, 2));

  try {
    // Validate request structure
    if (!req.body) {
      throw new Error('Empty request body');
    }

    let bucketAnswer = "";
  const knowledgeAnswers = req.body.knowledgeAnswers?.answers;
  if (knowledgeAnswers && knowledgeAnswers.length > 0) {
    bucketAnswer = knowledgeAnswers[0].answer;
  }

    // Extract query - try different possible locations in the request
    const userQuery = req.body.text || req.body.queryResult?.queryText || "https://pubmed.ncbi.nlm.nih.gov/24138536/";

    console.log('📝 Extracted user query:', userQuery);

    if (!userQuery) {
      console.warn('⚠️ No user query found in request');
    }

    // Get knowledge base answer if available
    // let answer = '';
    // if (req.body.knowledge?.answers?.[0]) {
    //   answer = req.body.knowledge.answers[0];
    //   console.log('📚 Found knowledge base answer:', answer);
    // }

    console.log('🔎 Calling Google Search API...');
    const externalLink = await getExternalLink(userQuery);
    console.log('🔗 External link result:', externalLink);

    // Construct response
    let responseText = bucketAnswer;
    if (externalLink) {
      responseText += `\n\nYou can find more information here: target="_blank">${externalLink}</a>`;
    }

    console.log('📤 Sending response:', responseText);

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
    console.error('❌ Webhook error:', {
      message: error.message,
      stack: error.stack
    });

    res.status(500).json({
      fulfillmentResponse: {
        messages: [{
          text: {
            text: ['I apologize, but I encountered an error while processing your request. Error: ' + error.message]
          }
        }]
      }
    });
  }
});

// Health check endpoint with config validation
app.get('/', (req, res) => {
  const configStatus = {
    google_api_key: !!GOOGLE_API_KEY ? '✅ Set' : '❌ Missing',
    google_cse_id: !!GOOGLE_CSE_ID ? '✅ Set' : '❌ Missing',
    server_time: new Date().toISOString()
  };

  res.json(configStatus);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
});
