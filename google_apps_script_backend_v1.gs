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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Missing sheet: ${sheetName}`);
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map((header) => String(header).trim());

  return values.slice(1).map((row) => {
    const item = {};

    headers.forEach((header, index) => {
      item[header] = row[index];
    });

    return item;
  });
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
  const settings = getSheetRows_("Settings");
  const row = settings.find((item) => item.key === key);
  return row ? row.value : null;
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
  const sheet = getSheet_(sheetName);
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((header) => String(header).trim());
}

function appendObjectRow_(sheetName, item) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const row = headers.map((header) => item[header] ?? "");
  sheet.appendRow(row);
}

function updateObjectRow_(sheetName, rowNumber, item) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheetName);
  const row = headers.map((header) => item[header] ?? "");
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function createId_(prefix) {
  return `${prefix}_${Utilities.getUuid()}`;
}

function nowIso_() {
  return new Date().toISOString();
}

function getStartingBalance_() {
  const value = Number(getSetting_("starting_balance"));
  return Number.isFinite(value) ? value : 200;
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

function normalizeMatch_(match, teamsBySlug) {
  const teamA = teamsBySlug[match.team_a];
  const teamB = teamsBySlug[match.team_b];

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
  const totalBetAmount = Math.max(1, Number(input.totalBetAmount) || 1);
  const houseBetAmount = Number(getSetting_("house_bet_amount")) || 1;
  const playerCashStake = Math.max(0, totalBetAmount - houseBetAmount);
  const timestamp = nowIso_();

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

  if (match.status && match.status !== "future") {
    throw new Error("Picks are only allowed for future matches.");
  }

  const decimalOdds = getDecimalOddsForSelection_(match, selectedTeam);
  const potentialPayout = totalBetAmount * decimalOdds;
  const picks = getSheetRows_("Picks");
  const existingPickIndex = picks.findIndex((pick) => {
    return pick.player_id === playerId && pick.match_id === matchId && pick.status === "active";
  });

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

function doGet(e) {
  const action = e.parameter.action;

  if (action === "getGameState") {
    return jsonResponse_(getGameState());
  }

  if (action === "getMatches") {
    return jsonResponse_(getMatches({
      phase: e.parameter.phase,
    }));
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

  return jsonResponse_({
    error: "Unknown action",
    action,
  });
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
