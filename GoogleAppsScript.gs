/**
 * GOOGLE APPS SCRIPT: PROFESSIONAL MULTI-USER DATABASE
 * Optimized for 40+ Concurrent Teams via LockService
 */

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureRequiredHeaders(ss);
  const result = {
    leaderboard: getSheetData(ss, "Leaderboard"),
    logs: getSheetData(ss, "EventLogs"),
    paths: getSheetData(ss, "PathAnalytics")
  };
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // 🔒 CRITICAL: Lock Service prevents "Race Conditions"
  var lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000); 
  } catch (e) {
    return ContentService.createTextOutput("Server Busy: Try Again").setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    const data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureRequiredHeaders(ss);
    
    // ACTION: RESET FULL GAME
    if (data.action === "RESET_GAME") {
      clearSheet(ss, "Leaderboard");
      clearSheet(ss, "EventLogs");
      clearSheet(ss, "PathAnalytics");
      setupHeaders(ss); // Restore headers
      return ContentService.createTextOutput("Game Reset Successful").setMimeType(ContentService.MimeType.TEXT);
    }
    
    // ACTION: BULK SYNC (Overwrite)
    if (data.action === "BULK_SYNC") {
      // If data is provided, overwrite. If not (or empty array), it clears.
      // We must handle headers if data is empty.
      
      overwriteSheet(ss, "Leaderboard", data.tier1 || []);
      overwriteSheet(ss, "PathAnalytics", data.tier2 || []);
      overwriteSheet(ss, "EventLogs", data.tier3 || []);
      
      return ContentService.createTextOutput("Bulk Sync Successful").setMimeType(ContentService.MimeType.TEXT);
    }
    
    // TIER 1: Individual Crew Update
    if (data.action === "UPDATE_CREW") {
      updateCrewStanding(ss, data.crewData);
    } 
    // TIER 2: Event Logging
    else if (data.action === "LOG_EVENT") {
      appendLine(ss, "EventLogs", data.event);
    }
    // TIER 2B: Batched Event Logging
    else if (data.action === "BATCH_EVENTS") {
      appendLines(ss, "EventLogs", data.events || []);
    }
    
    SpreadsheetApp.flush();
    return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    lock.releaseLock();
  }
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
  if (lb.getLastRow() === 0) lb.appendRow(["Rank", "CrewID", "Name", "Status", "Score_L1", "Score_L2", "Score_L3", "Total_Points", "Last_Seen", "Path_Trace", "Scan_Count", "Journey", "Device_ID", "Session_ID"]);
  
  let el = getSheet(ss, "EventLogs");
  if (el.getLastRow() === 0) el.appendRow(["Timestamp", "Type", "Category", "Device_ID", "Session_ID", "Page", "Raw"]);

  let pa = getSheet(ss, "PathAnalytics");
  if (pa.getLastRow() === 0) pa.appendRow(["CrewID", "Name", "Path", "Scans", "Internal_Marks", "Avg_Score", "Last_Scan"]);
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
    const ids = sheet.getRange(2, crewIdCol + 1, lastRow - 1, 1).getValues().flat();
    rowIndex = ids.indexOf(String(crew.CrewID)) + 2;
  }
  
  const rowData = headers.map(h => crew[h] || "");
  
  if (rowIndex > 1) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function ensureRequiredHeaders(ss) {
  ensureSheetHeaders(ss, "Leaderboard", ["Rank", "CrewID", "Name", "Status", "Score_L1", "Score_L2", "Score_L3", "Total_Points", "Last_Seen", "Path_Trace", "Scan_Count", "Journey", "Device_ID", "Session_ID"]);
  ensureSheetHeaders(ss, "EventLogs", ["Timestamp", "Type", "Category", "Device_ID", "Session_ID", "Page", "Raw"]);
  ensureSheetHeaders(ss, "PathAnalytics", ["CrewID", "Name", "Path", "Scans", "Internal_Marks", "Avg_Score", "Last_Scan"]);
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
  const data = headers.map(h => row[h] || "-"); 
  sheet.appendRow(data);
}

function appendLines(ss, name, rows) {
  if (!rows || rows.length === 0) return;

  let sheet = getSheet(ss, name);
  if (sheet.getLastRow() === 0) setupHeaders(ss);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = rows.map(row => headers.map(h => row[h] || "-"));
  const startRow = sheet.getLastRow() + 1;

  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
}
