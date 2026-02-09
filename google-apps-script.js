/*
  ============================================================
  VERSION: 3.0 - LOGIN + SERVER-SIDE SYNC
  ============================================================
  הוראות התקנה - Google Apps Script
  ============================================================

  1. צור Google Sheet חדש: https://sheets.new
  2. הוסף 3 גיליונות (tabs) עם השמות הבאים בדיוק:
     - customers
     - features
     - requests
  3. בתפריט העליון: Extensions > Apps Script
  4. מחק את כל הקוד הקיים והדבק את כל הקוד מקובץ זה
  5. לחץ שמור (Ctrl+S)
  6. לחץ Deploy > New deployment
  7. בחר Type: Web app
  8. הגדר:
     - Execute as: Me
     - Who has access: Anyone
  9. לחץ Deploy
  10. העתק את ה-URL שקיבלת והדבק אותו ב-index.html
      במקום 'YOUR_GOOGLE_SCRIPT_URL_HERE'

  ============================================================
*/

// ---- GET: Read all data ----
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const params = e.parameter || {};

    // Version check
    if (params.action === 'version') {
      return ContentService.createTextOutput(JSON.stringify({ version: '2.0' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Login action via GET
    if (params.action === 'login') {
      const users = readSheet(ss, 'users');
      const user = users.find(u => u.mail === params.mail && String(u.password) === params.password);
      if (user) {
        return ContentService.createTextOutput(JSON.stringify({ success: true }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'אימייל או סיסמה שגויים' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Sync customers from Powerlink API (server-side, no CORS issues)
    if (params.action === 'syncPowerlink') {
      const token = 'd7e7dda4-c054-4545-b951-1a3d5a393c07';
      const apiUrl = 'https://api.powerlink.co.il/api/query';
      var allRecords = [];
      var pageNumber = 1;
      var isLastPage = false;

      while (!isLastPage) {
        var resp = UrlFetchApp.fetch(apiUrl, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'tokenid': token },
          payload: JSON.stringify({
            objecttype: 1,
            page_size: 500,
            page_number: pageNumber,
            fields: 'accountid,accountname,telephone1,emailaddress1,accountnumber',
            query: '',
            sort_by: 'accountname',
            sort_type: 'asc'
          })
        });
        var plResult = JSON.parse(resp.getContentText());
        if (!plResult.success) throw new Error(plResult.message || 'Powerlink API error');
        allRecords = allRecords.concat(plResult.data.Data || []);
        isLastPage = plResult.data.IsLastPage;
        pageNumber++;
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true, data: allRecords }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const result = {
      customers: readSheet(ss, 'customers'),
      features: readSheet(ss, 'features'),
      requests: readSheet(ss, 'requests'),
      lastSync: getLastSync(ss)
    };

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---- POST: Write data ----
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = body.action;

    if (action === 'login') {
      const users = readSheet(ss, 'users');
      const user = users.find(u => u.mail === body.mail && u.password === body.password);
      if (user) {
        return ContentService.createTextOutput(JSON.stringify({ success: true }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'אימייל או סיסמה שגויים' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    } else if (action === 'saveCustomers') {
      writeSheet(ss, 'customers', body.data, body.lastSync);
    } else if (action === 'saveFeatures') {
      writeSheet(ss, 'features', body.data);
    } else if (action === 'saveRequests') {
      writeSheet(ss, 'requests', body.data);
    } else if (action === 'saveAll') {
      if (body.customers) writeSheet(ss, 'customers', body.customers, body.lastSync);
      if (body.features) writeSheet(ss, 'features', body.features);
      if (body.requests) writeSheet(ss, 'requests', body.requests);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---- Read sheet into array of objects ----
function readSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}

// ---- Write array of objects to sheet (full replace) ----
function writeSheet(ss, sheetName, dataArray, lastSync) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  if (!dataArray || !dataArray.length) {
    // Clear data but keep headers if they exist
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    if (lastSync && sheetName === 'customers') {
      saveLastSync(ss, lastSync);
    }
    return;
  }

  // Get headers from data keys
  const headers = Object.keys(dataArray[0]);

  // Build rows
  const rows = dataArray.map(obj => headers.map(h => obj[h] !== undefined ? obj[h] : ''));

  // Clear and write
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  if (lastSync && sheetName === 'customers') {
    saveLastSync(ss, lastSync);
  }
}

// ---- Store lastSync in a property ----
function saveLastSync(ss, value) {
  PropertiesService.getScriptProperties().setProperty('lastSync', value);
}

function getLastSync(ss) {
  return PropertiesService.getScriptProperties().getProperty('lastSync') || null;
}
