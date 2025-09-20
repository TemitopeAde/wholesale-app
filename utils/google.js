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

// async function saveAppInstanceToGoogleSheets(instanceData) {
//   try {
//     const SPREADSHEET_ID = sheet;
//     const RANGE = 'new users!A1';
    
//     const sheets = await initializeGoogleSheets();
    
//     // Check if headers exist
//     const headerResponse = await sheets.spreadsheets.values.get({
//       spreadsheetId: SPREADSHEET_ID,
//       range: `${instanceData?.sheet}`,
//     });
//     const { sheet: sheetName, ...dataToSave } = instanceData
//     // If no headers exist, add them
//     if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
//       if (typeof instanceData === 'object' && instanceData !== null && !Array.isArray(instanceData)) {
//         const headers = Object.keys(instanceData);
//         await sheets.spreadsheets.values.update({
//           spreadsheetId: SPREADSHEET_ID,
//           range: `${instanceData?.sheet}`,
//           valueInputOption: 'RAW',
//           resource: { values: [headers] },
//         });
//         console.log('Headers added to sheet:', headers);
//       }
//     }
    
//     let values = [];
    
//     if (Array.isArray(instanceData)) {
//       values = instanceData;
//     } else if (typeof instanceData === 'object' && instanceData !== null) {
//       values = [Object.values(instanceData)];
//     } else {
//       values = [[instanceData]];
//     }
    
//     const resource = {
//       values: values,
//     };
    
//     const response = await sheets.spreadsheets.values.append({
//       spreadsheetId: SPREADSHEET_ID,
//       range: RANGE,
//       valueInputOption: 'RAW',
//       insertDataOption: 'INSERT_ROWS',
//       resource: resource,
//     });
    
//     return response.data;
    
//   } catch (error) {
//     console.error('Error saving to Google Sheets:', error.message);
//     throw error;
//   }
// }


async function saveAppInstanceToGoogleSheets(instanceData) {
  try {
    const SPREADSHEET_ID = sheet;
    const targetSheet = instanceData?.sheet;
    
    const { sheet: sheetName, ...dataToSave } = instanceData;
    
    const sheets = await initializeGoogleSheets();
    
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${targetSheet}`,
    });
    
    if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
      const headers = Object.keys(dataToSave);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${targetSheet}`,
        valueInputOption: 'RAW',
        resource: { values: [headers] },
      });
    }
    
    const values = [Object.values(dataToSave)];
    
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${targetSheet}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values },
    });
    
    return response.data;
    
  } catch (error) {
    console.error('Error saving to Google Sheets:', error.message);
    throw error;
  }
}

async function clearSheet(sheetId) {
  try {
    console.log('🧹 Clearing all data from sheet...');

    const sheets = await initializeGoogleSheets();

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: 'new users!A:Z',
    });

    console.log(`✅ Cleared all data from new users sheet`);
  } catch (error) {
    console.error('❌ Error clearing sheet:', error);
  }
}

async function testGoogleSheetsIntegration() {
  console.log('🧪 Starting Google Sheets integration test...');
  
  const testData = {
    instanceId: "test-instance-" + Date.now(),
    appId: "58199573-6f93-4db3-8145-fd7ee8f9349c",
    email: "testQ@example.com",
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

  console.log('📝 Test data created:', testData.instanceId);

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

async function runTest() {
  await testGoogleSheetsIntegration();
}


module.exports = { saveAppInstanceToGoogleSheets };