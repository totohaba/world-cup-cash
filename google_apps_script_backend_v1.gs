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

function joinGame(input) {
  if (!input || !input.deviceId || !input.displayName) {
    throw new Error("joinGame requires deviceId and displayName.");
  }

  const deviceId = String(input.deviceId).trim();
  const displayName = String(input.displayName).trim();

  if (!deviceId) {
    throw new Error("deviceId cannot be blank.");
  }

  if (!displayName) {
    throw new Error("displayName cannot be blank.");
  }

  const players = getSheetRows_("Players");
  const existingPlayer = players.find((player) => player.device_id === deviceId);

  if (existingPlayer) {
    return {
      created: false,
      player: existingPlayer,
    };
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

  return {
    recovered: true,
    player,
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

  if (teamAGoals === teamBGoals) {
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

  match.team_a_goals = teamAGoals;
  match.team_b_goals = teamBGoals;
  match.team_advanced = input.teamAdvanced ? String(input.teamAdvanced).trim() : match.team_advanced;
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
