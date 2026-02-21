/**
 * GOOGLE APPS SCRIPT: PROFESSIONAL MULTI-USER DATABASE
 * Optimized for 40+ Concurrent Teams via LockService
 */
const TARGET_SPREADSHEET_ID = "17V6tx_JYPBQiQcsYWINs5cNtHd1PUgV9WnG4oHiLDCc";

function getDatabaseSpreadsheet() {
  return SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    ensureRequiredHeaders(ss);
    
    // Use CacheService for better performance
    const cache = CacheService.getScriptCache();
    const cached = cache.get('fullData');
    
    if (cached) {
      return ContentService.createTextOutput(cached)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const result = {
      leaderboard: getSheetData(ss, "Leaderboard"),
      logs: getSheetData(ss, "EventLogs"),
      paths: getSheetData(ss, "PathAnalytics"),
      timestamp: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(result);
    cache.put('fullData', jsonString, 15); // Cache for 15 seconds
    
    return ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      error: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  
  try {
    if (!lock.tryLock(5000)) {
      return ContentService.createTextOutput("Server busy")
        .setMimeType(ContentService.MimeType.TEXT);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    
    // Clear cache on any POST to ensure fresh data
    CacheService.getScriptCache().remove('fullData');
    
    // ACTION: RESET FULL GAME
    if (data.action === "RESET_GAME") {
      clearSheet(ss, "Leaderboard");
      clearSheet(ss, "EventLogs");
      clearSheet(ss, "PathAnalytics");
      setupHeaders(ss); // Restore headers
      return ContentService.createTextOutput("Game Reset Successful").setMimeType(ContentService.MimeType.TEXT);
    }

    switch(data.action) {
      case 'BULK_SYNC':
        return handleBulkSync(ss, data);
      case 'UPDATE_CREW':
        return handleCrewUpdate(ss, data);
      case 'BATCH_EVENTS':
        return handleBatchEvents(ss, data);
      case 'LOG_EVENT':
        appendLine(ss, "EventLogs", data.event);
        return ContentService.createTextOutput("Success");
      default:
        return ContentService.createTextOutput("Unknown action");
    }
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.toString());
  } finally {
    lock.releaseLock();
  }
}

function handleBulkSync(ss, data) {
  overwriteSheet(ss, "Leaderboard", data.tier1 || []);
  overwriteSheet(ss, "PathAnalytics", data.tier2 || []);
  appendLines(ss, "EventLogs", data.tier3 || []);
  return ContentService.createTextOutput("Bulk sync successful");
}

function handleCrewUpdate(ss, data) {
  updateCrewStanding(ss, data.crewData);
  updateCrewPathAnalytics(ss, data.crewData);
  return ContentService.createTextOutput("Crew updated");
}

function handleBatchEvents(ss, data) {
  appendLines(ss, "EventLogs", data.events || []);
  return ContentService.createTextOutput("Events logged");
}

// --- HELPERS ---

function getSheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  
  const vals = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = vals[0];
  
  return vals.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function clearSheet(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (sheet) sheet.clear();
}

function setupHeaders(ss) {
  let lb = getSheet(ss, "Leaderboard");
  if (lb.getLastRow() === 0) lb.appendRow(["Rank", "CrewID", "Name", "Status", "Score_L1", "Score_L2", "Score_L3", "Avg_Score", "Total_Points", "Last_Seen", "Last_Scan", "Last_Scan_Time", "Path_Trace", "Scan_Count", "Journey", "Device_ID", "Session_ID"]);
  
  let el = getSheet(ss, "EventLogs");
  if (el.getLastRow() === 0) el.appendRow(["Timestamp", "Type", "Category", "Device_ID", "Session_ID", "Page", "Raw"]);

  let pa = getSheet(ss, "PathAnalytics");
  if (pa.getLastRow() === 0) pa.appendRow(["CrewID", "Name", "Path", "Scans", "Internal_Marks", "Avg_Score", "Last_Scan", "Last_Scan_Time"]);
}

function getSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function overwriteSheet(ss, name, data) {
  let sheet = getSheet(ss, name);
  sheet.clear(); // Clear everything
  
  if (!data || data.length === 0) {
    setupHeaders(ss); // Restore empty headers
    return;
  }
  
  // Extract headers dynamically from the first object
  // But we want to preserve specific column order if possible
  // For simplicity, we trust the object keys.
  const headers = Object.keys(data[0]);
  
  // Prepare 2D array: Headers first
  const values = [headers];
  
  // Rows
  data.forEach(item => {
    values.push(headers.map(h => {
      const val = item[h];
      return (val === null || val === undefined) ? "" : val;
    }));
  });
  
  // Write all at once
  if (values.length > 0) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }
}

function updateCrewStanding(ss, crew) {
  let sheet = getSheet(ss, "Leaderboard");
  // Ensure headers exist
  if (sheet.getLastRow() === 0) setupHeaders(ss);
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const crewIdCol = headers.indexOf("CrewID");
  
  if (crewIdCol === -1) return; // Should not happen if headers are set

  const lastRow = sheet.getLastRow();
  let rowIndex = -1;
  if (lastRow > 1) {
    const targetCrewId = String(crew.CrewID || '').trim();
    const ids = sheet.getRange(2, crewIdCol + 1, lastRow - 1, 1)
      .getValues()
      .flat()
      .map(v => String(v || '').trim());
    rowIndex = ids.indexOf(targetCrewId) + 2;
  }
  
  const rowData = headers.map(h => {
    const val = crew[h];
    return (val === null || val === undefined) ? "" : val;
  });
  
  if (rowIndex > 1) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function updateCrewPathAnalytics(ss, crew) {
  if (!crew) return;
  let sheet = getSheet(ss, "PathAnalytics");
  if (sheet.getLastRow() === 0) setupHeaders(ss);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const crewIdCol = headers.indexOf("CrewID");
  if (crewIdCol === -1) return;

  const crewId = String(crew.CrewID || '').trim();
  if (!crewId) return;

  const lastRow = sheet.getLastRow();
  let rowIndex = -1;
  if (lastRow > 1) {
    const ids = sheet.getRange(2, crewIdCol + 1, lastRow - 1, 1)
      .getValues()
      .flat()
      .map(v => String(v || '').trim());
    rowIndex = ids.indexOf(crewId) + 2;
  }

  const mapped = {
    CrewID: crewId,
    Name: crew.Name || "",
    Path: crew.Path_Trace || "",
    Scans: crew.Scan_Count || 0,
    Internal_Marks: (crew.Internal_Marks !== undefined && crew.Internal_Marks !== null) ? crew.Internal_Marks : (crew.Score_L3 || 0),
    Avg_Score: crew.Avg_Score || 0,
    Last_Scan: crew.Last_Scan || "",
    Last_Scan_Time: crew.Last_Scan_Time || crew.Last_Seen || ""
  };

  const rowData = headers.map(h => {
    const val = mapped[h];
    return (val === null || val === undefined) ? "" : val;
  });

  if (rowIndex > 1) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function ensureRequiredHeaders(ss) {
  ensureSheetHeaders(ss, "Leaderboard", ["Rank", "CrewID", "Name", "Status", "Score_L1", "Score_L2", "Score_L3", "Avg_Score", "Total_Points", "Last_Seen", "Last_Scan", "Last_Scan_Time", "Path_Trace", "Scan_Count", "Journey", "Device_ID", "Session_ID"]);
  ensureSheetHeaders(ss, "EventLogs", ["Timestamp", "Type", "Category", "Device_ID", "Session_ID", "Page", "Raw"]);
  ensureSheetHeaders(ss, "PathAnalytics", ["CrewID", "Name", "Path", "Scans", "Internal_Marks", "Avg_Score", "Last_Scan", "Last_Scan_Time"]);
}

function ensureSheetHeaders(ss, name, requiredHeaders) {
  const sheet = getSheet(ss, name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(requiredHeaders);
    return;
  }

  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    sheet.appendRow(requiredHeaders);
    return;
  }

  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const missing = requiredHeaders.filter(h => !current.includes(h));
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
}

function appendLine(ss, name, row) {
  let sheet = getSheet(ss, name);
  if (sheet.getLastRow() === 0) setupHeaders(ss);
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = headers.map(h => {
    const val = row[h];
    return (val === null || val === undefined) ? "-" : val;
  });
  sheet.appendRow(data);
}

function appendLines(ss, name, rows) {
  if (!rows || rows.length === 0) return;

  let sheet = getSheet(ss, name);
  if (sheet.getLastRow() === 0) setupHeaders(ss);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = rows.map(row => headers.map(h => {
    const val = row[h];
    return (val === null || val === undefined) ? "-" : val;
  }));
  const startRow = sheet.getLastRow() + 1;

  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
}
