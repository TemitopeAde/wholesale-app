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

async function ensureHeadersExist(sheets, spreadsheetId, sheetTitle, dataKeys) {
  try {
    const sheetRange = `'${sheetTitle}'!A:A`;
    
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: sheetRange
    });
    
    const existingData = sheetResponse.data.values || [];
    
    if (existingData.length === 0) {
      console.log('📝 Adding headers to empty sheet...');
      
      const headers = dataKeys.map(key => {
        return key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim();
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `'${sheetTitle}'!1:1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers]
        }
      });

      console.log('✅ Headers added:', headers);
      return true;
    }
    
    console.log('📋 Sheet has existing data, skipping header addition...');
    return false;
  } catch (error) {
    console.log('⚠️ Error checking sheet data, attempting to add headers...');
    
    try {
      const headers = dataKeys.map(key => {
        return key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim();
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `'${sheetTitle}'!1:1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers]
        }
      });

      console.log('✅ Headers added after error:', headers);
      return true;
    } catch (headerError) {
      console.error('❌ Failed to add headers:', headerError.message);
      return false;
    }
  }
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

async function saveAppInstanceToGoogleSheets(instanceData) {
  try {
    console.log('📊 Saving data to Google Sheets...');

    const sheets = await initializeGoogleSheets();

    if (!process.env.SHEET_ID) {
      throw new Error('SHEET_ID environment variable is not set');
    }

    let targetRange = 'A1';
    let sheetTitle = 'Sheet1';
    
    try {
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: process.env.SHEET_ID
      });
      
      const firstSheet = spreadsheetInfo.data.sheets[0];
      sheetTitle = firstSheet.properties.title;
      
      console.log(`📋 Using sheet: ${sheetTitle}`);
    } catch (metaError) {
      console.warn('⚠️ Could not get sheet metadata, using default values');
    }

    const dataKeys = Object.keys(instanceData);
    
    await ensureHeadersExist(sheets, process.env.SHEET_ID, sheetTitle, dataKeys);
    
    targetRange = `'${sheetTitle}'`;

    const values = [dataKeys.map(key => instanceData[key])];

    const request = {
      spreadsheetId: process.env.SHEET_ID,
      range: targetRange,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: values
      }
    };

    const response = await sheets.spreadsheets.values.append(request);

    console.log('✅ Data saved to Google Sheets successfully');
    console.log('📍 Updated range:', response.data.updates?.updatedRange);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error saving to Google Sheets:', error);
    
    if (error.response) {
      console.error('API Error Details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    throw error;
  }
}

async function clearSheet(sheetId) {
  try {
    console.log('🧹 Clearing all data from sheet...');

    const sheets = await initializeGoogleSheets();

    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });
    const sheetName = metadata.data.sheets[0].properties.title;

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `'${sheetName}'`,
    });

    console.log(`✅ Cleared all data from ${sheetName}`);
  } catch (error) {
    console.error('❌ Error clearing sheet:', error);
    throw error;
  }
}

async function testGoogleSheetsIntegration() {
  const testData = {
    instanceId: "test-instance-" + Date.now(),
    appId: "58199573-6f93-4db3-8145-fd7ee8f9349c",
    email: "test@example.com",
    app: "Test App",
    site: "https://testsite.wixsite.com/mysite",
    siteId: "test-site-id-123",
    action: 'test_integration',
    isFree: true,
    status: 'test',
    installationTimestamp: new Date().toISOString(),
    timeStamp: null,
    expirationDate: null,
    active: false,
    autoRenewing: false
  };

  try {
    await saveAppInstanceToGoogleSheets(testData);
    console.log("✅ Google Sheets test completed successfully!");

  } catch (error) {
    console.log("❌ Test failed:", error);

    if (error.message.includes('credentials')) {
      console.log("💡 Tip: Make sure your credentials.json file is in the correct location");
    }
    if (error.message.includes('SHEET_ID')) {
      console.log("💡 Tip: Make sure you've set the SHEET_ID environment variable");
    }
  }

  console.log("=== TEST COMPLETE ===\n");
}

// clearSheet(sheet)
// Export the functions
module.exports = { 
  saveAppInstanceToGoogleSheets,
  testGoogleSheetsIntegration,
  clearSheet
};

// Only run test if this file is executed directly (not when required as a module)
// if (require.main === module) {
//   testGoogleSheetsIntegration();
// }