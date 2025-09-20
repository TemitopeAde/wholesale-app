const { google } = require('googleapis');
require('dotenv').config();

const sheet = process.env.SHEET_ID; 

async function initializeGoogleSheets() {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    await auth.authorize();
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    return sheets;
  } catch (error) {
    console.error('Failed to initialize Google Sheets API:', error);
    throw error;
  }
}


async function saveAppInstanceToGoogleSheets(instanceData) {
  try {
    console.log('📊 Saving data to Google Sheets...');
    
    const sheets = await initializeGoogleSheets();
    
    // Convert data object to array format for Google Sheets
    const values = [Object.values(instanceData)];
    
    const request = {
      spreadsheetId: process.env.SHEET_ID,
      range: 'Sheet1!A:Z',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: values
      }
    };

    const response = await sheets.spreadsheets.values.append(request);
    
    console.log('✅ Data saved to Google Sheets successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error saving to Google Sheets:', error);
    // Don’t throw error to avoid breaking main flow
  }
}

async function clearSheet(sheetId) {
  try {
    console.log('🧹 Clearing all data from sheet...');

    const sheets = await initializeGoogleSheets();

    // Get sheet metadata to dynamically detect first sheet name
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });
    const sheetName = metadata.data.sheets[0].properties.title;

    // Clear all values in the sheet
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:Z`, // clears all rows & columns A–Z
    });

    console.log(`✅ Cleared all data from ${sheetName}`);
  } catch (error) {
    console.error('❌ Error clearing sheet:', error);
  }
}


// clearSheet(sheet);
// testGoogleSheetsIntegration();

// async function testGoogleSheetsIntegration() {
  
//   const testData = {
//     instanceId: "test-instance-" + Date.now(),
//     appId: "58199573-6f93-4db3-8145-fd7ee8f9349c",
//     email: "test@example.com",
//     app: "Test App",
//     site: "https://testsite.wixsite.com/mysite",
//     siteId: "test-site-id-123",
//     action: 'test_integration',
//     isFree: true,
//     status: 'test',
//     installationTimestamp: new Date().toISOString(),
//     timeStamp: null,
//     expirationDate: null,
//     active: false,
//     autoRenewing: false
//   };

//   try {
//     await saveAppInstanceToGoogleSheets(testData);
//     console.log("✅ Google Sheets test completed successfully!");
      
//   } catch (error) {
//     console.log("❌ Test failed:", error);
    
//     if (error.message.includes('credentials')) {
//       console.log("💡 Tip: Make sure your credentials.json file is in the correct location");
//     }
//     if (error.message.includes('SHEET_ID')) {
//       console.log("💡 Tip: Make sure you've set the SHEET_ID environment variable");
//     }
//   }

//   console.log("=== TEST COMPLETE ===\n");
// }

module.exports = { saveAppInstanceToGoogleSheets };