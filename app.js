const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbzLig-RQTU5eZ56nTvVurhXmAhkbyy12YcTn3cTIFoFbmKDc_vAh4c1pRckPJnleX3XMA/exec",
};

const STORAGE_KEYS = {
  deviceId: "worldCupCashDeviceId",
  player: "worldCupCashPlayer",
};

let activeMatches = [];
let activePicksByMatch = {};
let activeLeaderboard = [];
let activeProfile = null;

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

  return `Saved: ${pick.selectedTeam} for $${pick.totalBetAmount} total bet`;
}

function renderLeaderboard(players = activeLeaderboard) {
  const list = document.querySelector("#leaderboard-list");

  if (!list) {
    return;
  }

  if (!players.length) {
    list.innerHTML = `<p class="empty-state">No players yet.</p>`;
    return;
  }

  list.innerHTML = players
    .map((player) => {
      return `
        <article class="leaderboard-row">
          <div class="rank">${player.rank}</div>
          <div>
            <strong>${player.displayName}</strong>
            <span>${player.wins}W-${player.losses}L-${player.draws}D - ${player.activePickCount} picks</span>
          </div>
          <div class="leaderboard-money">
            <strong>${formatMoney(player.currentBalance)}</strong>
            <span>Potential ${formatMoney(player.potentialPayout, { cents: true })}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderProfile(profile = activeProfile) {
  const summary = document.querySelector("#profile-summary");

  if (!summary) {
    return;
  }

  if (!profile) {
    summary.innerHTML = `<p class="empty-state">Join the game to see your profile.</p>`;
    return;
  }

  const stats = [
    ["Current Balance", formatMoney(profile.currentBalance)],
    ["Available to Bet", formatMoney(profile.availableToBet)],
    ["Pending Bets", formatMoney(profile.pendingBets)],
    ["Potential Payout", formatMoney(profile.potentialPayout, { cents: true })],
    ["Active Picks", profile.activePickCount],
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

  if (!list) {
    return;
  }

  activeMatches = matches;

  list.innerHTML = matches
    .map((match) => {
      const pickDisabled = player ? "" : "disabled";
      const savedPick = picksByMatch[match.matchId];
      const teamASelected = savedPick?.selectedTeam === match.teamASlug ? "selected" : "";
      const teamBSelected = savedPick?.selectedTeam === match.teamBSlug ? "selected" : "";
      const statusText = getPickStatusText(savedPick);

      return `
        <article class="match-card" data-match-id="${match.matchId}">
          <div class="team">
            <span class="team-code">${match.teamA.teamSlug}</span>
            <strong>${match.teamA.team}</strong>
            <span>${match.teamADecimalOdds}x</span>
          </div>
          <div class="match-center">
            <strong>VS</strong>
            <span>${match.matchDateTime}</span>
          </div>
          <div class="team right">
            <span class="team-code">${match.teamB.teamSlug}</span>
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
  const buttons = card.querySelectorAll("[data-selected-team]");

  buttons.forEach((item) => {
    item.disabled = true;
  });
  status.textContent = "Saving pick...";

  try {
    const result = await callApi("savePick", {
      playerId: player.player_id,
      matchId,
      selectedTeam,
      totalBetAmount: 1,
    });

    buttons.forEach((item) => {
      item.classList.toggle("selected", item.dataset.selectedTeam === result.pick.selected_team);
    });

    activePicksByMatch[matchId] = {
      matchId: result.pick.match_id,
      selectedTeam: result.pick.selected_team,
      totalBetAmount: Number(result.pick.total_bet_amount) || 1,
    };
    status.textContent = `Saved: ${result.pick.selected_team} for $1 house bet`;
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
    activeProfile = profileResult.player;
    renderProfile(activeProfile);
    document.querySelector("#current-balance").textContent = formatMoney(activeProfile.currentBalance);
  } catch (error) {
    console.error(error);
  }
}

async function loadGameState() {
  const status = document.querySelector("#phase-status");
  const phaseName = document.querySelector("#phase-name");

  try {
    status.textContent = "Loading live game data...";

    const gameState = await callApi("getGameState");
    const player = getSavedPlayer();
    const matchesResult = await callApi("getMatches", {
      phase: gameState.activePhaseName,
    });
    const picksResult = await loadPlayerPicks(player, gameState.activePhaseName);

    activePicksByMatch = indexPicksByMatch(picksResult.picks);
    await loadSummaryData();

    phaseName.textContent = gameState.activePhaseName;
    status.textContent = picksResult.error
      ? `${gameState.gameStatus} - ${matchesResult.count} matches - saved picks unavailable: ${picksResult.error.message}`
      : `${gameState.gameStatus} - ${matchesResult.count} matches`;
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
