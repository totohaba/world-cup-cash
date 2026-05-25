const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbzmgSpeJ3zAcU6d9hTpZMrGV75sL0tMYLEbAEvembnTQrJ7HjF2GBT0ed49PyumEi-l/exec",
};

const STORAGE_KEYS = {
  deviceId: "worldCupCashDeviceId",
  player: "worldCupCashPlayer",
};

let activeMatches = [];

async function callApi(action, params = {}) {
  const url = new URL(CONFIG.appsScriptUrl);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
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

function renderMatches(matches) {
  const list = document.querySelector("#matches-list");
  const player = getSavedPlayer();

  if (!list) {
    return;
  }

  activeMatches = matches;

  list.innerHTML = matches
    .map((match) => {
      const pickDisabled = player ? "" : "disabled";

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
            <button type="button" data-selected-team="${match.teamASlug}" ${pickDisabled}>
              Pick ${match.teamA.team}
            </button>
            <button type="button" data-selected-team="${match.teamBSlug}" ${pickDisabled}>
              Pick ${match.teamB.team}
            </button>
          </div>
          <p class="pick-status" aria-live="polite"></p>
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
    status.textContent = `Saved: ${result.pick.selected_team} for $1 house bet`;
  } catch (error) {
    console.error(error);
    status.textContent = `Could not save pick: ${error.message}`;
  } finally {
    buttons.forEach((item) => {
      item.disabled = false;
    });
  }
}

async function loadGameState() {
  const status = document.querySelector("#phase-status");
  const phaseName = document.querySelector("#phase-name");

  try {
    status.textContent = "Loading live game data...";

    const gameState = await callApi("getGameState");
    const matchesResult = await callApi("getMatches", {
      phase: gameState.activePhaseName,
    });

    phaseName.textContent = gameState.activePhaseName;
    status.textContent = `${gameState.gameStatus} - ${matchesResult.count} matches`;
    renderMatches(matchesResult.matches);
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load live data. Check the Apps Script deployment.";
  }
}

document.querySelector("#refresh-button")?.addEventListener("click", loadGameState);
document.querySelector("#join-form")?.addEventListener("submit", handleJoinSubmit);
document.querySelector("#matches-list")?.addEventListener("click", handlePickClick);

renderPlayer(getSavedPlayer());
loadGameState();
