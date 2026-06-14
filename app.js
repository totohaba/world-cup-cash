const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbymIh5xXGZ-0jRHPMCyMllyuYFtOhvU4wVY-rhX_kVuXfIF7iBvDLshy9y8JOaOHq3Akg/exec",
};

const STORAGE_KEYS = {
  deviceId: "worldCupCashDeviceId",
  player: "worldCupCashPlayer",
  managedPlayers: "worldCupCashManagedPlayers",
  snapshot: "worldCupCashPlayerSnapshot",
};

let activeMatches = [];
let activePicksByMatch = {};
let activeLeaderboard = [];
let activeProfile = null;
let activePickHistory = [];
let activeGameState = null;
let activePickSummaryByMatch = {};
let activePhases = [];
let activeDetailMatchId = "";
let activeDetailSelection = "";
let activeDetailBetAmount = 1;
let activeFeaturedMatchId = "";
let activeFeaturedMatchKey = "";

async function callApi(action, params = {}) {
  const url = new URL(CONFIG.appsScriptUrl);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  let result;

  try {
    result = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`API returned non-JSON response for ${action}`);
  }

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

async function loadPlayerPicks(player, phaseName) {
  if (!player) {
    return { picks: [], error: null };
  }

  try {
    const result = await callApi("getPlayerPicks", {
      playerId: player.player_id,
      phase: phaseName,
    });

    return { picks: result.picks, error: null };
  } catch (error) {
    console.error(error);
    return { picks: [], error };
  }
}

async function loadPlayerPickHistory(player, phaseName) {
  if (!player) {
    return { picks: [], error: null };
  }

  try {
    const result = await callApi("getPlayerPickHistory", {
      playerId: player.player_id,
      phase: phaseName,
    });

    return { picks: result.picks, error: null };
  } catch (error) {
    console.error(error);
    return { picks: [], error };
  }
}

async function loadPhasePickSummary(phaseName) {
  try {
    const result = await callApi("getPhasePickSummary", {
      phase: phaseName,
    });

    return { summaries: result.summaries || {}, error: null };
  } catch (error) {
    console.error(error);
    return { summaries: {}, error };
  }
}

function getOrCreateDeviceId() {
  const existingId = localStorage.getItem(STORAGE_KEYS.deviceId);

  if (existingId) {
    return existingId;
  }

  const newId = `device_${crypto.randomUUID()}`;
  localStorage.setItem(STORAGE_KEYS.deviceId, newId);
  return newId;
}

function getSavedPlayer() {
  const saved = localStorage.getItem(STORAGE_KEYS.player);
  return saved ? JSON.parse(saved) : null;
}

function savePlayer(player) {
  localStorage.setItem(STORAGE_KEYS.player, JSON.stringify(player));
}

function getManagedPlayers() {
  const saved = localStorage.getItem(STORAGE_KEYS.managedPlayers);

  if (!saved) {
    return [];
  }

  try {
    const players = JSON.parse(saved);
    return Array.isArray(players) ? players : [];
  } catch (error) {
    localStorage.removeItem(STORAGE_KEYS.managedPlayers);
    return [];
  }
}

function saveManagedPlayers(players) {
  if (players?.length > 1) {
    localStorage.setItem(STORAGE_KEYS.managedPlayers, JSON.stringify(players));
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.managedPlayers);
}

function updateManagedPlayer(updatedPlayer) {
  const players = getManagedPlayers();

  if (!players.length) {
    return;
  }

  saveManagedPlayers(players.map((player) => {
    return player.player_id === updatedPlayer.player_id ? updatedPlayer : player;
  }));
}

function clearSavedPlayer() {
  localStorage.removeItem(STORAGE_KEYS.player);
  localStorage.removeItem(STORAGE_KEYS.managedPlayers);
  localStorage.removeItem(STORAGE_KEYS.snapshot);
}

function clearCachedSnapshot() {
  localStorage.removeItem(STORAGE_KEYS.snapshot);
}

function getCachedSnapshot() {
  const saved = localStorage.getItem(STORAGE_KEYS.snapshot);

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEYS.snapshot);
    return null;
  }
}

function saveCachedSnapshot(result) {
  localStorage.setItem(STORAGE_KEYS.snapshot, JSON.stringify({
    savedAt: new Date().toISOString(),
    result,
  }));
}

function formatMoney(value, options = {}) {
  const numberValue = Number(value) || 0;
  const maximumFractionDigits = options.cents ? 2 : 0;

  return numberValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.cents ? 2 : 0,
    maximumFractionDigits,
  });
}

function renderPlayer(player) {
  const joinPanel = document.querySelector("#join-panel");
  const playerPanel = document.querySelector("#player-panel");
  const playerName = document.querySelector("#player-name");
  const balance = document.querySelector("#current-balance");
  const availableBalance = document.querySelector("#available-balance");

  if (!player) {
    joinPanel.hidden = false;
    playerPanel.hidden = true;
    balance.textContent = "$200";
    availableBalance.textContent = "$200";
    return;
  }

  joinPanel.hidden = true;
  playerPanel.hidden = false;
  playerName.textContent = player.display_name;
  balance.textContent = `$${Number(player.current_balance).toFixed(0)}`;
  availableBalance.textContent = activeProfile
    ? formatMoney(activeProfile.availableToBet)
    : `$${Number(player.current_balance).toFixed(0)}`;
}

function renderPlayerBalances() {
  const balance = document.querySelector("#current-balance");
  const availableBalance = document.querySelector("#available-balance");
  const savedPlayer = getSavedPlayer();

  if (!balance || !availableBalance) {
    return;
  }

  if (activeProfile) {
    balance.textContent = formatMoney(activeProfile.currentBalance);
    availableBalance.textContent = formatMoney(activeProfile.availableToBet);
    return;
  }

  if (savedPlayer) {
    balance.textContent = `$${Number(savedPlayer.current_balance).toFixed(0)}`;
    availableBalance.textContent = `$${Number(savedPlayer.current_balance).toFixed(0)}`;
  }
}

function indexPicksByMatch(picks) {
  return picks.reduce((index, pick) => {
    if (pick.status !== "cancelled") {
      index[pick.matchId] = pick;
    }
    return index;
  }, {});
}

function getPickStatusText(pick) {
  if (!pick) {
    return "";
  }

  return `Saved: ${pick.selectedTeamName || pick.selectedTeam} for ${formatMoney(pick.totalBetAmount)} total bet`;
}

function getPickNetWinnings(pick) {
  const payout = Number(pick?.potentialPayout) || 0;
  const playerCashStake = Number(pick?.playerCashStake) || 0;

  return Math.max(0, payout - playerCashStake);
}

function getPickOutcomeText(pick, options = {}) {
  if (!pick) {
    return "";
  }

  if (pick.status === "won") {
    const wonAmount = options.netWinnings
      ? getPickNetWinnings(pick)
      : pick.potentialPayout;
    return `Won ${formatMoney(wonAmount, { cents: true })}`;
  }

  if (pick.status === "lost") {
    return `Lost ${formatMoney(pick.playerCashStake)}`;
  }

  if (pick.status === "draw") {
    return "Draw - no money won or lost";
  }

  if (pick.status === "cancelled") {
    return "Removed";
  }

  return getPickStatusText(pick);
}

function getMatchWinnerSlug(match) {
  if (!isMatchClosed(match)) {
    return "";
  }

  if (match.teamAdvanced) {
    return String(match.teamAdvanced).trim();
  }

  const teamAGoals = Number(match.teamAGoals);
  const teamBGoals = Number(match.teamBGoals);

  if (!Number.isFinite(teamAGoals) || !Number.isFinite(teamBGoals) || teamAGoals === teamBGoals) {
    return "";
  }

  return teamAGoals > teamBGoals ? match.teamASlug : match.teamBSlug;
}

function getMatchMarker(match, side, savedPick) {
  const slug = getTeamSlug(match, side);
  const winnerSlug = getMatchWinnerSlug(match);

  if (winnerSlug) {
    return winnerSlug === slug ? "star" : "";
  }

  if (!isMatchClosed(match) && savedPick?.selectedTeam === slug) {
    return "check";
  }

  return "";
}

function getActionButtonClass(actionText) {
  if (actionText === "Update Bet") {
    return "bet-button-update";
  }

  if (actionText === "Make Bet") {
    return "bet-button-make";
  }

  return "bet-button-final";
}

function renderTeamMarker(marker, className) {
  if (marker === "star") {
    return `<img class="${className}" src="assets/yellow-star.png" alt="Winner" loading="lazy" />`;
  }

  if (marker === "check") {
    return `<img class="${className}" src="assets/checkmark.png" alt="Picked" loading="lazy" />`;
  }

  return "";
}

function getAvailableToBet() {
  return activeProfile ? Number(activeProfile.availableToBet) || 0 : 0;
}

function getMaxTotalBet(savedPick) {
  const savedStake = savedPick ? Number(savedPick.playerCashStake) || 0 : 0;
  return Math.max(1, 1 + Math.floor(getAvailableToBet() + savedStake));
}

function getMatchOdds(match, selectedTeam) {
  if (selectedTeam === match.teamASlug) {
    return Number(match.teamADecimalOdds) || 0;
  }

  if (selectedTeam === match.teamBSlug) {
    return Number(match.teamBDecimalOdds) || 0;
  }

  return 0;
}

function getPayoutText(match, selectedTeam, totalBetAmount) {
  const odds = getMatchOdds(match, selectedTeam);

  if (!odds) {
    return "Choose a team to preview payout";
  }

  return `Potential Payout ${formatMoney(totalBetAmount * odds, { cents: true })}`;
}

function getAssetPath(path) {
  if (!path) {
    return "";
  }

  return path;
}

function getTeam(match, side) {
  return side === "A" ? match.teamA : match.teamB;
}

function getTeamSlug(match, side) {
  return side === "A" ? match.teamASlug : match.teamBSlug;
}

function getTeamOdds(match, side) {
  return side === "A" ? match.teamADecimalOdds : match.teamBDecimalOdds;
}

function getTeamFlag(match, side) {
  return getAssetPath(getTeam(match, side)?.flagImage);
}

function getTeamEmblem(match, side) {
  return getAssetPath(getTeam(match, side)?.emblemImage);
}

function getTeamPlayerImage(match, side) {
  const source = getTeam(match, side)?.starPlayerImage;

  if (!source) {
    return "";
  }

  return `${source}?v=players-direct-1`;
}

function hasFinalScore(match) {
  return match?.teamAGoals !== "" && match?.teamAGoals != null && match?.teamBGoals !== "" && match?.teamBGoals != null;
}

function isMatchClosed(match) {
  const status = String(match?.status || "").toLowerCase();
  return ["settled", "final", "complete"].includes(status) || hasFinalScore(match);
}

function isMatchBettingLocked(match) {
  return Boolean(match?.bettingLocked);
}

function formatFifaRank(value) {
  return value ? `#${value}` : "--";
}

function getKnockoutLabel(phaseName) {
  const phase = String(phaseName || "").trim();

  if (/round of 32/i.test(phase)) {
    return "Round 32";
  }

  if (/round of 16/i.test(phase)) {
    return "Round 16";
  }

  if (/quarter/i.test(phase)) {
    return "Quarterfinal";
  }

  if (/semi/i.test(phase)) {
    return "Semifinal";
  }

  if (/third/i.test(phase)) {
    return "Third Place";
  }

  if (/final/i.test(phase)) {
    return "Final";
  }

  return phase;
}

function getMatchStageLabel(match) {
  const phase = String(match?.phase || "");

  if (/group/i.test(phase)) {
    const group = match?.teamA?.group || match?.teamB?.group || "";
    return group ? `Group ${group}` : phase;
  }

  return getKnockoutLabel(phase);
}

function getTeamCode(team, slug) {
  const codes = {
    algeria: "ALG",
    argentina: "ARG",
    australia: "AUS",
    austria: "AUT",
    belgium: "BEL",
    "bosnia-herzegovina": "BIH",
    brazil: "BRA",
    canada: "CAN",
    "cape-verde": "CPV",
    colombia: "COL",
    "cote-divoire": "CIV",
    croatia: "CRO",
    curacao: "CUW",
    czechia: "CZE",
    "dr-congo": "COD",
    ecuador: "ECU",
    egypt: "EGY",
    england: "ENG",
    france: "FRA",
    germany: "GER",
    ghana: "GHA",
    haiti: "HAI",
    iran: "IRN",
    iraq: "IRQ",
    japan: "JPN",
    jordan: "JOR",
    mexico: "MEX",
    morocco: "MAR",
    netherlands: "NED",
    "new-zealand": "NZL",
    norway: "NOR",
    panama: "PAN",
    paraguay: "PAR",
    portugal: "POR",
    qatar: "QAT",
    "saudi-arabia": "KSA",
    scotland: "SCO",
    senegal: "SEN",
    "south-africa": "RSA",
    "south-korea": "KOR",
    spain: "ESP",
    sweden: "SWE",
    switzerland: "SUI",
    tunisia: "TUN",
    turkiye: "TUR",
    "united-states": "USA",
    uruguay: "URU",
    uzbekistan: "UZB",
  };

  return codes[slug] || String(team?.team || slug || "").slice(0, 3).toUpperCase();
}

function formatMatchDateTime(value) {
  return String(value || "").replace("2026-", "").replace(":00 ", " ");
}

function getPhaseShortName(phaseName) {
  const phase = String(phaseName || "");

  if (phase.includes("Matchday 1")) {
    return "MD1";
  }

  if (phase.includes("Matchday 2")) {
    return "MD2";
  }

  if (phase.includes("Matchday 3")) {
    return "MD3";
  }

  if (phase.includes("Round of 32")) {
    return "R32";
  }

  if (phase.includes("Round of 16")) {
    return "R16";
  }

  if (phase.includes("Quarter")) {
    return "QF";
  }

  if (phase.includes("Semi")) {
    return "SF";
  }

  if (phase.includes("Third")) {
    return "3rd";
  }

  if (phase.includes("Final")) {
    return "Final";
  }

  return phase.replace("Group Stage - ", "").replace("Group ", "");
}

function getActivePhaseLockText() {
  return "Betting locks 1 hour before each match";
}

function getImpliedProbability(odds) {
  const numberValue = Number(odds);

  if (!numberValue) {
    return 0;
  }

  return 100 / numberValue;
}

function getProbabilityText(match) {
  const teamAProbability = getImpliedProbability(match.teamADecimalOdds);
  const teamBProbability = getImpliedProbability(match.teamBDecimalOdds);
  const drawProbability = getImpliedProbability(match.drawDecimalOdds);
  const drawText = drawProbability ? ` - Draw ${drawProbability.toFixed(0)}%` : "";

  return `${match.teamA.team} ${teamAProbability.toFixed(0)}% - ${match.teamB.team} ${teamBProbability.toFixed(0)}%${drawText}`;
}

function getSelectionCount(summary, teamSlug) {
  return summary?.selections?.[teamSlug] || 0;
}

function getPickActivityText(match, summary) {
  if (!summary || !summary.totalPickCount) {
    return "No picks yet";
  }

  return `${summary.totalPickCount} picks - ${match.teamA.team}: ${getSelectionCount(summary, match.teamASlug)} - ${match.teamB.team}: ${getSelectionCount(summary, match.teamBSlug)}`;
}

function getPickMoneyText(summary) {
  if (!summary || !summary.totalPickCount) {
    return "";
  }

  return `Total bet ${formatMoney(summary.totalBetAmount)} - pending cash ${formatMoney(summary.totalPlayerCashStake)} - potential ${formatMoney(summary.potentialPayout, { cents: true })}`;
}

function getTeamNameForSlug(match, slug) {
  if (!match) {
    return slug;
  }

  if (slug === match.teamASlug) {
    return match.teamA.team;
  }

  if (slug === match.teamBSlug) {
    return match.teamB.team;
  }

  return slug;
}

function enrichPickWithMatch(pick, match) {
  if (!pick || !match) {
    return pick;
  }

  return {
    ...pick,
    selectedTeamName: getTeamNameForSlug(match, pick.selectedTeam),
  };
}

function getMatchPickStatus(match, savedPick, readOnly) {
  if (isMatchClosed(match)) {
    return savedPick ? getPickOutcomeText(savedPick) : "Final";
  }

  if (readOnly) {
    return savedPick ? "Locked" : "Locked - not picked";
  }

  return savedPick ? "Picked" : "Not Picked";
}

function renderPlayerSnapshotStats() {
  const stats = document.querySelector("#player-snapshot-stats");

  if (!stats) {
    return;
  }

  const totalMatches = activeMatches.length;
  const pickedCount = activeMatches.filter((match) => activePicksByMatch[match.matchId]).length;
  const remainingCount = Math.max(0, totalMatches - pickedCount);
  const available = activeProfile ? formatMoney(activeProfile.availableToBet) : "--";
  const potential = activeProfile ? formatMoney(activeProfile.potentialPayout, { cents: true }) : "--";

  stats.innerHTML = [
    ["Picked", `${pickedCount}/${totalMatches}`],
    ["Remaining", remainingCount],
    ["Available", available],
    ["Potential", potential],
  ]
    .map(([label, value]) => {
      return `
        <div class="mini-stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `;
    })
    .join("");
}

function renderPhaseTimeline(phases = activePhases) {
  const list = document.querySelector("#phase-timeline");

  if (!list) {
    return;
  }

  if (!phases.length) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = phases
    .map((phase) => {
      const activeClass = phase.isActive ? "active" : "";
      const completeClass = phase.status === "settled" || phase.status === "complete" ? "complete" : "";

      return `
        <article class="phase-pill ${activeClass} ${completeClass}">
          <span class="phase-dot"></span>
          <strong>${getPhaseShortName(phase.phaseName)}</strong>
        </article>
      `;
    })
    .join("");
}

function renderLeaderboard(players = activeLeaderboard) {
  const list = document.querySelector("#leaderboard-list");
  const summary = document.querySelector("#leaderboard-summary");

  if (!list) {
    return;
  }

  if (summary) {
    summary.innerHTML = "";
  }

  if (!players.length) {
    list.innerHTML = `<p class="empty-state">No players yet.</p>`;
    return;
  }

  list.innerHTML = `
    <div class="leaderboard-table-head">
      <span>Rank</span>
      <span>Player</span>
      <span>Balance</span>
      <span>Payout<br />Potential</span>
    </div>
    ${players
    .map((player) => {
      const initials = String(player.displayName || "?").trim().slice(0, 1).toUpperCase();
      const rankClass = player.rank <= 3 ? ` medal medal-${player.rank}` : "";

      return `
        <article class="leaderboard-row">
          <div class="rank${rankClass}">${player.rank}</div>
          <div class="leaderboard-player-cell">
            <button type="button" data-view-player-picks="${player.playerId}">${player.displayName}</button>
          </div>
          <strong class="leaderboard-balance">${formatMoney(player.currentBalance)}</strong>
          <strong class="leaderboard-potential">${formatMoney(player.potentialPayout, { cents: true })}</strong>
        </article>
      `;
    })
    .join("")}
  `;
}

function renderPickHistoryRows(picks, emptyMessage = "No picks yet.") {
  if (!picks.length) {
    return `<p class="empty-state">${emptyMessage}</p>`;
  }

  return picks
    .map((pick) => {
      const match = pick.match;
      const label = match
        ? `${match.teamA.team} vs ${match.teamB.team}`
        : pick.matchId;
      const selectedTeamName = match ? getTeamNameForSlug(match, pick.selectedTeam) : pick.selectedTeam;
      const amount = `${formatMoney(pick.totalBetAmount)} at ${pick.decimalOdds}x`;

      return `
        <article class="pick-history-row">
          <div>
            <strong>${label}</strong>
            <span>Pick: ${selectedTeamName} - ${amount}</span>
          </div>
          <div class="pick-history-status ${pick.status}">
            ${pick.status}
            <span>${getPickOutcomeText(pick, { netWinnings: true })}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderProfile(profile = activeProfile) {
  const summary = document.querySelector("#profile-summary");
  const identity = document.querySelector("#profile-identity");

  if (!summary) {
    return;
  }

  if (!profile) {
    if (identity) {
      identity.innerHTML = "";
    }
    summary.innerHTML = `<p class="empty-state">Join the game to see your profile.</p>`;
    return;
  }

  if (identity) {
    const initials = String(profile.displayName || "?").trim().slice(0, 1).toUpperCase();
    const savedPlayer = getSavedPlayer();
    const managedPlayers = getManagedPlayers();
    const switcher = managedPlayers.length > 1
      ? `
        <div class="profile-player-switcher">
          <span>Switch Player</span>
          <div class="profile-player-options">
            ${managedPlayers.map((player) => {
              const isActive = player.player_id === savedPlayer?.player_id;
              return `<button class="${isActive ? "active" : ""}" type="button" data-switch-player="${player.player_id}">${player.display_name}</button>`;
            }).join("")}
          </div>
        </div>
      `
      : "";
    identity.innerHTML = `
      <div class="profile-avatar">${initials}</div>
      <form class="profile-name-form" data-profile-name-form>
        <label for="profile-display-name">Display Name</label>
        <div class="profile-name-controls">
          <input id="profile-display-name" name="displayName" type="text" maxlength="20" autocomplete="name" required />
          <button type="submit">Update</button>
        </div>
        <span>Maximum 20 characters. Display names must be unique.</span>
        ${switcher}
      </form>
    `;
    identity.querySelector("#profile-display-name").value = profile.displayName;
  }

  const winningStakes = activePickHistory.reduce((total, pick) => {
    return pick.status === "won"
      ? total + (Number(pick.playerCashStake) || 0)
      : total;
  }, 0);
  const netWinnings = Math.max(0, (Number(profile.totalWinnings) || 0) - winningStakes);
  const stats = [
    ["Current Balance", formatMoney(profile.currentBalance)],
    ["Available to Bet", formatMoney(profile.availableToBet)],
    ["Pending Bets", formatMoney(profile.pendingBets)],
    ["Total Winnings", formatMoney(netWinnings)],
    ["Total Losses", formatMoney(profile.totalLosses, { cents: true })],
    ["Record", `${profile.wins}W-${profile.losses}L-${profile.draws}D`],
  ];

  summary.innerHTML = stats
    .map(([label, value]) => {
      return `
        <div class="stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `;
    })
    .join("");
}

function renderPickHistory(picks = activePickHistory) {
  const list = document.querySelector("#profile-picks-list");

  if (!list) {
    return;
  }

  list.innerHTML = renderPickHistoryRows(picks);
}

async function openPlayerPicks(playerId) {
  const overlay = document.querySelector("#player-picks-overlay");
  const title = document.querySelector("#player-picks-title");
  const list = document.querySelector("#player-picks-list");

  if (!overlay || !title || !list) {
    return;
  }

  const player = activeLeaderboard.find((item) => item.playerId === playerId);
  title.textContent = `${player?.displayName || "Player"} Picks`;
  list.innerHTML = `<p class="empty-state">Loading settled picks...</p>`;
  overlay.hidden = false;

  try {
    const result = await callApi("getPublicSettledPicks", { playerId });
    title.textContent = `${result.displayName} Picks`;
    list.innerHTML = renderPickHistoryRows(result.picks || [], "No settled picks yet.");
  } catch (error) {
    console.error(error);
    list.innerHTML = `<p class="empty-state">Could not load settled picks.</p>`;
  }
}

function closePlayerPicks() {
  const overlay = document.querySelector("#player-picks-overlay");

  if (overlay) {
    overlay.hidden = true;
  }
}

function showView(viewName) {
  const views = {
    matches: document.querySelector("#matches-view"),
    detail: document.querySelector("#match-detail-view"),
    leaderboard: document.querySelector("#leaderboard-view"),
    profile: document.querySelector("#profile-view"),
    rules: document.querySelector("#rules-view"),
  };
  const titles = {
    matches: "Matches",
    detail: "Match Details",
    leaderboard: "Leaderboard",
    profile: "My Profile",
    rules: "Rules",
  };
  const selectedView = viewName === "detail" && !activeDetailMatchId
    ? "matches"
    : views[viewName] ? viewName : "matches";

  Object.entries(views).forEach(([name, view]) => {
    view.hidden = name !== selectedView;
  });

  document.querySelectorAll(".bottom-nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === selectedView);
  });
  document.querySelector(".bottom-nav").hidden = selectedView === "detail";
  document.querySelector(".player-design-header").hidden = selectedView === "detail";
  const phaseCard = document.querySelector(".phase-progress-card");
  phaseCard.hidden = selectedView === "detail" || selectedView === "leaderboard";
  phaseCard.classList.toggle("rules-phase-card", selectedView === "rules");
  renderPhaseHeader(selectedView === "rules");
}

function renderPhaseHeader(isRulesView = false) {
  const status = document.querySelector("#phase-status");
  const phaseName = document.querySelector("#phase-name");

  if (!status || !phaseName || !activeGameState) {
    return;
  }

  if (isRulesView) {
    phaseName.textContent = "How to Play";
    status.textContent = getActivePhaseLockText() || "Locks before each phase";
    return;
  }

  phaseName.textContent = activeGameState.activePhaseName || "Group Matchday 1";
  status.textContent = `${getActivePhaseLockText()} - ${activeMatches.length} matches`;
}

function renderMatches(matches, picksByMatch = activePicksByMatch) {
  const list = document.querySelector("#matches-list");
  const gameLocked = activeGameState?.gameStatus === "settling" || activeGameState?.gameStatus === "complete";

  if (!list) {
    return;
  }

  activeMatches = matches;

  renderPlayerSnapshotStats();

  if (!matches.length) {
    list.innerHTML = `<p class="empty-state">No matches found for the active phase.</p>`;
    return;
  }

  const matchKey = `${activeGameState?.activePhaseName || ""}:${matches.map((match) => match.matchId).join("|")}`;

  if (activeFeaturedMatchKey !== matchKey || !matches.some((match) => match.matchId === activeFeaturedMatchId)) {
    activeFeaturedMatchKey = matchKey;
    activeFeaturedMatchId = matches[Math.floor(Math.random() * matches.length)]?.matchId || "";
  }

  const featuredMatch = matches.find((match) => match.matchId === activeFeaturedMatchId) || matches[0];
  const displayMatches = [
    featuredMatch,
    ...matches.filter((match) => match.matchId !== featuredMatch.matchId),
  ];

  list.innerHTML = displayMatches
    .map((match, index) => {
      const matchComplete = isMatchClosed(match);
      const readOnly = matchComplete || gameLocked || isMatchBettingLocked(match);
      const savedPick = enrichPickWithMatch(picksByMatch[match.matchId], match);
      const finalScore = `${match.teamAGoals} - ${match.teamBGoals}`;
      const pickStatusLabel = getMatchPickStatus(match, savedPick, readOnly);
      const teamAFlag = getTeamFlag(match, "A");
      const teamBFlag = getTeamFlag(match, "B");
      const actionText = matchComplete ? (savedPick ? "View Bet" : "Final") : savedPick ? "Update Bet" : "Make Bet";
      const actionClass = getActionButtonClass(actionText);
      const teamAMarker = getMatchMarker(match, "A", savedPick);
      const teamBMarker = getMatchMarker(match, "B", savedPick);

      if (index === 0) {
        const teamAPlayer = getTeamPlayerImage(match, "A");
        const teamBPlayer = getTeamPlayerImage(match, "B");

        return `
          <article class="featured-match-card" data-open-match="${match.matchId}">
            <div class="featured-label">★ Featured Match</div>
            <div class="featured-art featured-art-left">
              ${teamAPlayer ? `<img class="featured-player" src="${teamAPlayer}" alt="" loading="lazy" />` : ""}
            </div>
            <div class="featured-art featured-art-right">
              ${teamBPlayer ? `<img class="featured-player" src="${teamBPlayer}" alt="" loading="lazy" />` : ""}
            </div>
            <div class="featured-content">
              <div class="featured-team featured-left">
                ${teamAFlag ? `
                  <span class="featured-flag-wrap">
                    <img class="featured-flag" src="${teamAFlag}" alt="" loading="lazy" />
                    ${renderTeamMarker(teamAMarker, "featured-marker")}
                  </span>
                ` : ""}
                <strong>${match.teamA.team}</strong>
              </div>
              <div class="featured-center">
                <span>${getMatchStageLabel(match)}</span>
                <strong>VS</strong>
                <span class="match-row-time">${matchComplete ? finalScore : formatMatchDateTime(match.matchDateTime)}</span>
                <button class="${actionClass}" type="button" data-open-match-button="${match.matchId}" ${readOnly ? "disabled" : ""}>${actionText}</button>
              </div>
              <div class="featured-team featured-right">
                ${teamBFlag ? `
                  <span class="featured-flag-wrap">
                    <img class="featured-flag" src="${teamBFlag}" alt="" loading="lazy" />
                    ${renderTeamMarker(teamBMarker, "featured-marker")}
                  </span>
                ` : ""}
                <strong>${match.teamB.team}</strong>
              </div>
            </div>
          </article>
        `;
      }

      return `
        <article class="match-row-card" data-open-match="${match.matchId}">
          <div class="match-row-main">
            <div class="match-row-team">
              ${teamAFlag ? `
                <span class="team-flag-wrap">
                  <img class="team-flag" src="${teamAFlag}" alt="" loading="lazy" />
                  ${renderTeamMarker(teamAMarker, "team-marker")}
                </span>
              ` : ""}
              <strong>${getTeamCode(match.teamA, match.teamASlug)}</strong>
            </div>
            <div class="match-row-center">
              <span>${getMatchStageLabel(match)}</span>
              <strong>VS</strong>
              <span class="match-row-time">${matchComplete ? finalScore : formatMatchDateTime(match.matchDateTime)}</span>
            </div>
            <div class="match-row-team right">
              ${teamBFlag ? `
                <span class="team-flag-wrap">
                  <img class="team-flag" src="${teamBFlag}" alt="" loading="lazy" />
                  ${renderTeamMarker(teamBMarker, "team-marker")}
                </span>
              ` : ""}
              <strong>${getTeamCode(match.teamB, match.teamBSlug)}</strong>
            </div>
          </div>
          <div class="match-row-action">
            <button class="${actionClass}" type="button" data-open-match-button="${match.matchId}" ${readOnly ? "disabled" : ""}>${actionText}</button>
            <p class="match-list-status">${pickStatusLabel}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function getDetailMatch() {
  return activeMatches.find((match) => match.matchId === activeDetailMatchId) || activeMatches[0];
}

function renderDetailTeam(match, side, readOnly = false) {
  const team = getTeam(match, side);
  const slug = getTeamSlug(match, side);
  const selectedClass = activeDetailSelection === slug ? "selected" : "";
  const flag = getTeamFlag(match, side);
  const emblem = getTeamEmblem(match, side);
  const playerImage = getTeamPlayerImage(match, side);
  const odds = getTeamOdds(match, side);
  const probability = getImpliedProbability(odds).toFixed(0);

  return `
    <div class="detail-team detail-team-${side.toLowerCase()}">
      ${playerImage ? `<img class="detail-player" src="${playerImage}" alt="" loading="lazy" />` : ""}
      <div class="detail-team-identity">
        ${flag ? `<img class="detail-flag" src="${flag}" alt="" loading="lazy" />` : ""}
        ${emblem ? `<img class="detail-emblem" src="${emblem}" alt="" loading="lazy" />` : ""}
      </div>
      <h3>${team.team}</h3>
      <button class="${selectedClass}" type="button" data-detail-team="${slug}" ${readOnly ? "disabled" : ""}>Pick ${team.team}</button>
      <dl>
        <div><dt>FIFA Rank</dt><dd>${formatFifaRank(team.fifaRank)}</dd></div>
        <div><dt>Betting Odds</dt><dd>${odds || "--"}x</dd></div>
        <div><dt>Win Probability</dt><dd>${probability}%</dd></div>
        <div><dt>Nickname</dt><dd>${team.nickname || "--"}</dd></div>
        <div><dt>Star Player</dt><dd>${team.starPlayer || "--"}</dd></div>
      </dl>
    </div>
  `;
}

function renderDetailFlagBlock(match, side) {
  const flag = getTeamFlag(match, side);
  const winnerSlug = getMatchWinnerSlug(match);
  const marker = winnerSlug && winnerSlug === getTeamSlug(match, side) ? "star" : "";

  return `
    <div class="detail-flag-block">
      ${flag ? `<img class="detail-flag" src="${flag}" alt="" loading="lazy" />` : ""}
      ${renderTeamMarker(marker, "detail-marker")}
    </div>
  `;
}

function renderDetailPickButton(match, side, readOnly) {
  const team = getTeam(match, side);
  const slug = getTeamSlug(match, side);
  const code = getTeamCode(team, slug);
  const selectedClass = !readOnly && activeDetailSelection === slug ? "selected" : "";

  return `<button class="${selectedClass}" type="button" data-detail-team="${slug}" ${readOnly ? "disabled" : ""}>Pick ${code}</button>`;
}

function renderSettledDetailSummary(savedPick) {
  if (!savedPick) {
    return `
      <section class="detail-result-panel">
        <h3>No Bet Placed</h3>
        <div class="detail-result-grid">
          <span>Your Pick</span><strong>--</strong>
          <span>Result</span><strong>No bet placed</strong>
        </div>
      </section>
    `;
  }

  const resultText = savedPick.status === "draw" ? "Draw - no money won or lost" : getPickOutcomeText(savedPick);

  return `
    <section class="detail-result-panel">
      <h3>Bet Result</h3>
      <div class="detail-result-grid">
        <span>Your Pick</span><strong>${savedPick.selectedTeamName || savedPick.selectedTeam}</strong>
        <span>Total Bet</span><strong>${formatMoney(savedPick.totalBetAmount)}</strong>
        <span>Result</span><strong>${resultText}</strong>
      </div>
    </section>
  `;
}

function renderBetSelect(value, maxValue, disabled = false) {
  const max = Math.max(1, Number(maxValue) || 1);
  const current = Math.min(max, Math.max(1, Number(value) || 1));
  const values = Array.from({ length: max }, (_, index) => index + 1);

  return `
    <select class="bet-select" data-detail-bet ${disabled ? "disabled" : ""} aria-label="Your bet amount">
      ${values.map((amount) => `<option value="${amount}" ${amount === current ? "selected" : ""}>$${amount}</option>`).join("")}
    </select>
  `;
}

function renderDetailStatsTable(match) {
  const teamA = getTeam(match, "A");
  const teamB = getTeam(match, "B");
  const teamAOdds = getTeamOdds(match, "A");
  const teamBOdds = getTeamOdds(match, "B");
  const teamAProbability = getImpliedProbability(teamAOdds).toFixed(0);
  const teamBProbability = getImpliedProbability(teamBOdds).toFixed(0);
  const rows = [
    ["FIFA Rank", formatFifaRank(teamA.fifaRank), formatFifaRank(teamB.fifaRank)],
    ["Betting Odds", teamAOdds ? `${teamAOdds}x` : "--", teamBOdds ? `${teamBOdds}x` : "--"],
    ["Win Probability", `${teamAProbability}%`, `${teamBProbability}%`],
    ["Nickname", teamA.nickname || "--", teamB.nickname || "--"],
    ["Star Player", teamA.starPlayer || "--", teamB.starPlayer || "--"],
  ];

  return `
    <div class="detail-stats-table">
      <div class="detail-stats-heading">
        <strong>${teamA.team}</strong>
        <strong>${teamB.team}</strong>
      </div>
      ${rows.map(([label, valueA, valueB]) => `
        <div class="detail-stats-row">
          <span>${valueA}</span>
          <strong>${label}</strong>
          <span>${valueB}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMatchDetail() {
  const container = document.querySelector("#match-detail-content");
  const match = getDetailMatch();

  if (!container || !match) {
    return;
  }

  activeDetailMatchId = match.matchId;
  const savedPick = enrichPickWithMatch(
    activePicksByMatch[match.matchId] || activePickHistory.find((pick) => pick.matchId === match.matchId && pick.status !== "cancelled"),
    match,
  );
  const matchComplete = isMatchClosed(match);
  const readOnly = matchComplete || isMatchBettingLocked(match) || activeGameState?.gameStatus === "settling" || activeGameState?.gameStatus === "complete";

  if (!activeDetailSelection && savedPick) {
    activeDetailSelection = savedPick.selectedTeam;
  }

  const maxTotalBet = getMaxTotalBet(savedPick);
  activeDetailBetAmount = Math.min(maxTotalBet, Math.max(1, Number(activeDetailBetAmount || savedPick?.totalBetAmount) || 1));
  const payoutText = getPayoutText(match, activeDetailSelection, activeDetailBetAmount);
  const selectedTeamName = activeDetailSelection ? getTeamNameForSlug(match, activeDetailSelection) : "";
  const payoutValue = activeDetailSelection ? payoutText.replace("Potential Payout ", "") : "N/A";
  const payoutClass = activeDetailSelection ? "" : " is-empty";
  const teamAPlayer = getTeamPlayerImage(match, "A");
  const teamBPlayer = getTeamPlayerImage(match, "B");

  container.innerHTML = `
    <article class="detail-match-hero">
      <div class="detail-player-art detail-player-art-left">
        ${teamAPlayer ? `<img class="detail-player" src="${teamAPlayer}" alt="" loading="lazy" />` : ""}
        <img class="detail-player-overlay" src="assets/left-overlay.png" alt="" />
      </div>
      <div class="detail-player-art detail-player-art-right">
        ${teamBPlayer ? `<img class="detail-player" src="${teamBPlayer}" alt="" loading="lazy" />` : ""}
        <img class="detail-player-overlay detail-player-overlay-right" src="assets/right-overlay.png" alt="" />
      </div>
      <div class="detail-match-meta">
        ${renderDetailFlagBlock(match, "A")}
        <div class="detail-match-center">
          <span>${getMatchStageLabel(match)}</span>
          <strong>VS</strong>
          ${String(match.status || "").toLowerCase() === "settled" && hasFinalScore(match)
            ? `<span class="detail-final-score">${match.teamAGoals} - ${match.teamBGoals}</span>`
            : ""}
        </div>
        ${renderDetailFlagBlock(match, "B")}
      </div>
      ${renderDetailStatsTable(match)}
      <div class="detail-pick-actions">
        ${renderDetailPickButton(match, "A", readOnly)}
        ${renderDetailPickButton(match, "B", readOnly)}
      </div>
    </article>
    ${matchComplete ? renderSettledDetailSummary(savedPick) : `
    <section class="detail-bet-panel">
      <h3>$1 House Money Included</h3>
      <div class="detail-bet-grid">
        <label>
          Your Bet
          ${renderBetSelect(activeDetailBetAmount, maxTotalBet, readOnly)}
        </label>
        <div class="detail-payout">
          <span>Potential Payout</span>
          <strong class="${payoutClass}">${payoutValue}</strong>
        </div>
      </div>
      <p class="detail-selected-copy">${selectedTeamName ? `Selected: ${selectedTeamName}` : "Select a team to place your bet"}</p>
      <p class="detail-lock-copy">${match.lockTime ? `Betting locks ${match.lockTime}` : ""}</p>
      <button class="place-bet-button" type="button" data-place-bet ${readOnly || !activeDetailSelection ? "disabled" : ""}>
        ${savedPick ? "Update Bet" : "Place Bet"}
      </button>
      <p class="pick-status" data-detail-status aria-live="polite">${savedPick ? getPickStatusText(savedPick) : ""}</p>
    </section>
    `}
  `;
}

function openMatchDetail(matchId) {
  const match = activeMatches.find((item) => item.matchId === matchId);

  if (!match) {
    return;
  }

  const savedPick = activePicksByMatch[match.matchId];
  activeDetailMatchId = match.matchId;
  activeDetailSelection = savedPick?.selectedTeam || "";
  activeDetailBetAmount = Number(savedPick?.totalBetAmount) || 1;
  document.querySelector("#match-detail-view").hidden = false;
  showView("detail");
  renderMatchDetail();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMatchDetail() {
  activeDetailMatchId = "";
  activeDetailSelection = "";
  document.querySelector("#match-detail-view").hidden = true;
  showView("matches");
}

function moveDetail(delta) {
  const index = activeMatches.findIndex((match) => match.matchId === activeDetailMatchId);
  const next = activeMatches[index + delta];

  if (next) {
    openMatchDetail(next.matchId);
  }
}

async function handleJoinSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const input = form.querySelector("#display-name");
  const submitButton = form.querySelector("button");
  const displayName = input.value.trim();

  if (!displayName || displayName.length > 20) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Joining...";

  try {
    const result = await callApi("joinGame", {
      deviceId: getOrCreateDeviceId(),
      displayName,
    });

    saveManagedPlayers([]);
    savePlayer(result.player);
    renderPlayer(result.player);
    renderMatches(activeMatches);
    loadSummaryData();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Join Game";
  }
}

async function handleProfileNameSubmit(event) {
  const form = event.target.closest("[data-profile-name-form]");

  if (!form) {
    return;
  }

  event.preventDefault();

  const player = getSavedPlayer();
  const input = form.querySelector("#profile-display-name");
  const submitButton = form.querySelector("button");
  const displayName = input.value.trim();

  if (!player || !displayName || displayName.length > 20) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Updating...";

  try {
    const result = await callApi("updatePlayerProfile", {
      playerId: player.player_id,
      deviceId: player.device_id,
      displayName,
    });

    savePlayer(result.player);
    updateManagedPlayer(result.player);
    clearCachedSnapshot();
    renderPlayer(result.player);

    if (activeProfile) {
      activeProfile.displayName = result.player.display_name;
      renderProfile(activeProfile);
    }

    await loadGameState();
  } catch (error) {
    console.error(error);
    alert(error.message);
    submitButton.disabled = false;
    submitButton.textContent = "Update";
  }
}

async function handleProfileClick(event) {
  const switchButton = event.target.closest("[data-switch-player]");

  if (!switchButton) {
    return;
  }

  const player = getManagedPlayers().find((item) => {
    return item.player_id === switchButton.dataset.switchPlayer;
  });

  if (!player || player.player_id === getSavedPlayer()?.player_id) {
    return;
  }

  savePlayer(player);
  clearCachedSnapshot();
  renderPlayer(player);
  await loadGameState();
}

async function handleDetailPlaceBet() {
  const player = getSavedPlayer();
  const match = getDetailMatch();
  const status = document.querySelector("[data-detail-status]");
  const button = document.querySelector("[data-place-bet]");

  if (!player) {
    alert("Join the game before making a pick.");
    return;
  }

  if (!match || !activeDetailSelection) {
    return;
  }

  if (isMatchClosed(match)) {
    status.textContent = "Betting is closed for this match.";
    button.disabled = true;
    return;
  }

  const previousPick = activePicksByMatch[match.matchId];
  const optimisticPick = {
    matchId: match.matchId,
    selectedTeam: activeDetailSelection,
    selectedTeamName: getTeamNameForSlug(match, activeDetailSelection),
    totalBetAmount: activeDetailBetAmount,
    playerCashStake: Math.max(0, activeDetailBetAmount - 1),
  };

  activePicksByMatch[match.matchId] = optimisticPick;

  if (activeProfile) {
    const previousStake = previousPick ? Number(previousPick.playerCashStake) || 0 : 0;
    const nextStake = optimisticPick.playerCashStake;
    activeProfile.pendingBets = Math.max(0, (Number(activeProfile.pendingBets) || 0) - previousStake + nextStake);
    activeProfile.availableToBet = Math.max(0, (Number(activeProfile.availableToBet) || 0) + previousStake - nextStake);
    renderPlayerBalances();
    renderPlayerSnapshotStats();
  }

  button.disabled = true;
  button.textContent = previousPick ? "Update Bet" : "Place Bet";
  status.textContent = `Saved: ${optimisticPick.selectedTeamName} for ${formatMoney(optimisticPick.totalBetAmount)} total bet`;
  renderMatches(activeMatches, activePicksByMatch);

  try {
    const result = await callApi("savePick", {
      playerId: player.player_id,
      matchId: match.matchId,
      selectedTeam: activeDetailSelection,
      totalBetAmount: activeDetailBetAmount,
    });

    activePicksByMatch[match.matchId] = {
      matchId: result.pick.match_id,
      selectedTeam: result.pick.selected_team,
      selectedTeamName: getTeamNameForSlug(match, result.pick.selected_team),
      totalBetAmount: Number(result.pick.total_bet_amount) || 1,
      playerCashStake: Number(result.pick.player_cash_stake) || 0,
    };
    clearCachedSnapshot();
    status.textContent = `Saved: ${activePicksByMatch[match.matchId].selectedTeamName} for ${formatMoney(result.pick.total_bet_amount)} total bet`;
    renderMatches(activeMatches, activePicksByMatch);
    renderMatchDetail();
  } catch (error) {
    console.error(error);
    if (previousPick) {
      activePicksByMatch[match.matchId] = previousPick;
    } else {
      delete activePicksByMatch[match.matchId];
    }
    if (activeProfile) {
      const previousStake = previousPick ? Number(previousPick.playerCashStake) || 0 : 0;
      const nextStake = optimisticPick.playerCashStake;
      activeProfile.pendingBets = Math.max(0, (Number(activeProfile.pendingBets) || 0) + previousStake - nextStake);
      activeProfile.availableToBet = Math.max(0, (Number(activeProfile.availableToBet) || 0) - previousStake + nextStake);
      renderPlayerBalances();
      renderPlayerSnapshotStats();
    }
    status.textContent = `Could not save pick: ${error.message}`;
    button.disabled = false;
    renderMatches(activeMatches, activePicksByMatch);
    renderMatchDetail();
  }
}

async function handleCancelPick() {
  const player = getSavedPlayer();
  const match = getDetailMatch();
  const previousPick = match ? activePicksByMatch[match.matchId] : null;

  if (!player || !match || !previousPick) {
    activeDetailSelection = "";
    renderMatchDetail();
    return;
  }

  delete activePicksByMatch[match.matchId];
  activeDetailSelection = "";
  renderMatches(activeMatches, activePicksByMatch);
  renderMatchDetail();

  const status = document.querySelector("[data-detail-status]");
  if (status) {
    status.textContent = "Removing pick...";
  }

  try {
    await callApi("cancelPick", {
      playerId: player.player_id,
      matchId: match.matchId,
    });
    clearCachedSnapshot();
    await loadGameState();
  } catch (error) {
    console.error(error);
    activePicksByMatch[match.matchId] = previousPick;
    activeDetailSelection = previousPick.selectedTeam;
    await loadGameState();
    renderMatchDetail();
    const restoredStatus = document.querySelector("[data-detail-status]");
    if (restoredStatus) {
      restoredStatus.textContent = `Could not remove pick: ${error.message}`;
    }
  }
}

function handleMatchesListClick(event) {
  const target = event.target.closest("[data-open-match], [data-open-match-button]");

  if (!target) {
    return;
  }

  const matchId = target.dataset.openMatch || target.dataset.openMatchButton;
  openMatchDetail(matchId);
}

function handleLeaderboardClick(event) {
  const playerButton = event.target.closest("[data-view-player-picks]");

  if (playerButton) {
    openPlayerPicks(playerButton.dataset.viewPlayerPicks);
  }
}

function handlePlayerPicksOverlayClick(event) {
  if (event.target.closest("[data-close-player-picks]") || event.target.id === "player-picks-overlay") {
    closePlayerPicks();
  }
}

function handleMatchDetailClick(event) {
  const teamButton = event.target.closest("[data-detail-team]");
  const placeBetButton = event.target.closest("[data-place-bet]");
  const prevButton = event.target.closest("[data-detail-prev]");
  const nextButton = event.target.closest("[data-detail-next]");

  if (teamButton) {
    const selectedTeam = teamButton.dataset.detailTeam;
    const savedPick = activePicksByMatch[activeDetailMatchId];

    if (savedPick?.selectedTeam === selectedTeam && activeDetailSelection === selectedTeam) {
      handleCancelPick();
      return;
    }

    activeDetailSelection = activeDetailSelection === selectedTeam ? "" : selectedTeam;
    renderMatchDetail();
    return;
  }

  if (placeBetButton) {
    handleDetailPlaceBet();
    return;
  }

  if (prevButton) {
    moveDetail(-1);
    return;
  }

  if (nextButton) {
    moveDetail(1);
  }
}

function handleDetailBetInput(event) {
  const input = event.target.closest("[data-detail-bet]");

  if (!input) {
    return;
  }

  const savedPick = activePicksByMatch[activeDetailMatchId];
  const max = getMaxTotalBet(savedPick);
  activeDetailBetAmount = Math.min(max, Math.max(1, Math.floor(Number(input.value) || 1)));
  renderMatchDetail();
}

async function loadSummaryData() {
  const player = getSavedPlayer();

  try {
    const leaderboardResult = await callApi("getLeaderboard");
    activeLeaderboard = leaderboardResult.players;
    renderLeaderboard(activeLeaderboard);
  } catch (error) {
    console.error(error);
  }

  if (!player) {
    activeProfile = null;
    renderProfile(activeProfile);
    return;
  }

  try {
    const profileResult = await callApi("getPlayerProfile", {
      playerId: player.player_id,
    });
    const historyResult = await loadPlayerPickHistory(player, "");

    activeProfile = profileResult.player;
    activePickHistory = historyResult.picks;
    renderProfile(activeProfile);
    renderPickHistory(activePickHistory);
    renderPlayerBalances();
    activePicksByMatch = {
      ...activePicksByMatch,
      ...indexPicksByMatch(activePickHistory),
    };
    renderMatches(activeMatches, activePicksByMatch);
    renderPlayerSnapshotStats();
  } catch (error) {
    console.error(error);
  }
}

async function loadPlayerSnapshot(player) {
  try {
    const result = await callApi("getPlayerSnapshot", {
      playerId: player?.player_id,
    });

    return { result, error: null };
  } catch (error) {
    console.error(error);
    return { result: null, error };
  }
}

function applyPlayerSnapshot(result, options = {}) {
  const status = document.querySelector("#phase-status");
  const phaseName = document.querySelector("#phase-name");

  activeGameState = result.gameState;
  activePickSummaryByMatch = result.pickSummary?.summaries || {};
  activePicksByMatch = indexPicksByMatch(result.playerPicks?.picks || []);
  activeLeaderboard = result.leaderboard?.players || [];
  activeProfile = result.profile?.player || null;
  activePickHistory = result.pickHistory?.picks || [];
  activeMatches = result.matches?.matches || [];
  activePhases = result.phases?.phases || [];

  if (result.managedPlayers?.length > 1) {
    saveManagedPlayers(result.managedPlayers);
  }

  if (getSavedPlayer() && !activeProfile && result.profile?.error === "Player not found.") {
    clearSavedPlayer();
    renderPlayer(null);
  }

  phaseName.textContent = result.gameState.activePhaseName;
  status.textContent = options.cached
    ? `Showing saved data - refreshing live data...`
    : result.pickSummary?.error
      ? `${result.gameState.gameStatus} - ${result.matches.count} matches - pick activity unavailable`
      : `${getActivePhaseLockText()} - ${result.matches.count} matches`;
  renderLeaderboard(activeLeaderboard);
  renderProfile(activeProfile);
  renderPickHistory(activePickHistory);
  renderPhaseTimeline(activePhases);
  renderMatches(activeMatches, activePicksByMatch);
  renderPlayerSnapshotStats();
  renderPhaseHeader(window.location.hash === "#rules");

  renderPlayerBalances();
}

async function loadGameState() {
  const status = document.querySelector("#phase-status");
  const phaseName = document.querySelector("#phase-name");

  try {
    const cached = getCachedSnapshot();

    if (cached?.result) {
      applyPlayerSnapshot(cached.result, { cached: true });
    } else {
      status.textContent = "Loading live game data...";
    }

    const player = getSavedPlayer();
    const snapshot = await loadPlayerSnapshot(player);

    if (snapshot.result) {
      saveCachedSnapshot(snapshot.result);
      applyPlayerSnapshot(snapshot.result);
      return;
    }

    const gameState = await callApi("getGameState");
    activeGameState = gameState;
    const matchesResult = await callApi("getMatches", {
      phase: gameState.activePhaseName,
    });
    const phasesResult = await callApi("getPhases");
    const summaryResult = await loadPhasePickSummary(gameState.activePhaseName);
    const picksResult = await loadPlayerPickHistory(player, gameState.activePhaseName);

    activePickSummaryByMatch = summaryResult.summaries;
    activePicksByMatch = indexPicksByMatch(picksResult.picks);
    activePhases = phasesResult.phases;
    await loadSummaryData();

    phaseName.textContent = gameState.activePhaseName;
    status.textContent = picksResult.error
      ? `${gameState.gameStatus} - ${matchesResult.count} matches - saved picks unavailable: ${picksResult.error.message}`
      : summaryResult.error
        ? `${gameState.gameStatus} - ${matchesResult.count} matches - pick activity unavailable`
        : `${getActivePhaseLockText()} - ${matchesResult.count} matches`;
    renderPhaseTimeline(activePhases);
    renderMatches(matchesResult.matches, activePicksByMatch);
    renderPhaseHeader(window.location.hash === "#rules");
  } catch (error) {
    console.error(error);
    status.textContent = `Could not load live data: ${error.message}`;
  }
}

document.querySelector("#refresh-button")?.addEventListener("click", loadGameState);
document.querySelectorAll(".refresh-data-button").forEach((button) => {
  button.addEventListener("click", loadSummaryData);
});
document.querySelector("#join-form")?.addEventListener("submit", handleJoinSubmit);
document.querySelector("#profile-view")?.addEventListener("submit", handleProfileNameSubmit);
document.querySelector("#profile-view")?.addEventListener("click", handleProfileClick);
document.querySelector("#matches-list")?.addEventListener("click", handleMatchesListClick);
document.querySelector("#leaderboard-list")?.addEventListener("click", handleLeaderboardClick);
document.querySelector("#player-picks-overlay")?.addEventListener("click", handlePlayerPicksOverlayClick);
document.querySelector("#match-detail-view")?.addEventListener("click", handleMatchDetailClick);
document.querySelector("#match-detail-view")?.addEventListener("change", handleDetailBetInput);
document.querySelector("#match-detail-view")?.addEventListener("input", handleDetailBetInput);
document.querySelector("#detail-close-button")?.addEventListener("click", closeMatchDetail);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePlayerPicks();
  }
});
document.querySelector(".bottom-nav")?.addEventListener("click", (event) => {
  const link = event.target.closest("[data-view]");

  if (!link) {
    return;
  }

  event.preventDefault();
  showView(link.dataset.view);
});

async function recoverPlayerFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("recover");

  if (!token) {
    return;
  }

  try {
    const result = await callApi("redeemRecoveryToken", { token });
    saveManagedPlayers(result.managedPlayers || []);
    savePlayer(result.player);
    clearCachedSnapshot();
  } catch (error) {
    console.error(error);
    alert(error.message);
  } finally {
    url.searchParams.delete("recover");
    window.history.replaceState({}, "", url.toString());
  }
}

async function startApp() {
  await recoverPlayerFromUrl();
  renderPlayer(getSavedPlayer());
  showView(location.hash.replace("#", "") || "matches");
  loadGameState();
}

startApp();
