const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbyVQSuyK4eaoc4rAX80I4A9hXPBQ9BC_O1KNi9zjmnaK7F0L3RHIGiFJWlB0nA_QPuCCQ/exec",
};

const STORAGE_KEYS = {
  deviceId: "worldCupCashDeviceId",
  player: "worldCupCashPlayer",
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

  if (!player) {
    joinPanel.hidden = false;
    playerPanel.hidden = true;
    return;
  }

  joinPanel.hidden = true;
  playerPanel.hidden = false;
  playerName.textContent = player.display_name;
  balance.textContent = `$${Number(player.current_balance).toFixed(0)}`;
}

function indexPicksByMatch(picks) {
  return picks.reduce((index, pick) => {
    index[pick.matchId] = pick;
    return index;
  }, {});
}

function getPickStatusText(pick) {
  if (!pick) {
    return "";
  }

  return `Saved: ${pick.selectedTeamName || pick.selectedTeam} for ${formatMoney(pick.totalBetAmount)} total bet`;
}

function getPickOutcomeText(pick) {
  if (!pick) {
    return "";
  }

  if (pick.status === "won") {
    return `Won ${formatMoney(pick.potentialPayout, { cents: true })}`;
  }

  if (pick.status === "lost") {
    return `Lost ${formatMoney(pick.playerCashStake)}`;
  }

  if (pick.status === "draw") {
    return "Draw - no money won or lost";
  }

  return getPickStatusText(pick);
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
  const activePhase = activePhases.find((phase) => phase.isActive);

  if (!activePhase) {
    return "";
  }

  if (activeGameState?.gameStatus === "locked") {
    return "Phase locked";
  }

  return activePhase.lockTime ? `Locks: ${activePhase.lockTime}` : "";
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
  if (match.status === "settled" || match.status === "final") {
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

      return `
        <article class="phase-pill ${activeClass}">
          <strong>${getPhaseShortName(phase.phaseName)}</strong>
          <span>${phase.status}</span>
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
    const leader = players[0];
    const totalPotential = players.reduce((total, player) => total + (Number(player.potentialPayout) || 0), 0);
    const totalActivePicks = players.reduce((total, player) => total + (Number(player.activePickCount) || 0), 0);
    summary.innerHTML = [
      ["Leader", leader ? leader.displayName : "--"],
      ["Players", players.length],
      ["Active Picks", totalActivePicks],
      ["Potential", formatMoney(totalPotential, { cents: true })],
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

  if (!players.length) {
    list.innerHTML = `<p class="empty-state">No players yet.</p>`;
    return;
  }

  list.innerHTML = players
    .map((player) => {
      const initials = String(player.displayName || "?").trim().slice(0, 1).toUpperCase();

      return `
        <article class="leaderboard-row">
          <div class="rank">${player.rank}</div>
          <div class="avatar">${initials}</div>
          <div>
            <strong>${player.displayName}</strong>
            <span>${player.wins}W-${player.losses}L-${player.draws}D - ${player.activePickCount} picks</span>
            <span>Pending ${formatMoney(player.pendingBets)} - Available ${formatMoney(player.availableToBet)}</span>
          </div>
          <div class="leaderboard-money">
            <strong>${formatMoney(player.currentBalance)}</strong>
            <span>Potential ${formatMoney(player.potentialPayout, { cents: true })}</span>
            <span>Net ${formatMoney((Number(player.totalWinnings) || 0) - (Number(player.totalLosses) || 0), { cents: true })}</span>
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
    identity.innerHTML = `
      <div class="profile-avatar">${initials}</div>
      <div>
        <span>Display Name</span>
        <strong>${profile.displayName}</strong>
      </div>
    `;
  }

  const stats = [
    ["Current Balance", formatMoney(profile.currentBalance)],
    ["Available to Bet", formatMoney(profile.availableToBet)],
    ["Pending Bets", formatMoney(profile.pendingBets)],
    ["Total Winnings", formatMoney(profile.totalWinnings, { cents: true })],
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

  if (!picks.length) {
    list.innerHTML = `<p class="empty-state">No picks yet.</p>`;
    return;
  }

  list.innerHTML = picks
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
            <span>${getPickOutcomeText(pick)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function showView(viewName) {
  const views = {
    matches: document.querySelector("#matches-view"),
    leaderboard: document.querySelector("#leaderboard-view"),
    profile: document.querySelector("#profile-view"),
    rules: document.querySelector("#rules-view"),
  };
  const titles = {
    matches: "Matches",
    leaderboard: "Leaderboard",
    profile: "My Profile",
    rules: "Rules",
  };
  const selectedView = views[viewName] ? viewName : "matches";

  Object.entries(views).forEach(([name, view]) => {
    view.hidden = name !== selectedView;
  });

  document.querySelectorAll(".bottom-nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === selectedView);
  });

  document.querySelector("#screen-title").textContent = titles[selectedView];
}

function renderMatches(matches, picksByMatch = activePicksByMatch) {
  const list = document.querySelector("#matches-list");
  const player = getSavedPlayer();
  const gameLocked = activeGameState?.gameStatus === "locked" || activeGameState?.gameStatus === "settling" || activeGameState?.gameStatus === "complete";

  if (!list) {
    return;
  }

  activeMatches = matches;

  renderPlayerSnapshotStats();

  if (!matches.length) {
    list.innerHTML = `<p class="empty-state">No matches found for the active phase.</p>`;
    return;
  }

  list.innerHTML = matches
    .map((match) => {
      const matchComplete = match.status === "final" || match.status === "settled";
      const readOnly = matchComplete || gameLocked;
      const pickDisabled = player && !readOnly ? "" : "disabled";
      const savedPick = enrichPickWithMatch(picksByMatch[match.matchId], match);
      const teamASelected = savedPick?.selectedTeam === match.teamASlug ? "selected" : "";
      const teamBSelected = savedPick?.selectedTeam === match.teamBSlug ? "selected" : "";
      const finalScore = `${match.teamAGoals} - ${match.teamBGoals}`;
      const statusText = matchComplete
        ? `Final: ${match.teamA.team} ${finalScore} ${match.teamB.team}${savedPick ? ` - ${getPickOutcomeText(savedPick)}` : ""}`
        : getPickStatusText(savedPick);
      const maxTotalBet = getMaxTotalBet(savedPick);
      const totalBetAmount = Math.min(
        maxTotalBet,
        Math.max(1, Number(savedPick?.totalBetAmount) || 1)
      );
      const selectedTeam = savedPick?.selectedTeam || "";
      const payoutText = getPayoutText(match, selectedTeam, totalBetAmount);
      const pickSummary = activePickSummaryByMatch[match.matchId];
      const activityText = getPickActivityText(match, pickSummary);
      const moneyText = getPickMoneyText(pickSummary);
      const probabilityText = getProbabilityText(match);
      const pickStatusLabel = getMatchPickStatus(match, savedPick, readOnly);
      const teamAFlag = getAssetPath(match.teamA?.flagImage);
      const teamBFlag = getAssetPath(match.teamB?.flagImage);

      return `
        <article class="match-card" data-match-id="${match.matchId}">
          <div class="match-card-topline">
            <span>${match.phase}</span>
            <strong class="pick-status-badge ${savedPick ? "picked" : ""}">${pickStatusLabel}</strong>
          </div>
          <div class="team">
            ${teamAFlag ? `<img class="team-flag" src="${teamAFlag}" alt="" loading="lazy" />` : ""}
            <span class="team-code">${match.teamASlug}</span>
            <strong>${match.teamA.team}</strong>
            <span>${match.teamADecimalOdds}x</span>
          </div>
          <div class="match-center">
            <strong>VS</strong>
            <span>${matchComplete ? finalScore : match.matchDateTime}</span>
          </div>
          <div class="team right">
            ${teamBFlag ? `<img class="team-flag" src="${teamBFlag}" alt="" loading="lazy" />` : ""}
            <span class="team-code">${match.teamBSlug}</span>
            <strong>${match.teamB.team}</strong>
            <span>${match.teamBDecimalOdds}x</span>
          </div>
          <div class="pick-actions" role="group" aria-label="Pick winner">
            <button class="${teamASelected}" type="button" data-selected-team="${match.teamASlug}" ${pickDisabled}>
              Pick ${match.teamA.team}
            </button>
            <button class="${teamBSelected}" type="button" data-selected-team="${match.teamBSlug}" ${pickDisabled}>
              Pick ${match.teamB.team}
            </button>
          </div>
          <div class="pick-activity">
            <strong>${activityText}</strong>
            ${moneyText ? `<span>${moneyText}</span>` : ""}
            <span>${probabilityText}</span>
          </div>
          <div class="bet-control">
            <label for="bet-${match.matchId}">Total Bet</label>
            <input
              id="bet-${match.matchId}"
              type="number"
              min="1"
              max="${maxTotalBet}"
              step="1"
              value="${totalBetAmount}"
              data-bet-amount
              ${readOnly ? "disabled" : ""}
            />
            <span>Max ${formatMoney(maxTotalBet)}</span>
          </div>
          <p class="payout-preview" data-payout-preview>${payoutText}</p>
          <p class="pick-status" aria-live="polite">${statusText}</p>
        </article>
      `;
    })
    .join("");
}

async function handleJoinSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const input = form.querySelector("#display-name");
  const submitButton = form.querySelector("button");
  const displayName = input.value.trim();

  if (!displayName) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Joining...";

  try {
    const result = await callApi("joinGame", {
      deviceId: getOrCreateDeviceId(),
      displayName,
    });

    savePlayer(result.player);
    renderPlayer(result.player);
    renderMatches(activeMatches);
    loadSummaryData();
  } catch (error) {
    console.error(error);
    alert("Could not join the game. Please try again.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Join Game";
  }
}

async function handlePickClick(event) {
  const button = event.target.closest("[data-selected-team]");

  if (!button) {
    return;
  }

  const player = getSavedPlayer();

  if (!player) {
    alert("Join the game before making a pick.");
    return;
  }

  const card = button.closest("[data-match-id]");
  const status = card.querySelector(".pick-status");
  const matchId = card.dataset.matchId;
  const selectedTeam = button.dataset.selectedTeam;
  const betInput = card.querySelector("[data-bet-amount]");
  const buttons = card.querySelectorAll("[data-selected-team]");
  const totalBetAmount = Math.max(1, Math.floor(Number(betInput.value) || 1));

  buttons.forEach((item) => {
    item.disabled = true;
  });
  status.textContent = "Saving pick...";

  try {
    const result = await callApi("savePick", {
      playerId: player.player_id,
      matchId,
      selectedTeam,
      totalBetAmount,
    });

    buttons.forEach((item) => {
      item.classList.toggle("selected", item.dataset.selectedTeam === result.pick.selected_team);
    });

    activePicksByMatch[matchId] = {
      matchId: result.pick.match_id,
      selectedTeam: result.pick.selected_team,
      selectedTeamName: getTeamNameForSlug(
        activeMatches.find((match) => match.matchId === matchId),
        result.pick.selected_team
      ),
      totalBetAmount: Number(result.pick.total_bet_amount) || 1,
      playerCashStake: Number(result.pick.player_cash_stake) || 0,
    };
    status.textContent = `Saved: ${activePicksByMatch[matchId].selectedTeamName} for ${formatMoney(result.pick.total_bet_amount)} total bet`;
    loadSummaryData();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not save pick: ${error.message}`;
  } finally {
    buttons.forEach((item) => {
      item.disabled = false;
    });
  }
}

function handleBetAmountInput(event) {
  const input = event.target.closest("[data-bet-amount]");

  if (!input) {
    return;
  }

  const card = input.closest("[data-match-id]");
  const match = activeMatches.find((item) => item.matchId === card.dataset.matchId);
  const savedPick = activePicksByMatch[card.dataset.matchId];
  const selectedButton = card.querySelector("[data-selected-team].selected");
  const selectedTeam = selectedButton?.dataset.selectedTeam || savedPick?.selectedTeam || "";
  const max = Number(input.max) || 1;
  const totalBetAmount = Math.min(max, Math.max(1, Math.floor(Number(input.value) || 1)));
  const preview = card.querySelector("[data-payout-preview]");
  const status = card.querySelector(".pick-status");

  input.value = totalBetAmount;

  if (match && preview) {
    preview.textContent = getPayoutText(match, selectedTeam, totalBetAmount);
  }

  if (savedPick && Number(savedPick.totalBetAmount) !== totalBetAmount) {
    status.textContent = "Tap your selected team to save the new total bet";
  }
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
    document.querySelector("#current-balance").textContent = formatMoney(activeProfile.currentBalance);
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

  phaseName.textContent = result.gameState.activePhaseName;
  status.textContent = options.cached
    ? `Showing saved data - refreshing live data...`
    : result.pickSummary?.error
      ? `${result.gameState.gameStatus} - ${result.matches.count} matches - pick activity unavailable`
      : result.gameState.gameStatus === "locked"
        ? `Phase locked - ${result.matches.count} matches`
        : `${getActivePhaseLockText() || result.gameState.gameStatus} - ${result.matches.count} matches`;
  renderLeaderboard(activeLeaderboard);
  renderProfile(activeProfile);
  renderPickHistory(activePickHistory);
  renderPhaseTimeline(activePhases);
  renderMatches(activeMatches, activePicksByMatch);
  renderPlayerSnapshotStats();

  if (activeProfile) {
    document.querySelector("#current-balance").textContent = formatMoney(activeProfile.currentBalance);
  }
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
      : gameState.gameStatus === "locked"
        ? `Phase locked - ${matchesResult.count} matches`
        : `${getActivePhaseLockText() || gameState.gameStatus} - ${matchesResult.count} matches`;
    renderPhaseTimeline(activePhases);
    renderMatches(matchesResult.matches, activePicksByMatch);
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
document.querySelector("#matches-list")?.addEventListener("click", handlePickClick);
document.querySelector("#matches-list")?.addEventListener("change", handleBetAmountInput);
document.querySelector("#matches-list")?.addEventListener("input", handleBetAmountInput);
document.querySelector(".bottom-nav")?.addEventListener("click", (event) => {
  const link = event.target.closest("[data-view]");

  if (!link) {
    return;
  }

  event.preventDefault();
  showView(link.dataset.view);
});

renderPlayer(getSavedPlayer());
showView(location.hash.replace("#", "") || "matches");
loadGameState();
