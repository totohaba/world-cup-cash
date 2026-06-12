let REQUEST_CACHE_ = {
  headers: {},
  rows: {},
  settings: {},
};

function resetRequestCache_() {
  REQUEST_CACHE_ = {
    headers: {},
    rows: {},
    settings: {},
  };
}

function invalidateSheetCache_(sheetName) {
  delete REQUEST_CACHE_.headers[sheetName];
  delete REQUEST_CACHE_.rows[sheetName];

  if (sheetName === "Settings") {
    REQUEST_CACHE_.settings = {};
  }
}

function testBackendSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const requiredSheets = [
    "Settings",
    "Phases",
    "Teams",
    "Matches",
    "Players",
    "Picks",
    "SettlementLog",
  ];

  const result = requiredSheets.map((name) => {
    const sheet = ss.getSheetByName(name);

    if (!sheet) {
      return {
        sheet: name,
        found: false,
        rows: 0,
        columns: 0,
      };
    }

    return {
      sheet: name,
      found: true,
      rows: sheet.getLastRow(),
      columns: sheet.getLastColumn(),
    };
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getSheetRows_(sheetName) {
  if (REQUEST_CACHE_.rows[sheetName]) {
    return REQUEST_CACHE_.rows[sheetName].map((row) => ({ ...row }));
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Missing sheet: ${sheetName}`);
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    REQUEST_CACHE_.rows[sheetName] = [];
    return [];
  }

  const headers = values[0].map((header) => String(header).trim());

  const rows = values.slice(1).map((row) => {
    const item = {};

    headers.forEach((header, index) => {
      item[header] = row[index];
    });

    return item;
  });

  REQUEST_CACHE_.rows[sheetName] = rows;
  return rows.map((row) => ({ ...row }));
}

function testReadGameData() {
  const settings = getSheetRows_("Settings");
  const phases = getSheetRows_("Phases");
  const teams = getSheetRows_("Teams");
  const matches = getSheetRows_("Matches");

  const result = {
    settingsCount: settings.length,
    phasesCount: phases.length,
    teamsCount: teams.length,
    matchesCount: matches.length,
    activePhase: settings.find((row) => row.key === "active_phase")?.value,
    firstTeam: teams[0],
    firstMatch: matches[0],
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getSetting_(key) {
  if (Object.prototype.hasOwnProperty.call(REQUEST_CACHE_.settings, key)) {
    return REQUEST_CACHE_.settings[key];
  }

  const settings = getSheetRows_("Settings");
  const row = settings.find((item) => item.key === key);
  const value = row ? row.value : null;
  REQUEST_CACHE_.settings[key] = value;
  return value;
}

function setSetting_(key, value) {
  const settings = getSheetRows_("Settings");
  const settingIndex = settings.findIndex((item) => item.key === key);

  if (settingIndex < 0) {
    throw new Error(`Missing setting: ${key}`);
  }

  settings[settingIndex].value = value;
  updateObjectRow_("Settings", settingIndex + 2, settings[settingIndex]);
}

const ODDS_API_SPORT_KEY_ = "soccer_fifa_world_cup";
const ODDS_API_BOOKMAKER_KEY_ = "pinnacle";
const ODDS_STATUS_PROPERTY_ = "ODDS_UPDATE_STATUS";
const SCORE_STATUS_PROPERTY_ = "SCORE_CHECK_STATUS";
const SCORE_STATE_PROPERTY_ = "SCORE_CHECK_STATE";

function getOddsApiKey_() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ODDS_API_KEY");

  if (!apiKey) {
    throw new Error("Missing ODDS_API_KEY in Apps Script properties.");
  }

  return apiKey;
}

function fetchOddsApiJson_(path, params) {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const response = UrlFetchApp.fetch(`https://api.the-odds-api.com${path}?${query}`, {
    muteHttpExceptions: true,
  });
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(`The Odds API returned ${responseCode}: ${responseText.slice(0, 300)}`);
  }

  return {
    data: JSON.parse(responseText),
    headers: response.getAllHeaders(),
  };
}

function normalizeOddsTeamName_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");
}

function getOddsTeamAliases_() {
  return {
    bosniaandherzegovina: "bosnia-herzegovina",
    caboverde: "cape-verde",
    capeverdeislands: "cape-verde",
    congodr: "dr-congo",
    czechrepublic: "czechia",
    democraticrepublicofthecongo: "dr-congo",
    iran: "iran",
    iriran: "iran",
    iranislamicrepublicof: "iran",
    ivorycoast: "cote-divoire",
    korearepublic: "south-korea",
    southkorea: "south-korea",
    turkey: "turkiye",
    unitedstates: "united-states",
    unitedstatesofamerica: "united-states",
    usa: "united-states",
  };
}

function getResponseHeader_(headers, name) {
  const target = String(name).toLowerCase();
  const key = Object.keys(headers || {}).find((header) => {
    return String(header).toLowerCase() === target;
  });

  return key ? headers[key] : "";
}

function buildOddsTeamIndex_(teams) {
  const index = { ...getOddsTeamAliases_() };

  teams.forEach((team) => {
    index[normalizeOddsTeamName_(team.team)] = team.team_slug;
    index[normalizeOddsTeamName_(team.team_slug)] = team.team_slug;
  });

  return index;
}

function parseOddsApiTime_(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function findOddsEventForMatch_(match, events, teamIndex) {
  const localTeams = [match.team_a, match.team_b].sort().join("|");
  const kickoff = getMatchKickoff_(match);

  if (!kickoff) {
    return null;
  }

  const candidates = events.filter((event) => {
    const apiTeams = [
      teamIndex[normalizeOddsTeamName_(event.home_team)],
      teamIndex[normalizeOddsTeamName_(event.away_team)],
    ];

    if (apiTeams.some((team) => !team) || apiTeams.sort().join("|") !== localTeams) {
      return false;
    }

    const apiKickoff = parseOddsApiTime_(event.commence_time);
    return apiKickoff && Math.abs(apiKickoff.getTime() - kickoff.getTime()) <= 12 * 60 * 60 * 1000;
  });

  return candidates.length === 1 ? candidates[0] : null;
}

function getPinnaclePrices_(event, teamIndex) {
  const bookmaker = (event.bookmakers || []).find((item) => item.key === ODDS_API_BOOKMAKER_KEY_);
  const market = bookmaker && (bookmaker.markets || []).find((item) => item.key === "h2h");

  if (!market) {
    return null;
  }

  const prices = {
    teamA: null,
    teamB: null,
    draw: null,
    lastUpdate: bookmaker.last_update || "",
  };

  (market.outcomes || []).forEach((outcome) => {
    const normalizedName = normalizeOddsTeamName_(outcome.name);
    const teamSlug = teamIndex[normalizedName];

    if (normalizedName === "draw") {
      prices.draw = Number(outcome.price) || null;
    } else if (teamSlug) {
      prices[teamSlug] = Number(outcome.price) || null;
    }
  });

  return prices;
}

function saveOddsUpdateStatus_(status) {
  PropertiesService.getScriptProperties().setProperty(
    ODDS_STATUS_PROPERTY_,
    JSON.stringify(status)
  );
}

function getOddsUpdateStatus() {
  const saved = PropertiesService.getScriptProperties().getProperty(ODDS_STATUS_PROPERTY_);
  let status = {
    ok: false,
    lastAttemptAt: "",
    lastSuccessAt: "",
    updatedCount: 0,
    warnings: ["Betting odds have not been updated yet."],
  };

  if (saved) {
    try {
      status = { ...status, ...JSON.parse(saved) };
    } catch (error) {
      status.warnings = ["Saved odds update status could not be read."];
    }
  }

  if (status.lastSuccessAt) {
    const ageMs = Date.now() - new Date(status.lastSuccessAt).getTime();

    if (ageMs > 36 * 60 * 60 * 1000) {
      status.ok = false;
      status.warnings = [
        ...(status.warnings || []),
        "The last successful odds update was more than 36 hours ago.",
      ];
    }
  }

  return status;
}

function updateBettingOdds() {
  const apiKey = getOddsApiKey_();
  const attemptedAt = nowIso_();
  const previousStatus = getOddsUpdateStatus();

  try {
    const eventsResponse = fetchOddsApiJson_(
      `/v4/sports/${ODDS_API_SPORT_KEY_}/events`,
      { apiKey, dateFormat: "iso" }
    );
    const oddsResponse = fetchOddsApiJson_(
      `/v4/sports/${ODDS_API_SPORT_KEY_}/odds`,
      {
        apiKey,
        bookmakers: ODDS_API_BOOKMAKER_KEY_,
        markets: "h2h",
        oddsFormat: "decimal",
        dateFormat: "iso",
      }
    );
    const teams = getSheetRows_("Teams");
    const matches = getSheetRows_("Matches");
    const activePhaseName = getSetting_("active_phase");
    const teamIndex = buildOddsTeamIndex_(teams);
    const oddsByEventId = indexBy_(oddsResponse.data || [], "id");
    const warnings = [];
    const updates = [];

    matches.forEach((match, index) => {
      const status = String(match.status || "future").toLowerCase();

      if (
        match.phase !== activePhaseName ||
        ["final", "settled", "complete"].includes(status) ||
        isMatchBettingLocked_(match)
      ) {
        return;
      }

      const event = findOddsEventForMatch_(match, eventsResponse.data || [], teamIndex);

      if (!event) {
        warnings.push(`${match.match_id}: schedule could not be matched.`);
        return;
      }

      const oddsEvent = oddsByEventId[event.id];
      const prices = oddsEvent ? getPinnaclePrices_(oddsEvent, teamIndex) : null;
      const teamAOdds = prices && prices[match.team_a];
      const teamBOdds = prices && prices[match.team_b];
      const isGroupMatch = /group/i.test(String(match.phase || ""));

      if (!prices || !teamAOdds || !teamBOdds || (isGroupMatch && !prices.draw)) {
        warnings.push(`${match.match_id}: Pinnacle odds are unavailable.`);
        return;
      }

      match.team_a_decimal_odds = teamAOdds;
      match.team_b_decimal_odds = teamBOdds;

      if (prices.draw) {
        match.draw_decimal_odds = prices.draw;
      }

      updateObjectRow_("Matches", index + 2, match);
      updates.push({
        matchId: match.match_id,
        teamAOdds,
        teamBOdds,
        drawOdds: prices.draw,
        bookmakerUpdatedAt: prices.lastUpdate,
      });
    });

    const status = {
      ok: warnings.length === 0,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      updatedCount: updates.length,
      warnings,
      requestsRemaining: getResponseHeader_(oddsResponse.headers, "x-requests-remaining"),
      updates,
    };
    saveOddsUpdateStatus_(status);
    return status;
  } catch (error) {
    const status = {
      ok: false,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: previousStatus.lastSuccessAt || "",
      updatedCount: 0,
      warnings: [error.message],
    };
    saveOddsUpdateStatus_(status);
    throw error;
  }
}

function ensureDailyOddsTrigger() {
  const handler = "runDailyOddsUpdate";
  const exists = ScriptApp.getProjectTriggers().some((trigger) => {
    return trigger.getHandlerFunction() === handler;
  });

  if (!exists) {
    ScriptApp.newTrigger(handler)
      .timeBased()
      .everyDays(1)
      .atHour(6)
      .inTimezone("America/Los_Angeles")
      .create();
  }

  return { installed: true, alreadyExisted: exists };
}

function runDailyOddsUpdate() {
  return updateBettingOdds();
}

function isGroupPhase_(phaseName) {
  return /group/i.test(String(phaseName || ""));
}

function getScoreCheckState_() {
  const saved = PropertiesService.getScriptProperties().getProperty(SCORE_STATE_PROPERTY_);

  if (!saved) {
    return {};
  }

  try {
    return JSON.parse(saved);
  } catch (error) {
    return {};
  }
}

function saveScoreCheckState_(state) {
  PropertiesService.getScriptProperties().setProperty(
    SCORE_STATE_PROPERTY_,
    JSON.stringify(state)
  );
}

function saveScoreCheckStatus_(status) {
  PropertiesService.getScriptProperties().setProperty(
    SCORE_STATUS_PROPERTY_,
    JSON.stringify(status)
  );
}

function getScoreCheckStatus() {
  const saved = PropertiesService.getScriptProperties().getProperty(SCORE_STATUS_PROPERTY_);
  let status = {
    ok: true,
    lastAttemptAt: "",
    lastSuccessAt: "",
    checkedCount: 0,
    importedCount: 0,
    warnings: [],
  };

  if (saved) {
    try {
      status = { ...status, ...JSON.parse(saved) };
    } catch (error) {
      status.ok = false;
      status.warnings = ["Saved score check status could not be read."];
    }
  }

  const activePhaseName = getSetting_("active_phase");
  const tiedKnockouts = getSheetRows_("Matches").filter((match) => {
    return (
      match.phase === activePhaseName &&
      !isGroupPhase_(match.phase) &&
      String(match.status || "").toLowerCase() === "final" &&
      Number(match.team_a_goals) === Number(match.team_b_goals) &&
      !match.team_advanced
    );
  });

  if (tiedKnockouts.length) {
    status.ok = false;
    status.warnings = [
      ...(status.warnings || []).filter((warning) => !/advancing team/i.test(warning)),
      ...tiedKnockouts.map((match) => `${match.match_id}: select the advancing team before settlement.`),
    ];
  }

  return status;
}

function getEligibleScoreChecks_(options) {
  const force = Boolean(options && options.force);
  const now = new Date();
  const activePhaseName = getSetting_("active_phase");
  const state = getScoreCheckState_();
  const matches = getSheetRows_("Matches");

  return matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => {
      const status = String(match.status || "future").toLowerCase();

      if (
        match.phase !== activePhaseName ||
        ["final", "settled", "complete"].includes(status) ||
        hasMatchScore_(match)
      ) {
        return false;
      }

      const kickoff = getMatchKickoff_(match);

      if (!kickoff) {
        return false;
      }

      const matchState = state[match.match_id] || {};
      const due120 = new Date(kickoff.getTime() + 120 * 60 * 1000);
      const due180 = new Date(kickoff.getTime() + 180 * 60 * 1000);

      if (isGroupPhase_(match.phase)) {
        return now >= due120 && (force || !matchState.checked120At);
      }

      if (matchState.awaitingTieRecheck) {
        return now >= due180 && (force || !matchState.checked180At);
      }

      return now >= due120 && (force || !matchState.checked120At);
    });
}

function getScoreForTeam_(event, teamSlug, teamIndex) {
  const score = (event.scores || []).find((item) => {
    return teamIndex[normalizeOddsTeamName_(item.name)] === teamSlug;
  });

  if (!score || score.score === "" || score.score == null) {
    return null;
  }

  const value = Number(score.score);
  return Number.isFinite(value) ? value : null;
}

function checkMatchScores(input) {
  const force = String(input && input.force || "") === "true";
  const eligible = getEligibleScoreChecks_({ force });
  const attemptedAt = nowIso_();
  const previousStatus = getScoreCheckStatus();

  if (!eligible.length) {
    const status = {
      ok: true,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: previousStatus.lastSuccessAt || "",
      checkedCount: 0,
      importedCount: 0,
      warnings: [],
      requestsRemaining: previousStatus.requestsRemaining || "",
    };
    saveScoreCheckStatus_(status);
    return status;
  }

  try {
    const response = fetchOddsApiJson_(
      `/v4/sports/${ODDS_API_SPORT_KEY_}/scores`,
      {
        apiKey: getOddsApiKey_(),
        daysFrom: 3,
        dateFormat: "iso",
      }
    );
    const teams = getSheetRows_("Teams");
    const teamIndex = buildOddsTeamIndex_(teams);
    const state = getScoreCheckState_();
    const warnings = [];
    const imports = [];
    const now = new Date();

    eligible.forEach(({ match, index }) => {
      const kickoff = getMatchKickoff_(match);
      const due180 = new Date(kickoff.getTime() + 180 * 60 * 1000);
      const matchState = state[match.match_id] || {};
      const isSecondCheck = !isGroupPhase_(match.phase) && matchState.awaitingTieRecheck && now >= due180;
      const event = findOddsEventForMatch_(match, response.data || [], teamIndex);

      if (isSecondCheck) {
        matchState.checked180At = attemptedAt;
      } else {
        matchState.checked120At = attemptedAt;
      }

      if (!event) {
        warnings.push(`${match.match_id}: score event could not be matched.`);
        state[match.match_id] = matchState;
        return;
      }

      const teamAGoals = getScoreForTeam_(event, match.team_a, teamIndex);
      const teamBGoals = getScoreForTeam_(event, match.team_b, teamIndex);

      if (teamAGoals === null || teamBGoals === null) {
        warnings.push(`${match.match_id}: scores are not available yet.`);
        state[match.match_id] = matchState;
        return;
      }

      if (!event.completed) {
        if (!isGroupPhase_(match.phase) && teamAGoals === teamBGoals && !isSecondCheck) {
          matchState.awaitingTieRecheck = true;
        }

        warnings.push(`${match.match_id}: match is not marked complete yet.`);
        state[match.match_id] = matchState;
        return;
      }

      if (!isGroupPhase_(match.phase) && teamAGoals === teamBGoals && !isSecondCheck) {
        matchState.awaitingTieRecheck = true;
        warnings.push(`${match.match_id}: tied knockout will be checked again 180 minutes after kickoff.`);
        state[match.match_id] = matchState;
        return;
      }

      match.team_a_goals = teamAGoals;
      match.team_b_goals = teamBGoals;
      match.status = "final";
      updateObjectRow_("Matches", index + 2, match);
      matchState.awaitingTieRecheck = false;
      matchState.importedAt = attemptedAt;
      state[match.match_id] = matchState;
      const imported = {
        matchId: match.match_id,
        teamAGoals,
        teamBGoals,
        settled: false,
        settledPickCount: 0,
      };
      imports.push(imported);

      if (!isGroupPhase_(match.phase) && teamAGoals === teamBGoals) {
        warnings.push(`${match.match_id}: select the advancing team before settlement.`);
        return;
      }

      try {
        const settlement = settleMatch({
          matchId: match.match_id,
        });
        imported.settled = true;
        imported.settledPickCount = settlement.settledPickCount;
      } catch (error) {
        warnings.push(`${match.match_id}: score imported but automatic settlement failed: ${error.message}`);
      }
    });

    saveScoreCheckState_(state);
    const status = {
      ok: warnings.length === 0,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      checkedCount: eligible.length,
      importedCount: imports.length,
      settledCount: imports.filter((item) => item.settled).length,
      warnings,
      requestsRemaining: getResponseHeader_(response.headers, "x-requests-remaining"),
      imports,
    };
    saveScoreCheckStatus_(status);
    return status;
  } catch (error) {
    const status = {
      ok: false,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: previousStatus.lastSuccessAt || "",
      checkedCount: 0,
      importedCount: 0,
      warnings: [error.message],
      requestsRemaining: previousStatus.requestsRemaining || "",
    };
    saveScoreCheckStatus_(status);
    throw error;
  }
}

function ensureScoreCheckTrigger() {
  const handler = "runScheduledScoreCheck";
  const exists = ScriptApp.getProjectTriggers().some((trigger) => {
    return trigger.getHandlerFunction() === handler;
  });

  if (!exists) {
    ScriptApp.newTrigger(handler)
      .timeBased()
      .everyMinutes(30)
      .create();
  }

  return { installed: true, alreadyExisted: exists };
}

function runScheduledScoreCheck() {
  return checkMatchScores({ force: "false" });
}

function updateActivePhase_(updates) {
  const activePhaseName = getSetting_("active_phase");
  const phases = getSheetRows_("Phases");
  const phaseIndex = phases.findIndex((phase) => phase.phase_name === activePhaseName);

  if (phaseIndex < 0) {
    throw new Error(`Active phase not found: ${activePhaseName}`);
  }

  const phase = {
    ...phases[phaseIndex],
    ...updates,
  };

  updateObjectRow_("Phases", phaseIndex + 2, phase);
  return phase;
}

function normalizePhase_(phase, activePhaseName) {
  return {
    phaseId: phase.phase_id,
    phaseName: phase.phase_name,
    phaseOrder: toNumber_(phase.phase_order, 0),
    status: phase.status || "future",
    firstMatchTime: phase.first_match_time,
    lockTime: phase.lock_time,
    openedAt: phase.opened_at,
    lockedAt: phase.locked_at,
    settledAt: phase.settled_at,
    isActive: phase.phase_name === activePhaseName,
  };
}

function getGameState() {
  const activePhaseName = getSetting_("active_phase");
  const gameStatus = getSetting_("game_status");

  const phases = getSheetRows_("Phases");
  const players = getSheetRows_("Players");
  const matches = getSheetRows_("Matches");

  const activePhase = phases.find(
    (phase) => phase.phase_name === activePhaseName
  );

  const activeMatches = matches.filter(
    (match) => match.phase === activePhaseName
  );

  const result = {
    gameName: getSetting_("game_name"),
    gameStatus,
    activePhaseName,
    activePhase,
    playerCount: players.length,
    activeMatchCount: activeMatches.length,
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetGameState() {
  return getGameState();
}

function getSheet_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Missing sheet: ${sheetName}`);
  }

  return sheet;
}

function getHeaders_(sheetName) {
  if (REQUEST_CACHE_.headers[sheetName]) {
    return [...REQUEST_CACHE_.headers[sheetName]];
  }

  const sheet = getSheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((header) => String(header).trim());
  REQUEST_CACHE_.headers[sheetName] = headers;
  return [...headers];
}

function appendObjectRow_(sheetName, item) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const row = headers.map((header) => item[header] ?? "");
  sheet.appendRow(row);
  invalidateSheetCache_(sheetName);
}

function updateObjectRow_(sheetName, rowNumber, item) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const row = headers.map((header) => item[header] ?? "");
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  invalidateSheetCache_(sheetName);
}

function clearSheetData_(sheetName) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  invalidateSheetCache_(sheetName);
}

function csvEscape_(value) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function sheetToCsv_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();

  return values
    .map((row) => row.map(csvEscape_).join(","))
    .join("\n");
}

function updateAllPlayerDerivedBalances_() {
  const players = getSheetRows_("Players");
  const activePicks = getActivePicks_();

  players.forEach((player, index) => {
    const currentBalance = toNumber_(player.current_balance, getStartingBalance_());
    const activity = getPlayerActivity_(player.player_id, activePicks);
    player.pending_bets = activity.pendingBets;
    player.available_to_bet = currentBalance - activity.pendingBets;
    updateObjectRow_("Players", index + 2, player);
  });
}

function createId_(prefix) {
  return `${prefix}_${Utilities.getUuid()}`;
}

function nowIso_() {
  return new Date().toISOString();
}

function getMatchKickoff_(match) {
  const rawValue = match && match.match_date_time;

  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue;
  }

  const text = String(rawValue || "").trim().replace(/\s+(PT|PST|PDT)$/i, "");

  if (!text) {
    return null;
  }

  try {
    return Utilities.parseDate(text, "America/Los_Angeles", "yyyy-MM-dd hh:mm a");
  } catch (error) {
    return null;
  }
}

function getMatchLockTime_(match) {
  const kickoff = getMatchKickoff_(match);
  return kickoff ? new Date(kickoff.getTime() - 60 * 60 * 1000) : null;
}

function isMatchBettingLocked_(match, now) {
  const lockTime = getMatchLockTime_(match);
  return !lockTime || (now || new Date()).getTime() >= lockTime.getTime();
}

function formatPacificTime_(value) {
  return value
    ? Utilities.formatDate(value, "America/Los_Angeles", "MMM d, yyyy h:mm a 'PT'")
    : "";
}

function assertMatchBettable_(match) {
  const matchStatus = String(match.status || "future").trim();
  const pickableStatuses = ["future", "open", "setup"];

  if (!pickableStatuses.includes(matchStatus) || hasMatchScore_(match)) {
    throw new Error(`Picks are not allowed for matches with status: ${matchStatus}.`);
  }

  if (isMatchBettingLocked_(match)) {
    throw new Error("Betting locked one hour before this match.");
  }
}

function randomInt_(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getStartingBalance_() {
  const value = Number(getSetting_("starting_balance"));
  return Number.isFinite(value) ? value : 200;
}

function toWholeDollar_(value, fallback) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.floor(numberValue);
}

function validateDisplayName_(value) {
  const displayName = String(value || "").trim();

  if (!displayName) {
    throw new Error("Display name cannot be blank.");
  }

  if (displayName.length > 20) {
    throw new Error("Display name must be 20 characters or fewer.");
  }

  return displayName;
}

function hasDuplicateDisplayName_(players, displayName, excludedPlayerId) {
  const normalizedName = displayName.toLocaleLowerCase();

  return players.some((player) => {
    return player.player_id !== excludedPlayerId
      && String(player.display_name || "").trim().toLocaleLowerCase() === normalizedName;
  });
}

function ensureManagedDadAccount_() {
  ensureSheetHeaders_("Players", [
    "managed_by_player_id",
    "managed_player_role",
  ]);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const players = getSheetRows_("Players");
    const managerIndex = players.findIndex((player) => {
      return player.managed_player_role === "manager"
        || String(player.display_name || "").trim().toLocaleLowerCase() === "dat haba";
    });

    if (managerIndex < 0) {
      return [];
    }

    const manager = players[managerIndex];

    if (manager.managed_player_role !== "manager") {
      manager.managed_player_role = "manager";
      updateObjectRow_("Players", managerIndex + 2, manager);
    }

    let dad = players.find((player) => player.managed_by_player_id === manager.player_id);

    if (!dad) {
      const existingDad = players.find((player) => {
        return String(player.display_name || "").trim().toLocaleLowerCase() === "dad";
      });

      if (existingDad) {
        throw new Error("The display name Dad is already in use by another player.");
      }

      const startingBalance = getStartingBalance_();
      const timestamp = nowIso_();
      dad = {
        player_id: createId_("player"),
        device_id: manager.device_id,
        display_name: "Dad",
        profile_photo_url: "",
        current_balance: startingBalance,
        pending_bets: 0,
        available_to_bet: startingBalance,
        total_winnings: 0,
        total_losses: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        joined_at: timestamp,
        last_seen_at: timestamp,
        is_admin: false,
        managed_by_player_id: manager.player_id,
        managed_player_role: "managed",
      };
      appendObjectRow_("Players", dad);
    }

    return [manager, dad];
  } finally {
    lock.releaseLock();
  }
}

function getManagedPlayersFor_(playerId) {
  const managedPlayers = ensureManagedDadAccount_();
  const hasAccess = managedPlayers.some((player) => player.player_id === playerId);
  return hasAccess ? managedPlayers : [];
}

function joinGame(input) {
  if (!input || !input.deviceId || !input.displayName) {
    throw new Error("joinGame requires deviceId and displayName.");
  }

  const deviceId = String(input.deviceId).trim();
  const displayName = validateDisplayName_(input.displayName);

  if (!deviceId) {
    throw new Error("deviceId cannot be blank.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const players = getSheetRows_("Players");
    const existingPlayer = players.find((player) => player.device_id === deviceId);

    if (existingPlayer) {
      return {
        created: false,
        player: existingPlayer,
      };
    }

    if (hasDuplicateDisplayName_(players, displayName, "")) {
      throw new Error("That display name is already in use.");
    }

    const startingBalance = getStartingBalance_();
    const timestamp = nowIso_();

    const player = {
      player_id: createId_("player"),
      device_id: deviceId,
      display_name: displayName,
      profile_photo_url: "",
      current_balance: startingBalance,
      pending_bets: 0,
      available_to_bet: startingBalance,
      total_winnings: 0,
      total_losses: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      joined_at: timestamp,
      last_seen_at: timestamp,
      is_admin: false,
    };

    appendObjectRow_("Players", player);

    return {
      created: true,
      player,
    };
  } finally {
    lock.releaseLock();
  }
}

function updatePlayerProfile(input) {
  if (!input || !input.playerId || !input.deviceId || !input.displayName) {
    throw new Error("updatePlayerProfile requires playerId, deviceId, and displayName.");
  }

  const playerId = String(input.playerId).trim();
  const deviceId = String(input.deviceId).trim();
  const displayName = validateDisplayName_(input.displayName);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const players = getSheetRows_("Players");
    const playerIndex = players.findIndex((player) => player.player_id === playerId);

    if (playerIndex < 0) {
      throw new Error("Player not found.");
    }

    const player = players[playerIndex];

    if (String(player.device_id || "") !== deviceId) {
      throw new Error("This browser cannot update that profile.");
    }

    if (hasDuplicateDisplayName_(players, displayName, playerId)) {
      throw new Error("That display name is already in use.");
    }

    player.display_name = displayName;
    player.last_seen_at = nowIso_();
    updateObjectRow_("Players", playerIndex + 2, player);

    return {
      updated: true,
      player,
    };
  } finally {
    lock.releaseLock();
  }
}

function testJoinGame() {
  const testDeviceId = "test-device-001";
  const result = joinGame({
    deviceId: testDeviceId,
    displayName: "Test Player",
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function indexBy_(rows, key) {
  return rows.reduce((index, row) => {
    index[row[key]] = row;
    return index;
  }, {});
}

function normalizeTeam_(team) {
  if (!team) {
    return null;
  }

  return {
    team: team.team,
    group: team.group || team.Group || "",
    fifaRank: Number(team.fifa_rank),
    nickname: team.nickname,
    starPlayer: team.star_player,
    starPlayerPosition: team.star_player_position,
    teamSlug: team.team_slug,
    flagImage: team.flag_image,
    emblemImage: team.emblem_image,
    starPlayerImage: team.star_player_image,
  };
}

function hasMatchScore_(match) {
  return match.team_a_goals !== "" && match.team_a_goals != null && match.team_b_goals !== "" && match.team_b_goals != null;
}

function normalizeMatch_(match, teamsBySlug) {
  const teamA = teamsBySlug[match.team_a];
  const teamB = teamsBySlug[match.team_b];
  const lockTime = getMatchLockTime_(match);

  return {
    phase: match.phase,
    matchId: match.match_id,
    matchDateTime: match.match_date_time,
    teamA: normalizeTeam_(teamA),
    teamB: normalizeTeam_(teamB),
    teamASlug: match.team_a,
    teamBSlug: match.team_b,
    teamADecimalOdds: Number(match.team_a_decimal_odds) || null,
    teamBDecimalOdds: Number(match.team_b_decimal_odds) || null,
    drawDecimalOdds: Number(match.draw_decimal_odds) || null,
    teamAGoals: match.team_a_goals,
    teamBGoals: match.team_b_goals,
    teamAdvanced: match.team_advanced,
    status: match.status || "future",
    lockTime: formatPacificTime_(lockTime),
    bettingLocked: isMatchBettingLocked_(match),
  };
}

function getMatches(input) {
  const activePhaseName = getSetting_("active_phase");
  const phaseName = input && input.phase ? String(input.phase).trim() : activePhaseName;

  const teams = getSheetRows_("Teams");
  const matches = getSheetRows_("Matches");
  const teamsBySlug = indexBy_(teams, "team_slug");

  const phaseMatches = matches
    .filter((match) => match.phase === phaseName)
    .map((match) => normalizeMatch_(match, teamsBySlug));

  return {
    phaseName,
    count: phaseMatches.length,
    matches: phaseMatches,
  };
}

function getPhases() {
  const activePhaseName = getSetting_("active_phase");
  const phases = getSheetRows_("Phases")
    .map((phase) => normalizePhase_(phase, activePhaseName))
    .sort((a, b) => a.phaseOrder - b.phaseOrder);

  return {
    activePhaseName,
    count: phases.length,
    phases,
  };
}

function testGetPhases() {
  const result = getPhases();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetMatches() {
  const result = getMatches({
    phase: "Group Matchday 1",
  });

  console.log(JSON.stringify({
    phaseName: result.phaseName,
    count: result.count,
    firstMatch: result.matches[0],
  }, null, 2));

  return result;
}

function getDecimalOddsForSelection_(match, selectedTeam) {
  if (selectedTeam === match.team_a) {
    return Number(match.team_a_decimal_odds) || null;
  }

  if (selectedTeam === match.team_b) {
    return Number(match.team_b_decimal_odds) || null;
  }

  throw new Error("Selected team is not in this match.");
}

function savePick(input) {
  if (!input || !input.playerId || !input.matchId || !input.selectedTeam) {
    throw new Error("savePick requires playerId, matchId, and selectedTeam.");
  }

  const playerId = String(input.playerId).trim();
  const matchId = String(input.matchId).trim();
  const selectedTeam = String(input.selectedTeam).trim();
  const houseBetAmount = Number(getSetting_("house_bet_amount")) || 1;
  const gameStatus = String(getSetting_("game_status") || "").trim();
  const activePhaseName = getSetting_("active_phase");
  const totalBetAmount = Math.max(houseBetAmount, toWholeDollar_(input.totalBetAmount, houseBetAmount));
  const playerCashStake = Math.max(0, totalBetAmount - houseBetAmount);
  const timestamp = nowIso_();

  if (gameStatus === "settling" || gameStatus === "complete") {
    throw new Error(`Picks are not allowed while game status is ${gameStatus}.`);
  }

  const players = getSheetRows_("Players");
  const player = players.find((item) => item.player_id === playerId);

  if (!player) {
    throw new Error("Player not found.");
  }

  const matches = getSheetRows_("Matches");
  const match = matches.find((item) => item.match_id === matchId);

  if (!match) {
    throw new Error("Match not found.");
  }

  if (match.phase !== activePhaseName) {
    throw new Error("Picks are only allowed for the active phase.");
  }

  assertMatchBettable_(match);

  const decimalOdds = getDecimalOddsForSelection_(match, selectedTeam);
  const potentialPayout = totalBetAmount * decimalOdds;
  const picks = getSheetRows_("Picks");
  const existingPickIndex = picks.findIndex((pick) => {
    return pick.player_id === playerId && pick.match_id === matchId && pick.status === "active";
  });
  const existingPlayerCashStake = existingPickIndex >= 0
    ? toNumber_(picks[existingPickIndex].player_cash_stake, 0)
    : 0;
  const activePicks = picks.filter((pick) => pick.status === "active");
  const activity = getPlayerActivity_(playerId, activePicks);
  const currentBalance = toNumber_(player.current_balance, getStartingBalance_());
  const availableToBet = currentBalance - activity.pendingBets + existingPlayerCashStake;

  if (playerCashStake > availableToBet) {
    throw new Error(`You only have $${availableToBet.toFixed(0)} available to add to this pick.`);
  }

  const pick = {
    pick_id: existingPickIndex >= 0 ? picks[existingPickIndex].pick_id : createId_("pick"),
    player_id: playerId,
    match_id: matchId,
    phase: match.phase,
    selected_team: selectedTeam,
    total_bet_amount: totalBetAmount,
    house_bet_amount: houseBetAmount,
    player_cash_stake: playerCashStake,
    decimal_odds: decimalOdds,
    potential_payout: potentialPayout,
    status: "active",
    created_at: existingPickIndex >= 0 ? picks[existingPickIndex].created_at : timestamp,
    updated_at: timestamp,
    settled_at: "",
  };

  if (existingPickIndex >= 0) {
    updateObjectRow_("Picks", existingPickIndex + 2, pick);
  } else {
    appendObjectRow_("Picks", pick);
  }

  return {
    saved: true,
    pick,
  };
}

function cancelPick(input) {
  if (!input || !input.playerId || !input.matchId) {
    throw new Error("cancelPick requires playerId and matchId.");
  }

  const playerId = String(input.playerId).trim();
  const matchId = String(input.matchId).trim();
  const matches = getSheetRows_("Matches");
  const match = matches.find((item) => item.match_id === matchId);

  if (!match) {
    throw new Error("Match not found.");
  }

  if (match.phase !== getSetting_("active_phase")) {
    throw new Error("Picks can only be removed from the active phase.");
  }

  assertMatchBettable_(match);

  const picks = getSheetRows_("Picks");
  const pickIndex = picks.findIndex((pick) => {
    return pick.player_id === playerId && pick.match_id === matchId && pick.status === "active";
  });

  if (pickIndex < 0) {
    throw new Error("Active pick not found.");
  }

  const pick = picks[pickIndex];
  pick.status = "cancelled";
  pick.updated_at = nowIso_();
  pick.settled_at = "";
  updateObjectRow_("Picks", pickIndex + 2, pick);
  updateAllPlayerDerivedBalances_();

  return {
    cancelled: true,
    pick: normalizePick_(pick),
  };
}

function testSavePick() {
  const players = getSheetRows_("Players");
  const matches = getSheetRows_("Matches");

  const result = savePick({
    playerId: players[0].player_id,
    matchId: matches[0].match_id,
    selectedTeam: matches[0].team_a,
    totalBetAmount: 1,
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function normalizePick_(pick) {
  return {
    pickId: pick.pick_id,
    playerId: pick.player_id,
    matchId: pick.match_id,
    phase: pick.phase,
    selectedTeam: pick.selected_team,
    totalBetAmount: Number(pick.total_bet_amount) || 0,
    houseBetAmount: Number(pick.house_bet_amount) || 0,
    playerCashStake: Number(pick.player_cash_stake) || 0,
    decimalOdds: Number(pick.decimal_odds) || null,
    potentialPayout: Number(pick.potential_payout) || 0,
    status: pick.status,
    createdAt: pick.created_at,
    updatedAt: pick.updated_at,
    settledAt: pick.settled_at,
  };
}

function normalizeSettlementLog_(log) {
  return {
    settlementId: log.settlement_id,
    playerId: log.player_id,
    matchId: log.match_id,
    pickId: log.pick_id,
    settlementType: log.settlement_type,
    startingBalance: Number(log.starting_balance) || 0,
    playerCashStake: Number(log.player_cash_stake) || 0,
    totalPayout: Number(log.total_payout) || 0,
    endingBalance: Number(log.ending_balance) || 0,
    createdAt: log.created_at,
  };
}

function toNumber_(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getActivePicks_() {
  return getSheetRows_("Picks").filter((pick) => pick.status === "active");
}

function getPlayerActivity_(playerId, activePicks) {
  const playerPicks = activePicks.filter((pick) => pick.player_id === playerId);
  const pendingBets = playerPicks.reduce((total, pick) => {
    return total + toNumber_(pick.player_cash_stake, 0);
  }, 0);
  const potentialPayout = playerPicks.reduce((total, pick) => {
    return total + toNumber_(pick.potential_payout, 0);
  }, 0);

  return {
    activePickCount: playerPicks.length,
    pendingBets,
    potentialPayout,
  };
}

function normalizePlayer_(player, activePicks) {
  const currentBalance = toNumber_(player.current_balance, 200);
  const activity = getPlayerActivity_(player.player_id, activePicks);

  return {
    playerId: player.player_id,
    displayName: player.display_name,
    currentBalance,
    pendingBets: activity.pendingBets,
    availableToBet: currentBalance - activity.pendingBets,
    potentialPayout: activity.potentialPayout,
    activePickCount: activity.activePickCount,
    totalWinnings: toNumber_(player.total_winnings, 0),
    totalLosses: toNumber_(player.total_losses, 0),
    wins: toNumber_(player.wins, 0),
    losses: toNumber_(player.losses, 0),
    draws: toNumber_(player.draws, 0),
  };
}

function getPlayerPicks(input) {
  if (!input || !input.playerId) {
    throw new Error("getPlayerPicks requires playerId.");
  }

  const playerId = String(input.playerId).trim();
  const phaseName = input.phase ? String(input.phase).trim() : "";
  const picks = getSheetRows_("Picks")
    .filter((pick) => {
      const isPlayerPick = pick.player_id === playerId;
      const isActive = pick.status === "active";
      const isPhaseMatch = !phaseName || pick.phase === phaseName;
      return isPlayerPick && isActive && isPhaseMatch;
    })
    .map(normalizePick_);

  return {
    playerId,
    phaseName,
    count: picks.length,
    picks,
  };
}

function getPlayerPickHistory(input) {
  if (!input || !input.playerId) {
    throw new Error("getPlayerPickHistory requires playerId.");
  }

  const playerId = String(input.playerId).trim();
  const phaseName = input.phase ? String(input.phase).trim() : "";
  const matches = getSheetRows_("Matches");
  const teamsBySlug = indexBy_(getSheetRows_("Teams"), "team_slug");
  const matchesById = indexBy_(matches, "match_id");
  const picks = getSheetRows_("Picks")
    .filter((pick) => {
      const isPlayerPick = pick.player_id === playerId;
      const isPhaseMatch = !phaseName || pick.phase === phaseName;
      return isPlayerPick && isPhaseMatch;
    })
    .map((pick) => {
      const match = matchesById[pick.match_id];
      return {
        ...normalizePick_(pick),
        match: match ? normalizeMatch_(match, teamsBySlug) : null,
      };
    });

  return {
    playerId,
    phaseName,
    count: picks.length,
    picks,
  };
}

function getPhasePickSummary(input) {
  const activePhaseName = getSetting_("active_phase");
  const phaseName = input && input.phase ? String(input.phase).trim() : activePhaseName;
  const matches = getSheetRows_("Matches").filter((match) => match.phase === phaseName);
  const picks = getSheetRows_("Picks").filter((pick) => pick.phase === phaseName);
  const playersById = indexBy_(getSheetRows_("Players"), "player_id");
  const summaries = matches.reduce((index, match) => {
    index[match.match_id] = {
      matchId: match.match_id,
      phase: match.phase,
      activePickCount: 0,
      settledPickCount: 0,
      totalPickCount: 0,
      totalBetAmount: 0,
      totalPlayerCashStake: 0,
      potentialPayout: 0,
      selections: {},
      recentPicks: [],
    };
    return index;
  }, {});

  picks.forEach((pick) => {
    const summary = summaries[pick.match_id];

    if (!summary) {
      return;
    }

    const status = String(pick.status || "").trim();
    const selectedTeam = pick.selected_team || "unknown";
    const totalBetAmount = toNumber_(pick.total_bet_amount, 0);
    const playerCashStake = toNumber_(pick.player_cash_stake, 0);
    const potentialPayout = toNumber_(pick.potential_payout, 0);
    const player = playersById[pick.player_id];

    summary.totalPickCount += 1;
    summary.totalBetAmount += totalBetAmount;
    summary.totalPlayerCashStake += playerCashStake;
    summary.selections[selectedTeam] = (summary.selections[selectedTeam] || 0) + 1;

    if (status === "active") {
      summary.activePickCount += 1;
      summary.potentialPayout += potentialPayout;
    } else if (status === "won" || status === "lost" || status === "draw") {
      summary.settledPickCount += 1;
    }

    summary.recentPicks.push({
      playerName: player ? player.display_name : pick.player_id,
      selectedTeam,
      totalBetAmount,
      status,
    });
  });

  return {
    phaseName,
    summaries,
  };
}

function testGetPhasePickSummary() {
  const result = getPhasePickSummary({
    phase: "Group Matchday 1",
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetPlayerPicks() {
  const players = getSheetRows_("Players");
  const result = getPlayerPicks({
    playerId: players[0].player_id,
    phase: "Group Matchday 1",
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getSettlementLog(input) {
  const matchId = input && input.matchId ? String(input.matchId).trim() : "";
  const playerId = input && input.playerId ? String(input.playerId).trim() : "";
  const limit = Math.max(1, Math.min(50, Number(input && input.limit) || 20));
  const playersById = indexBy_(getSheetRows_("Players"), "player_id");
  const matchesById = indexBy_(getSheetRows_("Matches"), "match_id");
  const logs = getSheetRows_("SettlementLog")
    .filter((log) => {
      const matchesMatch = !matchId || log.match_id === matchId;
      const matchesPlayer = !playerId || log.player_id === playerId;
      return matchesMatch && matchesPlayer;
    })
    .slice(-limit)
    .reverse()
    .map((log) => {
      const normalized = normalizeSettlementLog_(log);
      const player = playersById[normalized.playerId];
      const match = matchesById[normalized.matchId];

      return {
        ...normalized,
        playerName: player ? player.display_name : normalized.playerId,
        matchLabel: match ? `${match.team_a} vs ${match.team_b}` : normalized.matchId,
      };
    });

  return {
    count: logs.length,
    logs,
  };
}

function testGetSettlementLog() {
  const result = getSettlementLog({
    limit: 10,
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getPlayerProfile(input) {
  if (!input || !input.playerId) {
    throw new Error("getPlayerProfile requires playerId.");
  }

  const playerId = String(input.playerId).trim();
  const activePicks = getActivePicks_();
  const player = getSheetRows_("Players").find((item) => item.player_id === playerId);

  if (!player) {
    throw new Error("Player not found.");
  }

  return {
    player: normalizePlayer_(player, activePicks),
  };
}

function getLeaderboard() {
  const activePicks = getActivePicks_();
  const players = getSheetRows_("Players")
    .map((player) => normalizePlayer_(player, activePicks))
    .sort((a, b) => {
      if (b.currentBalance !== a.currentBalance) {
        return b.currentBalance - a.currentBalance;
      }

      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      return a.displayName.localeCompare(b.displayName);
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

  return {
    count: players.length,
    players,
  };
}

function getPlayersSummary() {
  const activePicks = getActivePicks_();
  const players = getSheetRows_("Players")
    .map((player) => {
      const normalized = normalizePlayer_(player, activePicks);
      return {
        ...normalized,
        joinedAt: player.joined_at,
        lastSeenAt: player.last_seen_at,
        isAdmin: String(player.is_admin || "").toLowerCase() === "true",
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    count: players.length,
    players,
  };
}

function ensureSheetHeaders_(sheetName, requiredHeaders) {
  const sheet = getSheet_(sheetName);
  const existingHeaders = getHeaders_(sheetName);
  const missingHeaders = requiredHeaders.filter((header) => !existingHeaders.includes(header));

  if (!missingHeaders.length) {
    return;
  }

  sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  invalidateSheetCache_(sheetName);
}

function hashRecoveryToken_(token) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(token),
    Utilities.Charset.UTF_8
  );

  return bytes.map((byte) => {
    const value = byte < 0 ? byte + 256 : byte;
    return value.toString(16).padStart(2, "0");
  }).join("");
}

function generateRecoveryToken(input) {
  if (!input || !input.playerId) {
    throw new Error("generateRecoveryToken requires playerId.");
  }

  ensureSheetHeaders_("Players", [
    "recovery_token_hash",
    "recovery_token_created_at",
    "recovery_token_used_at",
  ]);

  const playerId = String(input.playerId).trim();
  getManagedPlayersFor_(playerId);
  const players = getSheetRows_("Players");
  const playerIndex = players.findIndex((player) => player.player_id === playerId);

  if (playerIndex < 0) {
    throw new Error("Player not found.");
  }

  const token = `${Utilities.getUuid()}${Utilities.getUuid()}`.replace(/-/g, "");
  const player = players[playerIndex];
  player.recovery_token_hash = hashRecoveryToken_(token);
  player.recovery_token_created_at = nowIso_();
  player.recovery_token_used_at = "";
  updateObjectRow_("Players", playerIndex + 2, player);

  return {
    playerId,
    displayName: player.display_name,
    token,
  };
}

function redeemRecoveryToken(input) {
  if (!input || !input.token) {
    throw new Error("Recovery token is required.");
  }

  ensureSheetHeaders_("Players", [
    "recovery_token_hash",
    "recovery_token_created_at",
    "recovery_token_used_at",
  ]);

  const tokenHash = hashRecoveryToken_(String(input.token).trim());
  const players = getSheetRows_("Players");
  const playerIndex = players.findIndex((player) => {
    return player.recovery_token_hash === tokenHash && !player.recovery_token_used_at;
  });

  if (playerIndex < 0) {
    throw new Error("Recovery link is invalid or has already been used.");
  }

  const player = players[playerIndex];
  player.recovery_token_hash = "";
  player.recovery_token_used_at = nowIso_();
  updateObjectRow_("Players", playerIndex + 2, player);
  const managedPlayers = getManagedPlayersFor_(player.player_id);

  return {
    recovered: true,
    player,
    managedPlayers,
  };
}

function testGetPlayersSummary() {
  const result = getPlayersSummary();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetLeaderboard() {
  const result = getLeaderboard();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getPickSummarySafely_(phaseName) {
  try {
    return {
      ...getPhasePickSummary({ phase: phaseName }),
      error: "",
    };
  } catch (error) {
    return {
      phaseName,
      summaries: {},
      error: error.message,
    };
  }
}

function getPlayerSnapshot(input) {
  const playerId = input && input.playerId ? String(input.playerId).trim() : "";
  const managedPlayers = playerId ? getManagedPlayersFor_(playerId) : [];
  const gameState = getGameState();
  const matches = getMatches({
    phase: gameState.activePhaseName,
  });
  const pickSummary = getPickSummarySafely_(gameState.activePhaseName);
  const leaderboard = getLeaderboard();
  const phases = getPhases();
  const playerPicks = playerId
    ? getPlayerPicks({
        playerId,
        phase: gameState.activePhaseName,
      })
    : { playerId: "", phaseName: gameState.activePhaseName, count: 0, picks: [] };
  const pickHistory = playerId
    ? getPlayerPickHistory({
        playerId,
        phase: "",
      })
    : { playerId: "", phaseName: "", count: 0, picks: [] };
  let profile = { player: null };

  if (playerId) {
    try {
      profile = getPlayerProfile({ playerId });
    } catch (error) {
      profile = {
        player: null,
        error: error.message,
      };
    }
  }

  return {
    gameState,
    matches,
    pickSummary,
    phases,
    leaderboard,
    playerPicks,
    pickHistory,
    profile,
    managedPlayers,
  };
}

function getAdminSnapshot() {
  const gameState = getGameState();
  const matches = getMatches({
    phase: gameState.activePhaseName,
  });
  const pickSummary = getPickSummarySafely_(gameState.activePhaseName);
  const settlementLog = getSettlementLog({
    limit: 20,
  });
  const phases = getPhases();
  const players = getPlayersSummary();

  return {
    gameState,
    matches,
    pickSummary,
    phases,
    players,
    settlementLog,
    oddsUpdateStatus: getOddsUpdateStatus(),
    scoreCheckStatus: getScoreCheckStatus(),
    dashboard: {
      playerCount: gameState.playerCount,
      activeMatchCount: gameState.activeMatchCount,
      activePhaseName: gameState.activePhaseName,
      gameStatus: gameState.gameStatus,
    },
  };
}

function getCsvExport() {
  const timestamp = nowIso_();
  const sheets = ["Settings", "Phases", "Teams", "Matches", "Players", "Picks", "SettlementLog"];
  const files = sheets.map((sheetName) => ({
    sheetName,
    fileName: `world-cup-cash-${sheetName.toLowerCase()}-${timestamp.slice(0, 10)}.csv`,
    csv: sheetToCsv_(sheetName),
  }));

  return {
    exportedAt: timestamp,
    count: files.length,
    files,
  };
}

function getHealthCheck() {
  const requiredSheets = ["Settings", "Phases", "Teams", "Matches", "Players", "Picks", "SettlementLog"];
  const sheetStatus = requiredSheets.map((sheetName) => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

    return {
      sheetName,
      found: Boolean(sheet),
      rows: sheet ? sheet.getLastRow() : 0,
      columns: sheet ? sheet.getLastColumn() : 0,
    };
  });
  const gameState = getGameState();
  const matches = getSheetRows_("Matches");
  const picks = getSheetRows_("Picks");
  const activePhaseMatches = matches.filter((match) => match.phase === gameState.activePhaseName);
  const finalUnsettledCount = activePhaseMatches.filter((match) => match.status === "final").length;
  const settledCount = activePhaseMatches.filter((match) => match.status === "settled").length;
  const missingScoreCount = activePhaseMatches.filter((match) => {
    return match.team_a_goals === "" || match.team_b_goals === "";
  }).length;
  const activePickCount = picks.filter((pick) => pick.status === "active").length;

  return {
    checkedAt: nowIso_(),
    ok: sheetStatus.every((sheet) => sheet.found),
    gameState,
    sheetStatus,
    activePhase: {
      matchCount: activePhaseMatches.length,
      missingScoreCount,
      finalUnsettledCount,
      settledCount,
      activePickCount,
    },
  };
}

function testGetHealthCheck() {
  const result = getHealthCheck();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetCsvExport() {
  const result = getCsvExport();
  console.log(JSON.stringify({
    exportedAt: result.exportedAt,
    count: result.count,
    firstFile: result.files[0].fileName,
  }, null, 2));
  return result;
}

function testGetPlayerSnapshot() {
  const players = getSheetRows_("Players");
  const result = getPlayerSnapshot({
    playerId: players[0] ? players[0].player_id : "",
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetAdminSnapshot() {
  const result = getAdminSnapshot();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getMatchOutcome_(match) {
  const teamAGoals = Number(match.team_a_goals);
  const teamBGoals = Number(match.team_b_goals);

  if (!Number.isFinite(teamAGoals) || !Number.isFinite(teamBGoals)) {
    throw new Error("Match must have both team scores before settlement.");
  }

  if (!isGroupPhase_(match.phase) && match.team_advanced) {
    if (![match.team_a, match.team_b].includes(match.team_advanced)) {
      throw new Error("Selected advancing team is not in this match.");
    }

    return {
      type: "win_loss",
      winningTeam: match.team_advanced,
    };
  }

  if (teamAGoals === teamBGoals) {
    if (!isGroupPhase_(match.phase)) {
      throw new Error("Tied knockout matches require an advancing team before settlement.");
    }

    return {
      type: "draw",
      winningTeam: "",
    };
  }

  return {
    type: "win_loss",
    winningTeam: teamAGoals > teamBGoals ? match.team_a : match.team_b,
  };
}

function settlePick_(pick, match, player, outcome, timestamp) {
  const startingBalance = toNumber_(player.current_balance, getStartingBalance_());
  const playerCashStake = toNumber_(pick.player_cash_stake, 0);
  const totalPayout = outcome.type === "draw"
    ? 0
    : toNumber_(pick.potential_payout, 0);
  let settlementType = "draw";
  let endingBalance = startingBalance;

  if (outcome.type === "draw") {
    player.draws = toNumber_(player.draws, 0) + 1;
  } else if (pick.selected_team === outcome.winningTeam) {
    settlementType = "win";
    endingBalance = startingBalance - playerCashStake + totalPayout;
    player.current_balance = endingBalance;
    player.total_winnings = toNumber_(player.total_winnings, 0) + totalPayout;
    player.wins = toNumber_(player.wins, 0) + 1;
  } else {
    settlementType = "loss";
    endingBalance = startingBalance - playerCashStake;
    player.current_balance = endingBalance;
    player.total_losses = toNumber_(player.total_losses, 0) + playerCashStake;
    player.losses = toNumber_(player.losses, 0) + 1;
  }

  pick.status = settlementType === "win" ? "won" : settlementType === "loss" ? "lost" : "draw";
  pick.settled_at = timestamp;
  pick.updated_at = timestamp;

  return {
    settlement_id: createId_("settlement"),
    player_id: player.player_id,
    match_id: match.match_id,
    pick_id: pick.pick_id,
    settlement_type: settlementType,
    starting_balance: startingBalance,
    player_cash_stake: playerCashStake,
    total_payout: totalPayout,
    ending_balance: endingBalance,
    created_at: timestamp,
  };
}

function settleMatch(input) {
  if (!input || !input.matchId) {
    throw new Error("settleMatch requires matchId.");
  }

  const matchId = String(input.matchId).trim();
  const matches = getSheetRows_("Matches");
  const matchIndex = matches.findIndex((match) => match.match_id === matchId);

  if (matchIndex < 0) {
    throw new Error("Match not found.");
  }

  const match = matches[matchIndex];

  if (match.status === "settled") {
    throw new Error("Match is already settled.");
  }

  const outcome = getMatchOutcome_(match);
  const timestamp = nowIso_();
  const players = getSheetRows_("Players");
  const picks = getSheetRows_("Picks");
  const activeMatchPicks = picks
    .map((pick, index) => ({ pick, index }))
    .filter((item) => item.pick.match_id === matchId && item.pick.status === "active");
  const logs = [];

  activeMatchPicks.forEach((item) => {
    const playerIndex = players.findIndex((player) => player.player_id === item.pick.player_id);

    if (playerIndex < 0) {
      return;
    }

    const log = settlePick_(item.pick, match, players[playerIndex], outcome, timestamp);
    updateObjectRow_("Picks", item.index + 2, item.pick);
    updateObjectRow_("Players", playerIndex + 2, players[playerIndex]);
    appendObjectRow_("SettlementLog", log);
    logs.push(log);
  });

  match.status = "settled";
  updateObjectRow_("Matches", matchIndex + 2, match);
  updateAllPlayerDerivedBalances_();

  return {
    settled: true,
    matchId,
    outcome,
    settledPickCount: logs.length,
    logs,
  };
}

function settleFinalMatches(input) {
  const activePhaseName = getSetting_("active_phase");
  const phaseName = input && input.phase ? String(input.phase).trim() : activePhaseName;
  const matches = getSheetRows_("Matches");
  const finalMatches = matches.filter((match) => {
    return match.phase === phaseName && match.status === "final";
  });
  const settled = [];
  const errors = [];

  finalMatches.forEach((match) => {
    try {
      settled.push(settleMatch({
        matchId: match.match_id,
      }));
    } catch (error) {
      errors.push({
        matchId: match.match_id,
        error: error.message,
      });
    }
  });

  return {
    phaseName,
    attemptedCount: finalMatches.length,
    settledCount: settled.length,
    errorCount: errors.length,
    settled,
    errors,
  };
}

function getRandomScoreForMatch_(match) {
  let teamAGoals = randomInt_(0, 4);
  let teamBGoals = randomInt_(0, 4);

  if (String(match.phase || "").toLowerCase().indexOf("group") < 0 && teamAGoals === teamBGoals) {
    teamAGoals += 1;
  }

  return {
    teamAGoals,
    teamBGoals,
  };
}

function simulateMatchResult(input) {
  if (!input || !input.matchId) {
    throw new Error("simulateMatchResult requires matchId.");
  }

  const matchId = String(input.matchId).trim();
  const matches = getSheetRows_("Matches");
  const match = matches.find((item) => item.match_id === matchId);

  if (!match) {
    throw new Error("Match not found.");
  }

  if (match.status === "settled") {
    throw new Error("Match is already settled.");
  }

  const score = getRandomScoreForMatch_(match);
  const teamAdvanced = score.teamAGoals > score.teamBGoals
    ? match.team_a
    : score.teamBGoals > score.teamAGoals
      ? match.team_b
      : "";

  return saveMatchResult({
    matchId,
    teamAGoals: score.teamAGoals,
    teamBGoals: score.teamBGoals,
    teamAdvanced,
    settle: String(input.settle || "") === "true" ? "true" : "false",
  });
}

function simulatePhaseResults(input) {
  const activePhaseName = getSetting_("active_phase");
  const phaseName = input && input.phase ? String(input.phase).trim() : activePhaseName;
  const settle = String(input && input.settle || "") === "true";
  const matches = getSheetRows_("Matches").filter((match) => {
    return match.phase === phaseName && match.status !== "settled";
  });
  const simulated = [];
  const errors = [];

  matches.forEach((match) => {
    try {
      simulated.push(simulateMatchResult({
        matchId: match.match_id,
        settle: settle ? "true" : "false",
      }));
    } catch (error) {
      errors.push({
        matchId: match.match_id,
        error: error.message,
      });
    }
  });

  return {
    phaseName,
    settle,
    attemptedCount: matches.length,
    simulatedCount: simulated.length,
    errorCount: errors.length,
    simulated,
    errors,
  };
}

function testSimulatePhaseResults() {
  const result = simulatePhaseResults({
    settle: "false",
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testSettleFinalMatches() {
  const result = settleFinalMatches({});
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function saveMatchResult(input) {
  if (!input || !input.matchId) {
    throw new Error("saveMatchResult requires matchId.");
  }

  const matchId = String(input.matchId).trim();
  const rawTeamAGoals = String(input.teamAGoals ?? "").trim();
  const rawTeamBGoals = String(input.teamBGoals ?? "").trim();

  if (!rawTeamAGoals || !rawTeamBGoals) {
    throw new Error("Both scores are required.");
  }

  const teamAGoals = toWholeDollar_(input.teamAGoals, null);
  const teamBGoals = toWholeDollar_(input.teamBGoals, null);

  if (teamAGoals === null || teamBGoals === null) {
    throw new Error("Both scores are required.");
  }

  if (teamAGoals < 0 || teamBGoals < 0) {
    throw new Error("Scores cannot be negative.");
  }

  const matches = getSheetRows_("Matches");
  const matchIndex = matches.findIndex((match) => match.match_id === matchId);

  if (matchIndex < 0) {
    throw new Error("Match not found.");
  }

  const match = matches[matchIndex];

  if (match.status === "settled") {
    throw new Error("Match is already settled.");
  }

  const teamAdvanced = input.teamAdvanced ? String(input.teamAdvanced).trim() : "";

  if (teamAdvanced && ![match.team_a, match.team_b].includes(teamAdvanced)) {
    throw new Error("Selected advancing team is not in this match.");
  }

  match.team_a_goals = teamAGoals;
  match.team_b_goals = teamBGoals;
  match.team_advanced = teamAdvanced;
  match.status = "final";
  updateObjectRow_("Matches", matchIndex + 2, match);

  if (String(input.settle || "") === "true") {
    return settleMatch({
      matchId,
    });
  }

  return {
    saved: true,
    match: normalizeMatch_(match, indexBy_(getSheetRows_("Teams"), "team_slug")),
  };
}

function testSettleMatch() {
  const result = saveMatchResult({
    matchId: "WC26-001",
    teamAGoals: 1,
    teamBGoals: 0,
    settle: "true",
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function resetGame(input) {
  const confirmation = input && input.confirmText ? String(input.confirmText).trim() : "";

  if (confirmation !== "RESET GAME") {
    throw new Error("Reset requires confirmation text: RESET GAME");
  }

  const timestamp = nowIso_();
  const phases = getSheetRows_("Phases")
    .map((phase, index) => ({ phase, index }))
    .sort((a, b) => toNumber_(a.phase.phase_order, 0) - toNumber_(b.phase.phase_order, 0));

  if (!phases.length) {
    throw new Error("Cannot reset without phases.");
  }

  const firstPhase = phases[0].phase;

  clearSheetData_("Players");
  clearSheetData_("Picks");
  clearSheetData_("SettlementLog");
  PropertiesService.getScriptProperties().deleteProperty(SCORE_STATUS_PROPERTY_);
  PropertiesService.getScriptProperties().deleteProperty(SCORE_STATE_PROPERTY_);

  phases.forEach((item) => {
    item.phase.status = item.phase.phase_name === firstPhase.phase_name ? "open" : "future";
    item.phase.opened_at = item.phase.phase_name === firstPhase.phase_name ? timestamp : "";
    item.phase.locked_at = "";
    item.phase.settled_at = "";
    updateObjectRow_("Phases", item.index + 2, item.phase);
  });

  const matches = getSheetRows_("Matches");

  matches.forEach((match, index) => {
    match.team_a_goals = "";
    match.team_b_goals = "";
    match.team_advanced = "";
    match.status = match.phase === firstPhase.phase_name ? "open" : "future";
    updateObjectRow_("Matches", index + 2, match);
  });

  setSetting_("active_phase", firstPhase.phase_name);
  setSetting_("game_status", "open");
  resetRequestCache_();

  return {
    reset: true,
    activePhaseName: firstPhase.phase_name,
    gameStatus: "open",
    cleared: {
      players: true,
      picks: true,
      settlementLog: true,
    },
    resetAt: timestamp,
  };
}

function openPhase() {
  const timestamp = nowIso_();
  const phase = updateActivePhase_({
    status: "open",
    opened_at: timestamp,
    locked_at: "",
  });

  setSetting_("game_status", "open");

  return {
    opened: true,
    gameStatus: "open",
    activePhase: phase,
  };
}

function setActivePhase(input) {
  if (!input || !input.phaseName) {
    throw new Error("setActivePhase requires phaseName.");
  }

  const phaseName = String(input.phaseName).trim();
  const phases = getSheetRows_("Phases");
  const phase = phases.find((item) => item.phase_name === phaseName);

  if (!phase) {
    throw new Error(`Phase not found: ${phaseName}`);
  }

  setSetting_("active_phase", phaseName);
  setSetting_("game_status", phase.status || "future");

  return {
    updated: true,
    gameStatus: phase.status || "future",
    activePhase: normalizePhase_(phase, phaseName),
  };
}

function openNextPhase() {
  const activePhaseName = getSetting_("active_phase");
  const phases = getSheetRows_("Phases")
    .map((phase, index) => ({ phase, index }))
    .sort((a, b) => toNumber_(a.phase.phase_order, 0) - toNumber_(b.phase.phase_order, 0));
  const activeIndex = phases.findIndex((item) => item.phase.phase_name === activePhaseName);

  if (activeIndex < 0) {
    throw new Error(`Active phase not found: ${activePhaseName}`);
  }

  const nextItem = phases[activeIndex + 1];

  if (!nextItem) {
    throw new Error("There is no next phase.");
  }

  const timestamp = nowIso_();
  nextItem.phase.status = "open";
  nextItem.phase.opened_at = timestamp;
  nextItem.phase.locked_at = "";
  updateObjectRow_("Phases", nextItem.index + 2, nextItem.phase);
  setSetting_("active_phase", nextItem.phase.phase_name);
  setSetting_("game_status", "open");
  updateAllPlayerDerivedBalances_();

  return {
    opened: true,
    gameStatus: "open",
    activePhase: normalizePhase_(nextItem.phase, nextItem.phase.phase_name),
  };
}

function lockPhase() {
  const timestamp = nowIso_();
  const phase = updateActivePhase_({
    status: "locked",
    locked_at: timestamp,
  });

  setSetting_("game_status", "locked");

  return {
    locked: true,
    gameStatus: "locked",
    activePhase: phase,
  };
}

function testOpenPhase() {
  const result = openPhase();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testLockPhase() {
  const result = lockPhase();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function doGet(e) {
  resetRequestCache_();

  try {
    const action = e.parameter.action;

    if (action === "getGameState") {
      return jsonResponse_(getGameState());
    }

    if (action === "getPlayerSnapshot") {
      return jsonResponse_(getPlayerSnapshot({
        playerId: e.parameter.playerId,
      }));
    }

    if (action === "getAdminSnapshot") {
      return jsonResponse_(getAdminSnapshot());
    }

    if (action === "getOddsUpdateStatus") {
      return jsonResponse_(getOddsUpdateStatus());
    }

    if (action === "updateBettingOdds") {
      return jsonResponse_(updateBettingOdds());
    }

    if (action === "getScoreCheckStatus") {
      return jsonResponse_(getScoreCheckStatus());
    }

    if (action === "checkMatchScores") {
      return jsonResponse_(checkMatchScores({
        force: e.parameter.force,
      }));
    }

    if (action === "getCsvExport") {
      return jsonResponse_(getCsvExport());
    }

    if (action === "getHealthCheck") {
      return jsonResponse_(getHealthCheck());
    }

    if (action === "getMatches") {
      return jsonResponse_(getMatches({
        phase: e.parameter.phase,
      }));
    }

    if (action === "getPhases") {
      return jsonResponse_(getPhases());
    }

    if (action === "joinGame") {
      return jsonResponse_(joinGame({
        deviceId: e.parameter.deviceId,
        displayName: e.parameter.displayName,
      }));
    }

    if (action === "updatePlayerProfile") {
      return jsonResponse_(updatePlayerProfile({
        playerId: e.parameter.playerId,
        deviceId: e.parameter.deviceId,
        displayName: e.parameter.displayName,
      }));
    }

    if (action === "savePick") {
      return jsonResponse_(savePick({
        playerId: e.parameter.playerId,
        matchId: e.parameter.matchId,
        selectedTeam: e.parameter.selectedTeam,
        totalBetAmount: e.parameter.totalBetAmount,
      }));
    }

    if (action === "cancelPick") {
      return jsonResponse_(cancelPick({
        playerId: e.parameter.playerId,
        matchId: e.parameter.matchId,
      }));
    }

    if (action === "generateRecoveryToken") {
      return jsonResponse_(generateRecoveryToken({
        playerId: e.parameter.playerId,
      }));
    }

    if (action === "redeemRecoveryToken") {
      return jsonResponse_(redeemRecoveryToken({
        token: e.parameter.token,
      }));
    }

    if (action === "getPlayerPicks") {
      return jsonResponse_(getPlayerPicks({
        playerId: e.parameter.playerId,
        phase: e.parameter.phase,
      }));
    }

    if (action === "getPlayerPickHistory") {
      return jsonResponse_(getPlayerPickHistory({
        playerId: e.parameter.playerId,
        phase: e.parameter.phase,
      }));
    }

    if (action === "getPlayerProfile") {
      return jsonResponse_(getPlayerProfile({
        playerId: e.parameter.playerId,
      }));
    }

    if (action === "getLeaderboard") {
      return jsonResponse_(getLeaderboard());
    }

    if (action === "getPlayersSummary") {
      return jsonResponse_(getPlayersSummary());
    }

    if (action === "getSettlementLog") {
      return jsonResponse_(getSettlementLog({
        matchId: e.parameter.matchId,
        playerId: e.parameter.playerId,
        limit: e.parameter.limit,
      }));
    }

    if (action === "getPhasePickSummary") {
      return jsonResponse_(getPhasePickSummary({
        phase: e.parameter.phase,
      }));
    }

    if (action === "saveMatchResult") {
      return jsonResponse_(saveMatchResult({
        matchId: e.parameter.matchId,
        teamAGoals: e.parameter.teamAGoals,
        teamBGoals: e.parameter.teamBGoals,
        teamAdvanced: e.parameter.teamAdvanced,
        settle: e.parameter.settle,
      }));
    }

    if (action === "simulateMatchResult") {
      return jsonResponse_(simulateMatchResult({
        matchId: e.parameter.matchId,
        settle: e.parameter.settle,
      }));
    }

    if (action === "simulatePhaseResults") {
      return jsonResponse_(simulatePhaseResults({
        phase: e.parameter.phase,
        settle: e.parameter.settle,
      }));
    }

    if (action === "settleMatch") {
      return jsonResponse_(settleMatch({
        matchId: e.parameter.matchId,
      }));
    }

    if (action === "settleFinalMatches") {
      return jsonResponse_(settleFinalMatches({
        phase: e.parameter.phase,
      }));
    }

    if (action === "openPhase") {
      return jsonResponse_(openPhase());
    }

    if (action === "openNextPhase") {
      return jsonResponse_(openNextPhase());
    }

    if (action === "setActivePhase") {
      return jsonResponse_(setActivePhase({
        phaseName: e.parameter.phaseName,
      }));
    }

    if (action === "lockPhase") {
      return jsonResponse_(lockPhase());
    }

    if (action === "resetGame") {
      return jsonResponse_(resetGame({
        confirmText: e.parameter.confirmText,
      }));
    }

    return jsonResponse_({
      error: `Unknown action: ${action}`,
      action,
    });
  } catch (error) {
    return jsonResponse_({
      error: error.message,
    });
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
